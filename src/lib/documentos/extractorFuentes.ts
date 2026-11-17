/**
 * Extracción server-side de contenido real desde fuentes aportadas por el
 * usuario: enlaces web, artículos, documentación y repositorios de GitHub.
 *
 * Cada función devuelve SIEMPRE un resultado utilizable (con un aviso limpio
 * si la fuente falla o está bloqueada) para no detener la generación del
 * documento. El texto obtenido se usa como base de conocimiento en Gemini.
 */

export interface FuenteUrlExtraida {
  url: string;
  titulo: string;
  contenido: string;
}

const TIMEOUT_MS = 12_000;
const MAX_CARACTERES_POR_ENLACE = 12_000;
const MAX_TITULO = 200;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const PATRON_GITHUB = /^https?:\/\/(www\.)?github\.com\//i;

/** Resultado de respaldo cuando una fuente no se puede extraer. */
function avisoFuente(url: string, motivo: string): FuenteUrlExtraida {
  return {
    url,
    titulo: "Fuente no disponible",
    contenido: `[Aviso: no se pudo extraer contenido de ${url || "(dirección vacía)"}. Motivo: ${motivo}. El trabajo se generará sin esta fuente.]`,
  };
}

/* ------------------------------------------------------------------ */
/*  Punto de entrada                                                    */
/* ------------------------------------------------------------------ */

export async function extraerContenidoUrl(
  url: string
): Promise<FuenteUrlExtraida> {
  const urlLimpia = (url ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(urlLimpia)) {
    return avisoFuente(
      urlLimpia,
      "la dirección no es una URL http/https válida"
    );
  }
  if (PATRON_GITHUB.test(urlLimpia)) {
    return extraerRepositorioGithub(urlLimpia);
  }
  return extraerPaginaWeb(urlLimpia);
}

/* ------------------------------------------------------------------ */
/*  Descarga con límite de tiempo y User-Agent estándar                 */
/* ------------------------------------------------------------------ */

async function obtenerTexto(
  url: string
): Promise<{ texto: string; tipo: string }> {
  const respuesta = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html, text/plain, text/markdown, */*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status}`);
  }
  return {
    texto: await respuesta.text(),
    tipo: (respuesta.headers.get("content-type") ?? "").toLowerCase(),
  };
}

/* ------------------------------------------------------------------ */
/*  Repositorios de GitHub: README.md desde raw o desde el HTML         */
/* ------------------------------------------------------------------ */

function datosRepoGithub(url: string): { usuario: string; repo: string } | null {
  try {
    const { pathname } = new URL(url);
    const partes = pathname.split("/").filter(Boolean);
    if (partes.length < 2) return null;
    const usuario = partes[0];
    const repo = partes[1].replace(/\.git$/i, "");
    if (!usuario || !repo) return null;
    return { usuario, repo };
  } catch {
    return null;
  }
}

async function extraerRepositorioGithub(
  url: string
): Promise<FuenteUrlExtraida> {
  const datos = datosRepoGithub(url);
  if (!datos) {
    return avisoFuente(
      url,
      "no se pudo identificar el repositorio (formato esperado: github.com/usuario/repo)"
    );
  }
  const nombreRepo = `${datos.usuario}/${datos.repo}`;

  /* 1. README.md en bruto desde raw.githubusercontent.com (main/master). */
  for (const rama of ["main", "master"]) {
    for (const nombre of ["README.md", "readme.md"]) {
      try {
        const { texto } = await obtenerTexto(
          `https://raw.githubusercontent.com/${nombreRepo}/${rama}/${nombre}`
        );
        const contenido = recortar(texto);
        if (contenido.trim()) {
          return {
            url,
            titulo: `Repositorio GitHub: ${nombreRepo}`,
            contenido,
          };
        }
      } catch {
        /* Probar la siguiente combinación rama/archivo. */
      }
    }
  }

  /* 2. Respaldo: HTML de la página del repositorio (artículo del README). */
  try {
    const { texto: html } = await obtenerTexto(url);
    const articulo = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    const titulo =
      tituloDeHtml(html) || `Repositorio GitHub: ${nombreRepo}`;
    const contenido = recortar(limpiarHtml(articulo));
    if (contenido.trim()) {
      return { url, titulo, contenido };
    }
    return avisoFuente(
      url,
      "el repositorio existe pero no tiene README ni contenido legible"
    );
  } catch (error) {
    return avisoFuente(url, motivoDeError(error));
  }
}

/* ------------------------------------------------------------------ */
/*  Páginas web genéricas                                               */
/* ------------------------------------------------------------------ */

async function extraerPaginaWeb(url: string): Promise<FuenteUrlExtraida> {
  try {
    const { texto, tipo } = await obtenerTexto(url);

    if (/pdf|image|octet-stream|zip|audio|video/.test(tipo)) {
      return avisoFuente(
        url,
        "el enlace apunta a un archivo binario que no es una página web legible"
      );
    }

    if (tipo.includes("text/plain") || tipo.includes("text/markdown")) {
      const contenido = recortar(texto);
      if (!contenido.trim()) {
        return avisoFuente(url, "el recurso está vacío");
      }
      return { url, titulo: dominioDe(url), contenido };
    }

    const titulo = tituloDeHtml(texto) || dominioDe(url);
    const contenido = recortar(limpiarHtml(texto));
    if (!contenido.trim()) {
      return avisoFuente(
        url,
        "la página no devolvió texto legible (posible bloqueo, contenido dinámico o muro de pago)"
      );
    }
    return { url, titulo, contenido };
  } catch (error) {
    return avisoFuente(url, motivoDeError(error));
  }
}

/* ------------------------------------------------------------------ */
/*  Limpieza de HTML y utilidades de texto                              */
/* ------------------------------------------------------------------ */

function limpiarHtml(html: string): string {
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|footer|header|aside|form|svg|iframe|button)[\s\S]*?<\/\1>/gi, " ")
      .replace(
        /<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/article|\/table|\/blockquote|\/pre)>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((linea) => linea.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function tituloDeHtml(html: string): string {
  const crudo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const titulo = decodificarEntidades(crudo)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITULO);
  return titulo;
}

function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function recortar(texto: string): string {
  const limpio = decodificarEntidades(texto.replace(/\r\n/g, "\n")).trim();
  if (limpio.length <= MAX_CARACTERES_POR_ENLACE) return limpio;
  return `${limpio.slice(
    0,
    MAX_CARACTERES_POR_ENLACE
  )}\n\n[Nota: el contenido de este enlace fue recortado por longitud.]`;
}

function motivoDeError(error: unknown): string {
  const texto = (
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  ).toLowerCase();
  if (texto.includes("timeout") || texto.includes("abort")) {
    return "tiempo de espera agotado (12 s)";
  }
  if (texto.includes("http 404") || texto.includes("http 410")) {
    return "el enlace no existe (404)";
  }
  if (texto.includes("http 403") || texto.includes("http 401") || texto.includes("http 429")) {
    return "el sitio bloqueó la descarga automática";
  }
  if (texto.includes("http 5")) {
    return "el servidor del sitio reportó un error";
  }
  if (
    texto.includes("fetch failed") ||
    texto.includes("network") ||
    texto.includes("enotfound") ||
    texto.includes("econnrefused")
  ) {
    return "no se pudo conectar con el sitio";
  }
  return "error desconocido al descargar el enlace";
}
