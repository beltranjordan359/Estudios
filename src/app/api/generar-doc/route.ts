import type { NextRequest } from "next/server";
import {
  extraerContenidoUrl,
  type FuenteUrlExtraida,
} from "@/lib/documentos/extractorFuentes";
import { generarDocumento } from "@/lib/ia/gemini";
import type { NormaFormato, PeticionGeneracion } from "@/types/documento";

function esNorma(valor: unknown): valor is NormaFormato {
  return valor === "apa7" || valor === "ieee";
}

const MAX_ENLACES = 8;
const MAX_TEXTOS_FUENTE = 10;
const MAX_CARACTERES_FUENTES = 60_000;

function construirBloqueFuentes(
  fuentesWeb: FuenteUrlExtraida[],
  textosFuentes: { nombre: string; contenido: string }[]
): string {
  if (fuentesWeb.length === 0 && textosFuentes.length === 0) return "";
  const partes: string[] = [
    "=== FUENTES DE INFORMACIÓN APORTADAS POR EL USUARIO (BASE DE CONOCIMIENTO) ===",
    "El usuario aportó las siguientes fuentes reales (enlaces web, repositorios de GitHub y documentos propios). Úsalas como base de conocimiento principal del trabajo: el contenido, los datos, la terminología y las referencias deben apoyarse en esta información y ser fieles a ella. No repliques la estructura ni el formato de estas fuentes: son material informativo, no una plantilla.",
  ];
  fuentesWeb.forEach((fuente, i) => {
    partes.push(
      `--- FUENTE WEB ${i + 1}: ${fuente.titulo} (${fuente.url}) ---`,
      fuente.contenido
    );
  });
  textosFuentes.forEach((texto, i) => {
    partes.push(`--- DOCUMENTO APORTADO ${i + 1}: ${texto.nombre} ---`, texto.contenido);
  });
  partes.push("=== FIN DE LAS FUENTES DE INFORMACIÓN ===");
  const bloque = partes.join("\n");
  if (bloque.length <= MAX_CARACTERES_FUENTES) return bloque;
  return `${bloque.slice(0, MAX_CARACTERES_FUENTES)}\n\n[Nota: las fuentes de información fueron recortadas por longitud.]`;
}

export async function POST(request: NextRequest) {
  const inicio = Date.now();
  try {
    const cuerpo = (await request.json()) as Partial<PeticionGeneracion>;

    if (!esNorma(cuerpo.norma)) {
      return Response.json(
        { error: "Debes elegir una norma válida: 'apa7' o 'ieee'." },
        { status: 400 }
      );
    }
    if (!cuerpo.tema || typeof cuerpo.tema !== "string" || cuerpo.tema.trim().length < 5) {
      return Response.json(
        { error: "El tema del trabajo es obligatorio (mínimo 5 caracteres)." },
        { status: 400 }
      );
    }
    const paginas = Number(cuerpo.paginas);
    if (!Number.isFinite(paginas) || paginas < 2 || paginas > 30) {
      return Response.json(
        { error: "La extensión debe estar entre 2 y 30 páginas." },
        { status: 400 }
      );
    }
    const portada = cuerpo.portada;
    if (!portada || typeof portada !== "object") {
      return Response.json(
        { error: "Los datos de portada son obligatorios." },
        { status: 400 }
      );
    }
    if (!portada.titulo?.trim() || !portada.autor?.trim() || !portada.institucion?.trim()) {
      return Response.json(
        { error: "Título, autor e institución son obligatorios para la portada." },
        { status: 400 }
      );
    }

    const enlacesFuentes = Array.isArray(cuerpo.enlacesFuentes)
      ? cuerpo.enlacesFuentes
          .filter(
            (enlace): enlace is string =>
              typeof enlace === "string" && /^https?:\/\//i.test(enlace.trim())
          )
          .map((enlace) => enlace.trim())
          .slice(0, MAX_ENLACES)
      : [];
    const textosFuentes = Array.isArray(cuerpo.textosFuentes)
      ? cuerpo.textosFuentes
          .filter(
            (texto) =>
              texto &&
              typeof texto.nombre === "string" &&
              typeof texto.contenido === "string" &&
              texto.contenido.trim().length > 0
          )
          .slice(0, MAX_TEXTOS_FUENTE)
          .map((texto) => ({
            nombre: texto.nombre.slice(0, 200),
            contenido: texto.contenido.slice(0, 15_000),
          }))
      : [];

    /* Extracción de enlaces en paralelo: un enlace que falla no detiene
       el resto ni la generación del documento. */
    const resultadosEnlaces = await Promise.allSettled(
      enlacesFuentes.map((enlace) => extraerContenidoUrl(enlace))
    );
    const fuentesWeb: FuenteUrlExtraida[] = resultadosEnlaces.map(
      (resultado, i) => {
        if (resultado.status === "fulfilled") return resultado.value;
        return {
          url: enlacesFuentes[i],
          titulo: "Fuente no disponible",
          contenido: `[Aviso: no se pudo extraer contenido de ${enlacesFuentes[i]}. El trabajo se generará sin esta fuente.]`,
        };
      }
    );
    const enlacesOk = fuentesWeb.filter(
      (f) => !f.titulo.startsWith("Fuente no disponible")
    ).length;

    const bloqueFuentes = construirBloqueFuentes(fuentesWeb, textosFuentes);
    const instruccionesFinales = [
      typeof cuerpo.instrucciones === "string" ? cuerpo.instrucciones.slice(0, 2000) : "",
      bloqueFuentes,
    ]
      .filter(Boolean)
      .join("\n\n");

    const peticion: PeticionGeneracion = {
      norma: cuerpo.norma,
      tema: cuerpo.tema.trim(),
      instrucciones: instruccionesFinales,
      paginas: Math.round(paginas),
      portada: {
        titulo: portada.titulo.trim(),
        autor: portada.autor.trim() || "Autor",
        institucion: portada.institucion.trim() || "Institución",
        curso: (portada.curso ?? "").trim(),
        profesor: (portada.profesor ?? "").trim(),
        ciudad: (portada.ciudad ?? "").trim(),
        fecha: (portada.fecha ?? "").trim(),
      },
      textoReferencia:
        typeof cuerpo.textoReferencia === "string" && cuerpo.textoReferencia.trim()
          ? cuerpo.textoReferencia.slice(0, 18_000)
          : undefined,
    };

    const documento = await generarDocumento(peticion);
    console.log(
      `[/api/generar-doc] documento OK (${documento.secciones.length} secciones, ${peticion.textoReferencia ? "con documento de referencia" : "sin referencia"}, ${enlacesOk}/${enlacesFuentes.length} enlaces extraídos, ${textosFuentes.length} documentos aportados) en ${((Date.now() - inicio) / 1000).toFixed(1)}s`
    );
    return Response.json({ documento });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error inesperado al generar el documento.";
    console.error(
      `[/api/generar-doc] ERROR tras ${((Date.now() - inicio) / 1000).toFixed(1)}s:`,
      error
    );
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
