import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type {
  DocumentoEstructurado,
  NormaFormato,
  PeticionGeneracion,
  SeccionDoc,
} from "@/types/documento";
import type {
  Cuestionario,
  DificultadCuestionario,
  EvaluacionAbierta,
  PeticionEvaluacionAbierta,
  PeticionEstudio,
  PreguntaCuestionario,
  ResultadoEvaluacionAbierta,
  ResumenEstructurado,
  TipoCuestionario,
} from "@/types/estudio";

const MODELO_POR_DEFECTO = "gemini-3.8-flash";

const PLACEHOLDERS_API_KEY = new Set([
  "tu_api_key_aqui",
  "pega_aqui_tu_api_key",
  "",
]);

function obtenerCliente(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || PLACEHOLDERS_API_KEY.has(apiKey.toLowerCase())) {
    throw new Error(
      "Falta tu GEMINI_API_KEY. Pega tu clave real en el archivo .env.local (GEMINI_API_KEY=...) y reinicia el servidor. Puedes obtenerla gratis en https://aistudio.google.com/apikey"
    );
  }
  return new GoogleGenAI({
    apiKey,
    // Límite HTTP holgado para documentos largos y sin reintentos automáticos
    // del SDK (por defecto hace 5 reintentos con esperas de hasta 60 s cada uno).
    httpOptions: {
      timeout: 120_000,
      retryOptions: { attempts: 0 },
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Tiempos límite y modelos de respaldo                               */
/* ------------------------------------------------------------------ */

/** Límite máximo para las llamadas de estudio (25 s). */
const TIMEOUT_ESTUDIO_MS = 25_000;
/** Límite para documentos largos: 110 s (el cliente aborta a los 150 s). */
const TIMEOUT_DOCUMENTO_MS = 110_000;

/** Modelos de respaldo fijos si no se puede consultar la lista de modelos. */
const MODELOS_FALLBACK = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

/* ------------------------------------------------------------------ */
/*  Detección automática de modelos disponibles (con caché en memoria) */
/*  y orden de prioridad por cuota gratuita:                           */
/*  1º flash-lite (cuota más alta) · 2º flash estable                  */
/* ------------------------------------------------------------------ */

interface CacheModelos {
  lista: string[];
  expiraEn: number;
}

const CACHE_MODELOS_MS = 10 * 60_000;

let cacheModelos: CacheModelos | null = null;

/** Modelos con cuota 0 (o no aptos para texto) en el tier gratuito. */
const PATRON_EXCLUIR =
  /pro|exp|preview|image|audio|tts|embed|transcribe|robotics|omni|banana|aqa|dream/;

function puntuacionModelo(nombre: string): number {
  const version = nombre.match(/\d+(?:\.\d+)?/)?.[0];
  return version ? parseFloat(version) : 0;
}

function porVersionDesc(a: string, b: string): number {
  return puntuacionModelo(b) - puntuacionModelo(a);
}

/**
 * Ordena los modelos por cuota gratuita: primero variantes flash-lite,
 * después flash estándar estable; descarta pro/exp/preview/image/audio/tts.
 */
function ordenarPorCuota(disponibles: string[]): string[] {
  const lites: string[] = [];
  const flashes: string[] = [];
  const otros: string[] = [];
  const vistos = new Set<string>();

  for (const nombre of disponibles) {
    if (!nombre || vistos.has(nombre)) continue;
    vistos.add(nombre);
    const minusculas = nombre.toLowerCase();
    if (PATRON_EXCLUIR.test(minusculas)) continue;
    if (minusculas.includes("flash-lite")) lites.push(nombre);
    else if (minusculas.includes("flash")) flashes.push(nombre);
    else otros.push(nombre);
  }

  lites.sort(porVersionDesc);
  flashes.sort(porVersionDesc);
  return [...lites, ...flashes, ...otros];
}

function listaModelosFija(): string[] {
  const primario = obtenerModelo();
  return [primario, ...MODELOS_FALLBACK.filter((m) => m !== primario)];
}

/**
 * Consulta los modelos disponibles para la API Key actual (ai.models.list()),
 * filtra los que soportan generateContent y devuelve la lista ordenada por
 * cuota gratuita (flash-lite primero). Cacheada 10 minutos en memoria.
 */
async function listaModelosDisponibles(ai: GoogleGenAI): Promise<string[]> {
  const ahora = Date.now();

  if (cacheModelos && ahora < cacheModelos.expiraEn) {
    return cacheModelos.lista;
  }

  try {
    const pager = await ai.models.list({ config: { queryBase: true } });
    const disponibles: string[] = [];
    for await (const modelo of pager) {
      const nombre = modelo.name?.replace(/^models\//, "").trim();
      if (!nombre) continue;
      if (!(modelo.supportedActions ?? []).includes("generateContent")) {
        continue;
      }
      disponibles.push(nombre);
    }

    const ordenados = ordenarPorCuota(disponibles);
    if (ordenados.length === 0) {
      throw new Error("No hay modelos de texto disponibles para tu API Key.");
    }

    cacheModelos = { lista: ordenados, expiraEn: ahora + CACHE_MODELOS_MS };
    console.log(
      `[Gemini] Modelos aptos para texto: ${ordenados.length}. Orden de prueba: ${ordenados.slice(0, 5).join(", ")}${ordenados.length > 5 ? ", …" : ""}`
    );
    return ordenados;
  } catch (error) {
    console.error(
      "[Gemini] No se pudo consultar la lista de modelos de tu API Key; se usará la lista de respaldo fija.",
      error
    );
    return listaModelosFija();
  }
}

/**
 * Traduce los errores comunes de la API de Gemini a mensajes claros en español.
 */
function traducirErrorIA(error: unknown): Error {
  const texto = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).toLowerCase();

  if (texto.includes("timeout") || texto.includes("aborted") || texto.includes("abort")) {
    return new Error(
      "La llamada a la IA tardó demasiado y fue cancelada. Inténtalo de nuevo; si persiste, usa un material más corto o una extensión menor."
    );
  }
  if (
    texto.includes("404") ||
    texto.includes("not_found") ||
    texto.includes("not found") ||
    texto.includes("does not exist") ||
    texto.includes("is not supported")
  ) {
    return new Error(
      "El modelo configurado no está disponible para tu clave de API. Cambia GEMINI_MODEL en .env.local (por ejemplo: gemini-2.5-flash) y reinicia el servidor."
    );
  }
  if (
    texto.includes("429") ||
    texto.includes("resource_exhausted") ||
    texto.includes("quota") ||
    texto.includes("rate limit")
  ) {
      return new Error(
        "Se superó la cuota gratuita de la API de Gemini en todos los modelos disponibles (demasiadas peticiones). Espera un minuto e inténtalo de nuevo."
      );
  }
  if (
    texto.includes("401") ||
    texto.includes("403") ||
    texto.includes("api_key_invalid") ||
    texto.includes("api key not valid") ||
    texto.includes("permission denied") ||
    texto.includes("unregistered")
  ) {
    return new Error(
      "La GEMINI_API_KEY no es válida o no tiene permiso. Revisa que pegaste la clave completa y correcta en .env.local y reinicia el servidor."
    );
  }
  if (texto.includes("503") || texto.includes("overloaded") || texto.includes("unavailable")) {
    return new Error(
      "El modelo de IA está saturado en este momento. Espera unos segundos y vuelve a intentarlo."
    );
  }
  if (texto.includes("500") || texto.includes("internal error")) {
    return new Error(
      "Error interno del servidor de Gemini. Reintenta; si persiste, prueba con un tema más corto."
    );
  }
  if (texto.includes("fetch failed") || texto.includes("network") || texto.includes("enotfound")) {
    return new Error(
      "No se pudo conectar con el servicio de Gemini. Verifica tu conexión a internet e inténtalo de nuevo."
    );
  }
  return error instanceof Error ? error : new Error("Error inesperado al comunicarse con la IA.");
}

/* ------------------------------------------------------------------ */
/*  Motor de llamadas: timeout + fallback de modelos + reintentos      */
/*  acotados (nunca en bucle infinito) y registro en consola           */
/* ------------------------------------------------------------------ */

function conTimeout<T>(
  promesa: Promise<T>,
  ms: number,
  etiqueta: string
): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencimiento = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () =>
        rechazar(
          new Error(
            `TIMEOUT: la operación "${etiqueta}" superó ${Math.round(ms / 1000)} s.`
          )
        ),
      ms
    );
  });
  return Promise.race([promesa, vencimiento]).finally(() =>
    clearTimeout(temporizador)
  ) as Promise<T>;
}

interface OpcionesLlamada {
  etiqueta: string;
  timeoutMs?: number;
}

async function llamadaIA(
  crearLlamada: (modelo: string) => Promise<string | null | undefined>,
  opciones: OpcionesLlamada,
  ai: GoogleGenAI
): Promise<string> {
  const { etiqueta, timeoutMs = TIMEOUT_ESTUDIO_MS } = opciones;
  const esTimeout = (t: string) =>
    t.includes("timeout") || t.includes("aborted") || t.includes("abort");
  const es404 = (t: string) =>
    t.includes("404") ||
    t.includes("not_found") ||
    t.includes("not found") ||
    t.includes("does not exist") ||
    t.includes("is not supported");
  const esCuota = (t: string) =>
    t.includes("429") ||
    t.includes("resource_exhausted") ||
    t.includes("quota") ||
    t.includes("rate limit");
  const esAuth = (t: string) =>
    t.includes("401") ||
    t.includes("403") ||
    t.includes("api_key_invalid") ||
    t.includes("permission denied");

  let ultimoError: unknown = null;

  /* Máximo: modelos detectados × 2 intentos = llamadas acotadas. Nunca en bucle. */
  for (const modelo of await listaModelosDisponibles(ai)) {
    for (let intento = 1; intento <= 2; intento++) {
      const inicio = Date.now();
      console.log(
        `[Gemini] ${etiqueta} ▶ modelo=${modelo} intento=${intento} (thinkingBudget: 0)`
      );
      try {
        const texto = await conTimeout(
          crearLlamada(modelo),
          timeoutMs,
          etiqueta
        );
        const limpio = texto?.trim();
        if (!limpio) {
          throw new Error("La IA no devolvió contenido. Inténtalo de nuevo.");
        }
        console.log(
          `[Gemini] ${etiqueta} ✔ ${((Date.now() - inicio) / 1000).toFixed(1)}s · modelo=${modelo} · ${limpio.length} caracteres`
        );
        return limpio;
      } catch (error) {
        ultimoError = error;
        const mensaje =
          error instanceof Error ? error.message : String(error);
        const texto = (
          error instanceof Error ? `${error.name}: ${error.message}` : mensaje
        ).toLowerCase();
        console.error(
          `[Gemini] ${etiqueta} ✖ ${((Date.now() - inicio) / 1000).toFixed(1)}s · ${modelo}: ${mensaje}`
        );

        /* Timeout: abortar todo (reintentar duplicaría la espera). */
        if (esTimeout(texto)) throw traducirErrorIA(error);
        /* Autenticación: cambiar de modelo no ayuda (misma API Key). */
        if (esAuth(texto)) throw traducirErrorIA(error);
        /* Modelo inexistente o cuota agotada: probar INMEDIATAMENTE el
           siguiente modelo de la lista (fallback en cadena). */
        if (es404(texto) || esCuota(texto)) break;
        /* Error transitorio: un único reintento y luego siguiente modelo. */
        if (intento === 1) continue;
        break;
      }
    }
  }

  console.error(
    `[Gemini] ${etiqueta} ✖✖ TODOS los modelos de la lista fallaron. Error técnico completo:`,
    ultimoError
  );
  throw traducirErrorIA(ultimoError);
}

/**
 * Parsea la respuesta JSON de la IA con mensaje claro si el formato es inválido.
 */
function parsearJsonIA<T>(texto: string): T {
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(
      "La IA devolvió un formato inesperado (JSON inválido). Inténtalo de nuevo; si persiste, reduce la extensión o simplifica el tema."
    );
  }
}

function obtenerModelo(): string {
  return process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;
}

/* ------------------------------------------------------------------ */
/*  Esquemas JSON estrictos                                            */
/* ------------------------------------------------------------------ */

const esquemaTabla: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: {
      type: Type.STRING,
      description: "Título breve y descriptivo de la tabla.",
    },
    fuente: {
      type: Type.STRING,
      description: "Fuente de los datos, si aplica (opcional).",
    },
    encabezados: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Encabezados de las columnas de la tabla.",
    },
    filas: {
      type: Type.ARRAY,
      items: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      description:
        "Filas de datos reales, precisos y completos. Cada fila es un arreglo de celdas con EXACTAMENTE la misma cantidad de elementos que 'encabezados'.",
    },
  },
  required: ["titulo", "encabezados", "filas"],
};

const esquemaFigura: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: {
      type: Type.STRING,
      description: "Título breve de la figura o diagrama.",
    },
    descripcionVisual: {
      type: Type.STRING,
      description:
        "Descripción precisa de qué debe mostrar el diagrama: elementos, relaciones y flujo.",
    },
    pieDeFigura: {
      type: Type.STRING,
      description: "Texto del pie de figura que explica el diagrama.",
    },
    tipoDiagrama: {
      type: Type.STRING,
      description:
        "Tipo de diagrama. Uno de: 'flujo', 'arquitectura', 'comparativo', 'esquema'.",
    },
    nodos: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Conceptos o elementos clave que aparecen en el diagrama, en orden lógico.",
    },
  },
  required: ["titulo", "descripcionVisual", "pieDeFigura"],
};

const esquemaSeccion: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: { type: Type.STRING, description: "Título de la sección." },
    parrafos: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Párrafos completos y desarrollados de la sección. Cada párrafo es un texto continuo sin saltos de línea.",
    },
    subsecciones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          titulo: { type: Type.STRING },
          parrafos: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["titulo", "parrafos"],
      },
    },
    tablas: {
      type: Type.ARRAY,
      items: esquemaTabla,
      description:
        "Tablas de datos de esta sección, solo si el tema o las instrucciones del profesor las requieren. Las filas deben contener datos reales, precisos y completos.",
    },
    figuras: {
      type: Type.ARRAY,
      items: esquemaFigura,
      description:
        "Figuras o diagramas de esta sección, solo si el tema o las instrucciones del profesor las requieren (imágenes, gráficos, diagramas de flujo, arquitectura, etc.).",
    },
  },
  required: ["titulo", "parrafos"],
};

const esquemaDocumento: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: {
      type: Type.STRING,
      description:
        "Título formal del trabajo, en mayúscula inicial por palabra relevante.",
    },
    abstract: {
      type: Type.STRING,
      description:
        "Resumen académico de 150 a 250 palabras en un solo párrafo. Solo para formato IEEE.",
    },
    palabrasClave: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "De 4 a 8 términos (Index Terms). Solo para formato IEEE.",
    },
    resumen: {
      type: Type.STRING,
      description:
        "Resumen de 150 a 200 palabras en un solo párrafo. Solo para formato APA 7.",
    },
    secciones: {
      type: Type.ARRAY,
      items: esquemaSeccion,
      description:
        "Secciones principales del trabajo con todo su contenido desarrollado.",
    },
    referencias: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Entre 5 y 10 referencias académicas verosímiles. En APA 7 con formato APA completo; para IEEE incluir el formato estilo IEEE (autor, título, fuente, año).",
    },
  },
  required: ["titulo", "secciones", "referencias"],
};

const esquemaPreguntaMixta: Schema = {
  type: Type.OBJECT,
  properties: {
    pregunta: { type: Type.STRING, description: "Enunciado de la pregunta." },
    tipo: {
      type: Type.STRING,
      description:
        "Tipo de pregunta: 'multiple' (opción múltiple) o 'abierta' (de desarrollo).",
    },
    opciones: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Si tipo='multiple': exactamente 4 opciones de respuesta. Si tipo='abierta': arreglo vacío [].",
    },
    respuestaCorrecta: {
      type: Type.INTEGER,
      description:
        "Si tipo='multiple': índice (0 a 3) de la opción correcta dentro de 'opciones'. Si tipo='abierta': -1.",
    },
    explicacion: {
      type: Type.STRING,
      description: "Breve explicación de la respuesta correcta, basada en el material.",
    },
    respuestaModelo: {
      type: Type.STRING,
      description:
        "Si tipo='abierta': respuesta ideal redactada (2 a 4 oraciones). Si tipo='multiple': cadena vacía ''.",
    },
    criteriosClave: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Si tipo='abierta': de 3 a 5 criterios clave medibles que la respuesta del estudiante debe cubrir. Si tipo='multiple': arreglo vacío [].",
    },
  },
  required: [
    "pregunta",
    "tipo",
    "opciones",
    "respuestaCorrecta",
    "explicacion",
    "respuestaModelo",
    "criteriosClave",
  ],
};

const esquemaCuestionario: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: { type: Type.STRING, description: "Título del cuestionario." },
    preguntas: {
      type: Type.ARRAY,
      items: esquemaPreguntaMixta,
      description:
        "Preguntas basadas estrictamente en el texto, del tipo y dificultad indicados.",
    },
  },
  required: ["titulo", "preguntas"],
};

const esquemaEvaluacion: Schema = {
  type: Type.OBJECT,
  properties: {
    notaFinal: {
      type: Type.NUMBER,
      description: "Calificación final promedio de todas las respuestas, de 0 a 10.",
    },
    evaluaciones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nota: {
            type: Type.NUMBER,
            description: "Calificación de esta respuesta, de 0 a 10.",
          },
          aciertos: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Ideas, conceptos o criterios clave que la respuesta del estudiante sí cubrió correctamente.",
          },
          faltantes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Criterios clave o ideas importantes que la respuesta del estudiante omitió o erró.",
          },
          comentario: {
            type: Type.STRING,
            description: "Comentario breve (1-3 oraciones) sobre la calidad de la redacción.",
          },
          explicacionIdeal: {
            type: Type.STRING,
            description:
              "La respuesta ideal completa y bien desarrollada, en 2 a 5 oraciones.",
          },
        },
        required: [
          "nota",
          "aciertos",
          "faltantes",
          "comentario",
          "explicacionIdeal",
        ],
      },
    },
  },
  required: ["notaFinal", "evaluaciones"],
};

const esquemaResumen: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: { type: Type.STRING, description: "Título temático del resumen." },
    ideaPrincipal: {
      type: Type.STRING,
      description: "La idea central del material en una o dos oraciones.",
    },
    puntosClave: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Entre 6 y 12 puntos clave concretos y explicados.",
    },
    conceptosClave: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          termino: { type: Type.STRING },
          definicion: { type: Type.STRING },
        },
        required: ["termino", "definicion"],
      },
      description: "Glosario de 5 a 10 conceptos y términos importantes.",
    },
    conclusiones: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "De 3 a 6 conclusiones o ideas para repasar antes del examen.",
    },
  },
  required: ["titulo", "ideaPrincipal", "puntosClave", "conceptosClave", "conclusiones"],
};

/* ------------------------------------------------------------------ */
/*  Generación de documentos académicos (APA 7 / IEEE)                 */
/*  Modo simple (paginas < 4) y modo multi-paso (paginas >= 4) con     */
/*  garantía de extensión mínima y variación investigativa única.      */
/* ------------------------------------------------------------------ */

const TIMEOUT_PLAN_MS = 45_000;
const TIMEOUT_BLOQUE_MS = 70_000;
const CONCURRENCIA_BLOQUES = 3;
const PALABRAS_POR_BLOQUE = 2_200;
const UMBRAL_EXTENSION = 0.85;

/** Palabras mínimas obligatorias según norma:
    APA 7 ≈ 280/página (Times New Roman 12 pt, doble interlineado);
    IEEE ≈ 600/página (Times New Roman 10 pt, doble columna). */
function palabrasMinimasDe(norma: NormaFormato, paginas: number): number {
  return paginas * (norma === "apa7" ? 280 : 600);
}

const ENFOQUES_ACADEMICOS = [
  "análisis crítico-comparativo (contrasta teorías, enfoques o propuestas y emite juicios fundamentados)",
  "arquitectura e implementación técnica (diseño, componentes, proceso de construcción y herramientas)",
  "evolución histórica y estado del arte (hitos, autores clave, tendencias y líneas abiertas)",
  "estudio de impacto y casos aplicados (efectos reales, sectores beneficiados o afectados, ejemplos concretos)",
  "evaluación metodológica (métodos, instrumentos, criterios de calidad, validación y limitaciones)",
];

let contadorEnfoques = 0;

/** Enfoque rotativo + ID temporal: dos peticiones con el mismo tema
    producen trabajos con enfoque, organización y redacción distintas. */
function seleccionarEnfoque(): string {
  const indice =
    (Math.floor(Date.now() / 1000) + contadorEnfoques++) %
    ENFOQUES_ACADEMICOS.length;
  return ENFOQUES_ACADEMICOS[indice];
}

function crearIdVariacion(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Detecta fuentes del usuario (campos explícitos o bloque inyectado
    por /api/generar-doc en las instrucciones). */
function tieneFuentes(peticion: PeticionGeneracion): boolean {
  return (
    (peticion.enlacesFuentes?.length ?? 0) > 0 ||
    (peticion.textosFuentes?.length ?? 0) > 0 ||
    (peticion.instrucciones?.includes("FUENTES DE INFORMACIÓN APORTADAS") ??
      false)
  );
}

function palabrasSeccion(seccion: SeccionDoc): number {
  const texto = [
    ...(seccion.parrafos ?? []),
    ...(seccion.subsecciones ?? []).flatMap((sub) => sub.parrafos ?? []),
  ].join(" ");
  return texto.split(/\s+/).filter(Boolean).length;
}

function contarPalabrasSecciones(secciones: SeccionDoc[]): number {
  return secciones.reduce((total, s) => total + palabrasSeccion(s), 0);
}

interface PlanSeccion {
  titulo: string;
  metaPalabras: number;
  subsecciones?: { titulo: string; metaPalabras: number }[];
}

interface PlanDocumento {
  titulo: string;
  abstract?: string;
  resumen?: string;
  palabrasClave?: string[];
  referencias: string[];
  secciones: PlanSeccion[];
}

const esquemaPlan: Schema = {
  type: Type.OBJECT,
  properties: {
    titulo: {
      type: Type.STRING,
      description: "Título formal del trabajo.",
    },
    abstract: {
      type: Type.STRING,
      description: "Resumen de 150 a 250 palabras en un solo párrafo. Solo para formato IEEE.",
    },
    palabrasClave: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "De 4 a 8 términos (Index Terms). Solo para formato IEEE.",
    },
    resumen: {
      type: Type.STRING,
      description: "Resumen de 150 a 200 palabras en un solo párrafo. Solo para formato APA 7.",
    },
    referencias: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Entre 5 y 10 referencias. Si el usuario aportó fuentes (URLs, repositorios, libros), deben incluirse obligatoriamente y en formato real APA 7 o IEEE; si no, referencias académicas verosímiles en el formato correspondiente.",
    },
    secciones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          titulo: { type: Type.STRING, description: "Título de la sección." },
          metaPalabras: {
            type: Type.INTEGER,
            description: "Palabras objetivo que deberá desarrollar esta sección.",
          },
          subsecciones: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                titulo: { type: Type.STRING },
                metaPalabras: { type: Type.INTEGER },
              },
              required: ["titulo", "metaPalabras"],
            },
            description: "Subsecciones con sus metas de palabras, solo en secciones extensas.",
          },
        },
        required: ["titulo", "metaPalabras"],
      },
      description: "Secciones del trabajo con su meta de palabras. La suma de metas debe cubrir el mínimo obligatorio.",
    },
  },
  required: ["titulo", "referencias", "secciones"],
};

const esquemaBloqueSecciones: Schema = {
  type: Type.OBJECT,
  properties: {
    secciones: {
      type: Type.ARRAY,
      items: esquemaSeccion,
      description:
        "Las secciones solicitadas, completas, en el mismo orden en que se pidieron.",
    },
  },
  required: ["secciones"],
};

interface ConfigLlamada {
  responseMimeType: string;
  responseSchema: Schema;
  temperature: number;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
  thinkingConfig: { thinkingBudget: number };
}

function esErrorHerramienta(error: unknown): boolean {
  const texto = (
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  ).toLowerCase();
  if (
    texto.includes("timeout") ||
    texto.includes("abort") ||
    texto.includes("429") ||
    texto.includes("quota") ||
    texto.includes("401") ||
    texto.includes("403") ||
    texto.includes("api_key")
  ) {
    return false;
  }
  return (
    texto.includes("google_search") ||
    texto.includes("google search") ||
    texto.includes("grounding") ||
    texto.includes("search tool") ||
    (texto.includes("tool") &&
      (texto.includes("not supported") ||
        texto.includes("invalid") ||
        texto.includes("400")))
  );
}

/** Llamada con googleSearch habilitado para enriquecer con información
    actualizada; si el modelo no lo soporta, reintenta limpio sin tools. */
async function llamadaConBusquedaOpcional(
  ai: GoogleGenAI,
  modelo: string,
  contents: string,
  config: ConfigLlamada,
  etiqueta: string
): Promise<string | null | undefined> {
  try {
    const respuesta = await ai.models.generateContent({
      model: modelo,
      contents,
      config: { ...config, tools: [{ googleSearch: {} }] },
    });
    return respuesta.text;
  } catch (error) {
    if (esErrorHerramienta(error)) {
      console.warn(
        `[Gemini] ${etiqueta} ▶ googleSearch no soportado por ${modelo}; reintentando sin búsqueda web.`
      );
      const respuesta = await ai.models.generateContent({
        model: modelo,
        contents,
        config,
      });
      return respuesta.text;
    }
    throw error;
  }
}

/** Ejecuta tareas asíncronas con un límite de concurrencia, conservando
    el orden de los resultados. */
async function ejecutarConLimite<T>(
  tareas: (() => Promise<T>)[],
  concurrentes: number
): Promise<T[]> {
  const resultados = new Array<T>(tareas.length);
  let siguiente = 0;
  const trabajadores = Array.from(
    { length: Math.max(1, Math.min(concurrentes, tareas.length)) },
    async () => {
      while (siguiente < tareas.length) {
        const indice = siguiente++;
        resultados[indice] = await tareas[indice]();
      }
    }
  );
  await Promise.all(trabajadores);
  return resultados;
}

function construirPromptSimple(
  peticion: PeticionGeneracion,
  enfoque: string,
  idVariacion: string,
  palabrasMinimas: number,
  conFuentes: boolean
): string {
  const { norma, tema, instrucciones, paginas, portada, textoReferencia } = peticion;
  const esApa = norma === "apa7";
  const seccionesMinimas = Math.max(4, paginas);
  const detalleFormato = esApa
    ? "APA 7 (interlineado doble, fuente 12 pt Times New Roman ≈ 280 palabras por página)"
    : "IEEE (doble columna, 10 pt, interlineado sencillo ≈ 600 palabras por página)";

  const normaInstrucciones = esApa
    ? [
        "Escribe el trabajo siguiendo el estilo APA 7 (American Psychological Association).",
        `EXTENSIÓN OBLIGATORIA: genera AL MENOS ${seccionesMinimas} secciones o subtemas bien diferenciados y completamente desarrollados. El cuerpo del trabajo debe alcanzar como MÍNIMO ${palabrasMinimas} palabras (${paginas} páginas reales). NO resumas ni acortes el contenido: si un apartado queda breve, añade más análisis, ejemplos y desarrollo hasta superar ese mínimo.`,
        "Cada párrafo debe ser extenso y analítico (entre 140 y 200 palabras): desarrolla argumentos, datos, ejemplos y análisis crítico. Prohibido escribir párrafos de una sola oración o de relleno.",
        "Incluye un campo 'resumen' de 150 a 200 palabras.",
        "Las secciones deben tener títulos descriptivos en estilo APA (Nivel 1), sin numeración.",
        "Las referencias deben seguir el formato APA 7 completo (autores, año, título, fuente, DOI/URL si aplica) en orden alfabético.",
      ]
    : [
        "Escribe el trabajo siguiendo el estilo IEEE (Institute of Electrical and Electronics Engineers).",
        `EXTENSIÓN OBLIGATORIA: el cuerpo del trabajo debe alcanzar como MÍNIMO ${palabrasMinimas} palabras (${paginas} páginas reales en doble columna). NO resumas ni acortes el contenido técnico.`,
        "ESTRUCTURA IEEE OBLIGATORIA, en este orden:",
        "1) 'I. Introduction';",
        "2) 'II. Marco Teórico / Estado del Arte' (revisión del conocimiento previo con varias subsecciones);",
        "3) 'III. Metodología / Desarrollo' dividida en VARIOS subapartados usando el campo 'subsecciones' (cada uno con título propio y varios párrafos);",
        "4) 'IV. Resultados / Análisis' (análisis de datos, comparativas y, si aporta, tablas descritas textualmente);",
        "5) 'V. Conclusion'.",
        "Cada sección debe ser técnica y profunda, con varios párrafos detallados y desarrollados (no párrafos breves ni superficiales).",
        "Incluye un campo 'abstract' de 150 a 250 palabras y de 4 a 8 'palabrasClave' (Index Terms).",
        "Los títulos de sección deben ir numerados en orden (I, II, III, ...); escríbelos ya numerados.",
        "CITAS IEEE OBLIGATORIAS: CADA párrafo del desarrollo de las secciones (Introduction, secciones intermedias y Conclusion) DEBE incluir su número de cita IEEE entre corchetes (por ejemplo: [1], [2], [1], [3]) integrado al final de las afirmaciones o dentro de las oraciones que lo respalden.",
        "Los números de cita deben coincidir EXACTAMENTE con el orden de aparición en la lista de 'referencias': la primera fuente citada en el texto es [1] y debe ser el primer elemento del arreglo 'referencias', la segunda es [2], y así sucesivamente.",
        "Las referencias deben seguir el formato IEEE (A. Autor, \"Título\", Fuente, año) SIN numerarlas tú: la numeración '[1]', '[2]', ... se agrega automáticamente en el documento final. Devuélvelas en el orden en que se citan por primera vez en el texto.",
      ];

  return [
    `Redacta un trabajo académico completo y riguroso sobre: "${tema}".`,
    `Extensión obligatoria: el cuerpo completo debe alcanzar como MÍNIMO ${palabrasMinimas} palabras, equivalente a ${paginas} páginas reales en formato ${detalleFormato}. No resumas, no acortes ni reduzcas el desarrollo para terminar antes: cada sección debe quedar plenamente desarrollada hasta superar ese mínimo.`,
    ...normaInstrucciones,
    "=== VARIACIÓN INVESTIGATIVA (OBLIGATORIA) ===",
    `ENFOQUE ACADÉMICO DE ESTA EJECUCIÓN: "${enfoque}". Desarrolla el trabajo desde este enfoque y con un ángulo propio.`,
    `ID de variación: ${idVariacion}. Este trabajo debe ser completamente distinto de cualquier otra generación sobre el mismo tema: elige títulos, ejemplos, énfasis y organización propios de esta ejecución.`,
    "Apóyate en información actualizada y en perspectivas variadas para enriquecer el desarrollo y las referencias.",
    "=== FIN DE LA VARIACIÓN INVESTIGATIVA ===",
    conFuentes
      ? `USO OBLIGATORIO DE LAS FUENTES DEL USUARIO: el bloque "FUENTES DE INFORMACIÓN APORTADAS" contiene material real del usuario. Extrae de ahí datos, conceptos, cifras, definiciones y ejemplos para el desarrollo, e incluye OBLIGATORIAMENTE esas URLs y libros/documentos en la lista de referencias final (formato ${esApa ? "APA 7" : "IEEE"}).`
      : "",
    instrucciones
      ? [
          "=== INSTRUCCIONES DEL PROFESOR (PRIORIDAD MÁXIMA — CUMPLIMIENTO OBLIGATORIO) ===",
          `El profesor ha indicado los siguientes requisitos para el trabajo. Son de cumplimiento OBLIGATORIO y prevalecen sobre cualquier otra consideración de estilo o estructura: ${instrucciones}`,
          "Si las instrucciones indican una cantidad concreta de tablas, figuras o imágenes, temas específicos, un enfoque particular, una estructura determinada o secciones obligatorias, respétalo AL PIE DE LA LETRA.",
          "=== FIN DE LAS INSTRUCCIONES DEL PROFESOR ===",
        ].join("\n")
      : "",
    "USO DE TABLAS: si las instrucciones del profesor piden tablas, o si el tema técnico lo amerita, rellena el arreglo 'tablas' de las secciones correspondientes con datos reales, precisos y completos ('titulo', 'encabezados' y 'filas', donde cada fila tiene EXACTAMENTE la misma cantidad de celdas que 'encabezados'). Numera las tablas en orden de aparición (Tabla 1, Tabla 2, ...) y menciónalas explícitamente en el texto del párrafo correspondiente (por ejemplo: \"como se observa en la Tabla 1\").",
    "USO DE FIGURAS: si las instrucciones del profesor piden imágenes, gráficos, diagramas o figuras, o si el tema técnico lo amerita, rellena el arreglo 'figuras' de las secciones correspondientes con los conceptos clave en 'nodos', junto con 'titulo', 'descripcionVisual' (qué debe dibujarse), 'pieDeFigura' y 'tipoDiagrama' ('flujo', 'arquitectura', 'comparativo' o 'esquema'). Numera las figuras en orden de aparición y menciónalas explícitamente en el texto como \"Figura 1\" en APA 7 o \"Fig. 1\" en IEEE.",
    textoReferencia
      ? [
          "=== DOCUMENTO DE REFERENCIA (PLANTILLA DE ESTRUCTURA OBLIGATORIA) ===",
          "A continuación se adjunta un documento de referencia proporcionado por el usuario.",
          "OBLIGATORIO — REPLICA SU ESTRUCTURA DE FORMA FIEL:",
          "1. Extrae del documento los nombres EXACTOS y el ORDEN de todas sus secciones y subtítulos, y úsalos como títulos de las secciones del nuevo trabajo (conserva su numeración y su idioma).",
          "2. Si el documento tiene subsecciones, replícalas usando el campo 'subsecciones' con los mismos títulos y el mismo orden.",
          "3. Imita su tono, nivel técnico, profundidad y estilo de redacción, así como sus recursos: listas, tablas descritas textualmente, fórmulas mencionadas y enfoque metodológico.",
          "4. Adapta TODO el contenido al nuevo tema solicitado («" + tema + "»): NO copies frases, datos ni ejemplos del documento de referencia; únicamente su estructura y su forma.",
          "5. La norma de formato indicada arriba (APA 7 o IEEE) tiene prioridad sobre el estilo de citación del documento de referencia.",
          textoReferencia,
          "=== FIN DEL DOCUMENTO DE REFERENCIA ===",
        ].join("\n")
      : "",
    `Datos de portada: autor "${portada.autor}", institución "${portada.institucion}", curso "${portada.curso}", profesor "${portada.profesor}", ciudad "${portada.ciudad}", fecha "${portada.fecha}". Usa estos datos solo si necesitas referirte al contexto; el contenido debe centrarse en el tema.`,
    "El contenido debe ser académico, original, coherente y sin relleno. No inventes citas dentro del texto con páginas inexistentes.",
    "Devuelve únicamente JSON válido que cumpla el esquema.",
  ]
    .filter(Boolean)
    .join("\n");
}

function construirPromptPlan(
  peticion: PeticionGeneracion,
  enfoque: string,
  idVariacion: string,
  palabrasMinimas: number,
  conFuentes: boolean
): string {
  const { norma, tema, instrucciones, paginas } = peticion;
  const esApa = norma === "apa7";
  const cantidadSecciones = Math.max(5, paginas);
  return [
    `Prepara el ESQUEMA COMPLETO de un trabajo académico riguroso sobre: "${tema}".`,
    `=== VARIACIÓN INVESTIGATIVA (OBLIGATORIA) ===`,
    `ENFOQUE ACADÉMICO ÚNICO DE ESTA EJECUCIÓN: "${enfoque}". Organiza todo el esqueleto alrededor de este enfoque, no de un tratamiento genérico del tema.`,
    `ID de variación: ${idVariacion}. Elige títulos, subdivisión y orden propios de esta ejecución: el trabajo debe ser completamente distinto de cualquier otra generación sobre el mismo tema.`,
    "Apóyate en información actualizada y en perspectivas variadas para diseñar un esqueleto original.",
    "=== FIN DE LA VARIACIÓN INVESTIGATIVA ===",
    `El trabajo final debe alcanzar como MÍNIMO ${palabrasMinimas} palabras (${paginas} páginas reales en ${esApa ? "APA 7" : "IEEE"}). Genera EXACTAMENTE ${cantidadSecciones} secciones bien diferenciadas y distribuidas.`,
    esApa
      ? "Los títulos de sección no llevan numeración (estilo APA Nivel 1)."
      : `La estructura debe respetar IEEE: I. Introduction; II. Marco Teórico / Estado del Arte; III. Metodología / Desarrollo; IV. Resultados / Análisis; V. Conclusion, añadiendo secciones o subsecciones intermedias hasta llegar a ${cantidadSecciones}. Los títulos van numerados en orden (I, II, III, ...).`,
    `Asigna a cada sección una 'metaPalabras' realista (la suma de todas las metas debe ser como mínimo ${palabrasMinimas} palabras) con reparto no uniforme: las secciones centrales más extensas. Usa 'subsecciones' (con sus metas) en las secciones más largas.`,
    conFuentes
      ? "El usuario aportó fuentes reales (verás el bloque 'FUENTES DE INFORMACIÓN APORTADAS' más abajo): el esqueleto debe organizarse para explotarlas a fondo, y la lista de referencias debe incluir OBLIGATORIAMENTE las URLs y libros/documentos aportados en formato " + (esApa ? "APA 7" : "IEEE") + "."
      : "",
    instrucciones
      ? `Requisitos del profesor (de cumplimiento OBLIGATORIO, prevalecen sobre el resto): ${instrucciones}`
      : "",
    "Devuelve únicamente JSON válido que cumpla el esquema.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generarPlanDocumento(
  ai: GoogleGenAI,
  peticion: PeticionGeneracion,
  enfoque: string,
  idVariacion: string,
  palabrasMinimas: number,
  conFuentes: boolean
): Promise<PlanDocumento> {
  const texto = await llamadaIA(
    (modelo) =>
      llamadaConBusquedaOpcional(
        ai,
        modelo,
        construirPromptPlan(peticion, enfoque, idVariacion, palabrasMinimas, conFuentes),
        {
          responseMimeType: "application/json",
          responseSchema: esquemaPlan,
          temperature: 0.9,
          maxOutputTokens: 16_384,
          abortSignal: AbortSignal.timeout(TIMEOUT_PLAN_MS),
          thinkingConfig: { thinkingBudget: 0 },
        },
        "generar-doc-plan"
      ),
    { etiqueta: "generar-doc-plan", timeoutMs: TIMEOUT_PLAN_MS },
    ai
  );
  const datos = parsearJsonIA<PlanDocumento>(texto);
  if (!datos.titulo || !Array.isArray(datos.secciones) || datos.secciones.length === 0) {
    throw new Error("La IA no generó un esquema válido para el documento.");
  }
  datos.secciones.forEach((seccion) => {
    seccion.titulo = (seccion.titulo ?? "").trim();
    seccion.metaPalabras = Math.max(80, Math.round(Number(seccion.metaPalabras) || 0));
    seccion.subsecciones = (seccion.subsecciones ?? [])
      .filter((sub) => sub?.titulo)
      .map((sub) => ({
        titulo: sub.titulo,
        metaPalabras: Math.max(40, Math.round(Number(sub.metaPalabras) || 0)),
      }));
  });
  datos.secciones = datos.secciones.filter((s) => s.titulo);
  if (datos.secciones.length === 0) {
    throw new Error("La IA no generó un esquema válido para el documento.");
  }
  if (!Array.isArray(datos.referencias)) datos.referencias = [];
  return datos;
}

/** Agrupa las secciones del plan en bloques de redacción de tamaño
    acotado (llamadas rápidas que no dejan que el modelo resuma). */
function dividirEnBloques(secciones: PlanSeccion[]): PlanSeccion[][] {
  const bloques: PlanSeccion[][] = [];
  let actual: PlanSeccion[] = [];
  let palabras = 0;
  for (const seccion of secciones) {
    actual.push(seccion);
    palabras += seccion.metaPalabras;
    if (palabras >= PALABRAS_POR_BLOQUE) {
      bloques.push(actual);
      actual = [];
      palabras = 0;
    }
  }
  if (actual.length > 0) bloques.push(actual);
  return bloques;
}

function construirPromptBloque(
  peticion: PeticionGeneracion,
  plan: PlanDocumento,
  bloque: PlanSeccion[],
  enfoque: string,
  idVariacion: string,
  conFuentes: boolean
): string {
  const { norma, tema, instrucciones } = peticion;
  const esApa = norma === "apa7";
  const metaBloque = bloque.reduce((total, s) => total + s.metaPalabras, 0);
  const detalleAsignacion = bloque
    .map((seccion) =>
      [
        `- "${seccion.titulo}" (meta: ${seccion.metaPalabras} palabras)`,
        seccion.subsecciones?.length
          ? `  con subsecciones: ${seccion.subsecciones
              .map((sub) => `"${sub.titulo}" (${sub.metaPalabras} palabras)`)
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  const otrasSecciones = plan.secciones
    .filter((s) => !bloque.some((b) => b.titulo === s.titulo))
    .map((s) => s.titulo);

  return [
    `Redacta COMPLETAMENTE el contenido de las secciones asignadas de un trabajo académico sobre: "${tema}".`,
    `=== VARIACIÓN INVESTIGATIVA ===`,
    `ENFOQUE ACADÉMICO: "${enfoque}". ID de variación: ${idVariacion}.`,
    "=== FIN DE LA VARIACIÓN ===",
    `Estilo ${esApa ? "APA 7" : "IEEE"}: párrafos extensos, analíticos y profundos de 140 a 200 palabras cada uno, con argumentos, datos, ejemplos y análisis crítico. PROHIBIDO resumir o dejar secciones cortas.`,
    `META TOTAL DE ESTE BLOQUE: al menos ${metaBloque} palabras repartidas entre las secciones asignadas según sus metas individuales.`,
    `SECCIONES ASIGNADAS (devuelve EXACTAMENTE estas, en este orden y con estos títulos):\n${detalleAsignacion}`,
    otrasSecciones.length
      ? `Estas otras secciones del mismo trabajo las cubren otros bloques (SOLO contexto para no repetir contenido; NO las redactes): ${otrasSecciones.join(" | ")}`
      : "",
    esApa
      ? "Los títulos no llevan numeración. Cada párrafo es texto continuo sin saltos de línea."
      : `Mantén los títulos EXACTAMENTE como aparecen en la asignación (ya numerados). CITA IEEE OBLIGATORIA: cada párrafo debe incluir citas entre corchetes ([1], [2], ...) usando EXACTAMENTE la numeración de esta lista de referencias del trabajo: ${plan.referencias.map((r, i) => `[${i + 1}] ${r}`).join(" | ")}`,
    conFuentes
      ? "USO OBLIGATORIO DE LAS FUENTES DEL USUARIO: extrae datos, conceptos, cifras y ejemplos directamente del bloque 'FUENTES DE INFORMACIÓN APORTADAS' (más abajo) e intégralos en estos párrafos."
      : "",
    "Si la sección lo amerita (o si las instrucciones del profesor lo piden), incluye 'tablas' (con datos reales, 'encabezados' y 'filas' consistentes) y/o 'figuras' ('titulo', 'descripcionVisual', 'pieDeFigura', 'tipoDiagrama' entre 'flujo', 'arquitectura', 'comparativo' o 'esquema', y 'nodos'). Numera tablas y figuras en orden y menciónalas en el texto.",
    instrucciones
      ? `Requisitos del profesor (obligatorios): ${instrucciones}`
      : "",
    "Devuelve únicamente JSON válido que cumpla el esquema, con TODAS las secciones asignadas completamente redactadas.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function redactarBloques(
  ai: GoogleGenAI,
  peticion: PeticionGeneracion,
  plan: PlanDocumento,
  enfoque: string,
  idVariacion: string,
  conFuentes: boolean
): Promise<SeccionDoc[]> {
  const bloques = dividirEnBloques(plan.secciones);
  console.log(
    `[Gemini] generar-doc ▶ redactando ${plan.secciones.length} secciones en ${bloques.length} bloque(s) (concurrencia ${CONCURRENCIA_BLOQUES}).`
  );

  const tareas = bloques.map((bloque, i) => async (): Promise<SeccionDoc[]> => {
    const metaBloque = bloque.reduce((total, s) => total + s.metaPalabras, 0);
    const texto = await llamadaIA(
      (modelo) =>
        llamadaConBusquedaOpcional(
          ai,
          modelo,
          construirPromptBloque(peticion, plan, bloque, enfoque, idVariacion, conFuentes),
          {
            responseMimeType: "application/json",
            responseSchema: esquemaBloqueSecciones,
            temperature: 0.7,
            maxOutputTokens: Math.min(65_536, Math.max(8_192, metaBloque * 3)),
            abortSignal: AbortSignal.timeout(TIMEOUT_BLOQUE_MS),
            thinkingConfig: { thinkingBudget: 0 },
          },
          `generar-doc-bloque ${i + 1}/${bloques.length}`
        ),
      { etiqueta: `generar-doc-bloque ${i + 1}/${bloques.length}`, timeoutMs: TIMEOUT_BLOQUE_MS },
      ai
    );
    const datos = parsearJsonIA<{ secciones: SeccionDoc[] }>(texto);
    return Array.isArray(datos.secciones) ? datos.secciones : [];
  });

  const resultados = await ejecutarConLimite(tareas, CONCURRENCIA_BLOQUES);

  /* Fusión en el orden del plan; una sección fallida queda vacía y la
     recoge después la pasada de ampliación. */
  const secciones: SeccionDoc[] = [];
  bloques.forEach((bloque, i) => {
    const redactadas = resultados[i] ?? [];
    bloque.forEach((asignada) => {
      const candidata =
        redactadas.find(
          (r) => r?.titulo?.trim().toLowerCase() === asignada.titulo.trim().toLowerCase()
        ) ?? redactadas.shift();
      if (
        candidata &&
        Array.isArray(candidata.parrafos) &&
        (candidata.parrafos.length > 0 || (candidata.subsecciones?.length ?? 0) > 0)
      ) {
        secciones.push({
          titulo: asignada.titulo,
          parrafos: candidata.parrafos.filter((p) => typeof p === "string" && p.trim()),
          subsecciones: Array.isArray(candidata.subsecciones)
            ? candidata.subsecciones.filter((sub) => sub?.titulo)
            : undefined,
          tablas: candidata.tablas,
          figuras: candidata.figuras,
        });
      } else {
        secciones.push({ titulo: asignada.titulo, parrafos: [] });
      }
    });
  });
  return secciones;
}

function construirPromptAmpliacion(
  peticion: PeticionGeneracion,
  asignadas: { seccion: SeccionDoc; meta: number }[],
  enfoque: string,
  idVariacion: string,
  conFuentes: boolean
): string {
  const { norma, tema, instrucciones } = peticion;
  const esApa = norma === "apa7";
  const detalle = asignadas
    .map(({ seccion, meta }) => {
      const contenidoActual = [
        ...(seccion.parrafos ?? []),
        ...(seccion.subsecciones ?? []).flatMap((sub) => [
          `[Subsección: ${sub.titulo}]`,
          ...(sub.parrafos ?? []),
        ]),
      ]
        .join("\n")
        .trim();
      return `SECCIÓN "${seccion.titulo}" (actual: ${palabrasSeccion(seccion)} palabras · meta mínima: ${meta} palabras):\n${
        contenidoActual || "(aún sin contenido: redáctala por completo desde cero)"
      }`;
    })
    .join("\n\n");

  return [
    `El cuerpo de un trabajo académico sobre "${tema}" quedó por debajo de la extensión mínima. Redacta o AMPLÍA el desarrollo de las secciones indicadas.`,
    `=== VARIACIÓN INVESTIGATIVA ===`,
    `ENFOQUE ACADÉMICO: "${enfoque}". ID de variación: ${idVariacion}.`,
    "=== FIN DE LA VARIACIÓN ===",
    `Estilo ${esApa ? "APA 7" : "IEEE"}: cada párrafo (nuevo o existente) debe tener entre 140 y 200 palabras, analítico y profundo (argumentos, datos, ejemplos, matices, análisis crítico).`,
    "REGLAS:",
    "- Devuelve CADA sección indicada COMPLETA, con el MISMO título, conservando su contenido actual y AÑADIENDO párrafos nuevos hasta alcanzar o superar su meta mínima de palabras.",
    "- Si una sección no tiene contenido todavía, redáctala por completo desde cero respetando su meta.",
    "- No repitas ideas ni rellenes con frases genéricas: cada párrafo añadido debe aportar desarrollo real.",
    esApa
      ? "Los títulos no llevan numeración."
      : "Mantén la numeración de los títulos tal como aparecen y las citas IEEE [n] en cada párrafo, coherentes con la lista de referencias ya fijada.",
    conFuentes ? "Apóyate también en el bloque 'FUENTES DE INFORMACIÓN APORTADAS' incluido abajo." : "",
    instrucciones ? `Requisitos del profesor (obligatorios): ${instrucciones}` : "",
    "Devuelve únicamente JSON válido que cumpla el esquema, con todas las secciones indicadas en el mismo orden.",
    detalle,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pasada automática de ampliación: si el conteo total queda por debajo
    del 85% del mínimo, redacta o expande las secciones más cortas. */
async function ampliarSecciones(
  ai: GoogleGenAI,
  peticion: PeticionGeneracion,
  secciones: SeccionDoc[],
  enfoque: string,
  idVariacion: string,
  palabrasMinimas: number,
  conFuentes: boolean
): Promise<SeccionDoc[]> {
  const actuales = secciones.map(palabrasSeccion);
  const total = actuales.reduce((a, b) => a + b, 0);
  const deficit = palabrasMinimas - total;
  if (deficit <= 0) return secciones;

  const expectativa = Math.ceil(palabrasMinimas / Math.max(1, secciones.length));
  const orden = secciones.map((_, i) => i).sort((a, b) => actuales[a] - actuales[b]);
  const seleccion: number[] = [];
  let cubierto = 0;
  for (const i of orden) {
    if (cubierto >= deficit || seleccion.length >= 6) break;
    const meta = Math.max(expectativa, Math.round(actuales[i] * 1.8));
    cubierto += Math.max(0, meta - actuales[i]);
    seleccion.push(i);
  }
  if (seleccion.length === 0) seleccion.push(orden[0]);

  const asignadas = seleccion.map((i) => ({
    seccion: secciones[i],
    meta: Math.max(expectativa, Math.round(actuales[i] * 1.8)),
  }));
  const metaTotal = asignadas.reduce((t, a) => t + a.meta, 0);
  console.log(
    `[Gemini] generar-doc ▶ ampliación de ${asignadas.length} sección(es) (deficit: ${deficit} palabras).`
  );

  const texto = await llamadaIA(
    (modelo) =>
      llamadaConBusquedaOpcional(
        ai,
        modelo,
        construirPromptAmpliacion(peticion, asignadas, enfoque, idVariacion, conFuentes),
        {
          responseMimeType: "application/json",
          responseSchema: esquemaBloqueSecciones,
          temperature: 0.6,
          maxOutputTokens: Math.min(65_536, Math.max(8_192, metaTotal * 3)),
          abortSignal: AbortSignal.timeout(TIMEOUT_BLOQUE_MS),
          thinkingConfig: { thinkingBudget: 0 },
        },
        "generar-doc-ampliacion"
      ),
    { etiqueta: "generar-doc-ampliacion", timeoutMs: TIMEOUT_BLOQUE_MS },
    ai
  );

  const datos = parsearJsonIA<{ secciones: SeccionDoc[] }>(texto);
  const ampliadas = Array.isArray(datos.secciones) ? datos.secciones : [];
  const resultado = [...secciones];
  seleccion.forEach((indiceSeccion, j) => {
    const ampliada =
      ampliadas[j] ??
      ampliadas.find(
        (s) => s?.titulo?.trim().toLowerCase() === resultado[indiceSeccion].titulo.trim().toLowerCase()
      );
    if (
      ampliada &&
      Array.isArray(ampliada.parrafos) &&
      (ampliada.parrafos.length > 0 || (ampliada.subsecciones?.length ?? 0) > 0)
    ) {
      resultado[indiceSeccion] = {
        titulo: resultado[indiceSeccion].titulo,
        parrafos: ampliada.parrafos.filter((p) => typeof p === "string" && p.trim()),
        subsecciones: Array.isArray(ampliada.subsecciones)
          ? ampliada.subsecciones.filter((sub) => sub?.titulo)
          : resultado[indiceSeccion].subsecciones,
        tablas: ampliada.tablas ?? resultado[indiceSeccion].tablas,
        figuras: ampliada.figuras ?? resultado[indiceSeccion].figuras,
      };
    }
  });

  console.log(
    `[Gemini] generar-doc ▶ tras ampliación: ${contarPalabrasSecciones(resultado)} palabras (mínimo ${palabrasMinimas}).`
  );
  return resultado;
}

export async function generarDocumento(
  peticion: PeticionGeneracion
): Promise<DocumentoEstructurado> {
  const ai = obtenerCliente();
  const enfoque = seleccionarEnfoque();
  const idVariacion = crearIdVariacion();
  const palabrasMinimas = palabrasMinimasDe(peticion.norma, peticion.paginas);
  const conFuentes = tieneFuentes(peticion);
  const modoMultiPaso = peticion.paginas >= 4;

  let titulo = "";
  let abstract: string | undefined;
  let resumen: string | undefined;
  let palabrasClave: string[] | undefined;
  let referencias: string[] = [];
  let secciones: SeccionDoc[];

  if (modoMultiPaso) {
    console.log(
      `[Gemini] generar-doc ▶ modo multi-paso (paginas=${peticion.paginas}, mínimo=${palabrasMinimas} palabras, enfoque="${enfoque}", variación=${idVariacion}${conFuentes ? ", con fuentes del usuario" : ""})`
    );
    const plan = await generarPlanDocumento(
      ai,
      peticion,
      enfoque,
      idVariacion,
      palabrasMinimas,
      conFuentes
    );
    titulo = plan.titulo;
    abstract = plan.abstract;
    resumen = plan.resumen;
    palabrasClave = plan.palabrasClave;
    referencias = plan.referencias;
    secciones = await redactarBloques(ai, peticion, plan, enfoque, idVariacion, conFuentes);
  } else {
    console.log(
      `[Gemini] generar-doc ▶ modo simple (paginas=${peticion.paginas}, mínimo=${palabrasMinimas} palabras, enfoque="${enfoque}", variación=${idVariacion}${conFuentes ? ", con fuentes del usuario" : ""})`
    );
    const texto = await llamadaIA(
      (modelo) =>
        llamadaConBusquedaOpcional(
          ai,
          modelo,
          construirPromptSimple(peticion, enfoque, idVariacion, palabrasMinimas, conFuentes),
          {
            responseMimeType: "application/json",
            responseSchema: esquemaDocumento,
            temperature: 0.85,
            maxOutputTokens: Math.min(
              65_536,
              Math.max(16_384, peticion.paginas * 4000)
            ),
            abortSignal: AbortSignal.timeout(TIMEOUT_DOCUMENTO_MS),
            thinkingConfig: { thinkingBudget: 0 },
          },
          "generar-doc"
        ),
      { etiqueta: "generar-doc", timeoutMs: TIMEOUT_DOCUMENTO_MS },
      ai
    );
    const datos = parsearJsonIA<DocumentoEstructurado>(texto);
    titulo = datos.titulo ?? "";
    abstract = datos.abstract;
    resumen = datos.resumen;
    palabrasClave = datos.palabrasClave;
    referencias = Array.isArray(datos.referencias) ? datos.referencias : [];
    secciones = Array.isArray(datos.secciones) ? datos.secciones : [];
  }

  /* Verificación del conteo total de palabras: si queda por debajo del
     85% del mínimo obligatorio, pasada automática de ampliación. */
  const totalPalabras = contarPalabrasSecciones(secciones);
  if (totalPalabras < palabrasMinimas * UMBRAL_EXTENSION) {
    console.warn(
      `[Gemini] generar-doc ▶ extensión insuficiente: ${totalPalabras} palabras de un mínimo de ${palabrasMinimas} (<85%); ejecutando pasada de ampliación.`
    );
    secciones = await ampliarSecciones(
      ai,
      peticion,
      secciones,
      enfoque,
      idVariacion,
      palabrasMinimas,
      conFuentes
    );
  } else {
    console.log(
      `[Gemini] generar-doc ▶ extensión verificada: ${totalPalabras} palabras (mínimo ${palabrasMinimas}).`
    );
  }

  return normalizarDocumento(
    {
      norma: peticion.norma,
      titulo,
      abstract,
      resumen,
      palabrasClave,
      secciones,
      referencias,
    },
    peticion.norma
  );
}

function normalizarDocumento(
  datos: DocumentoEstructurado,
  norma: NormaFormato
): DocumentoEstructurado {
  if (!datos.titulo || !Array.isArray(datos.secciones)) {
    throw new Error("Respuesta de la IA incompleta.");
  }
  const secciones = datos.secciones.filter(
    (s) =>
      s &&
      s.titulo &&
      Array.isArray(s.parrafos) &&
      (s.parrafos.length > 0 || (Array.isArray(s.subsecciones) && s.subsecciones.length > 0))
  );
  if (secciones.length === 0) {
    throw new Error("La IA no generó secciones válidas.");
  }
  return {
    norma,
    titulo: datos.titulo,
    abstract: datos.abstract,
    resumen: datos.resumen,
    palabrasClave: datos.palabrasClave,
    secciones,
    referencias: Array.isArray(datos.referencias) ? datos.referencias : [],
  };
}

/* ------------------------------------------------------------------ */
/*  Generación de material de estudio                                  */
/* ------------------------------------------------------------------ */

const INSTRUCCIONES_DIFICULTAD: Record<DificultadCuestionario, string> = {
  facil:
    "DIFICULTAD FÁCIL: conceptos básicos y definiciones directas del material; preguntas claras sobre terminología, hechos y datos explícitos del texto.",
  media:
    "DIFICULTAD MEDIA: comprensión del material, relación entre conceptos y aplicación mediante ejemplos prácticos; requiere entender, no solo memorizar.",
  dificil:
    "DIFICULTAD DIFÍCIL: nivel universitario avanzado; análisis crítico, casos complejos, deducción a partir del material y preguntas trampa bien fundamentadas (distractores muy plausibles pero claramente incorrectos según el texto). Evita preguntas obvias o triviales: cada pregunta debe exigir razonamiento.",
};

const INSTRUCCIONES_TIPO: Record<TipoCuestionario, string> = {
  multiple:
    "TODAS las preguntas son de opción múltiple: cada una con exactamente 4 opciones y su 'respuestaCorrecta' (índice 0-3). Usa tipo='multiple' en todas.",
  abierta:
    "TODAS las preguntas son de respuesta abierta (de desarrollo o análisis): sin opciones; el estudiante debe redactar su respuesta. En cada una incluye 'respuestaModelo' (la respuesta ideal redactada en 2-4 oraciones) y de 3 a 5 'criteriosClave' medibles con los que se calificará. Usa tipo='abierta' en todas.",
  mixto:
    "Mitad de las preguntas de opción múltiple (tipo='multiple', 4 opciones) y mitad de respuesta abierta (tipo='abierta', con 'respuestaModelo' y 3-5 'criteriosClave'); alterna los tipos entre las preguntas.",
};

export async function generarCuestionario(
  peticion: Pick<
    PeticionEstudio,
    "texto" | "numPreguntas" | "tituloFuente" | "dificultad" | "tipoCuestionario"
  >
): Promise<Cuestionario> {
  const { dificultad = "media", tipoCuestionario = "multiple" } = peticion;
  const prompt = [
    `Basándote EXCLUSIVAMENTE en el siguiente material de estudio (proveniente de PDFs titulados "${peticion.tituloFuente}"), crea un cuestionario de ${peticion.numPreguntas} preguntas.`,
    INSTRUCCIONES_DIFICULTAD[dificultad],
    INSTRUCCIONES_TIPO[tipoCuestionario],
    "Reglas para TODAS las preguntas:",
    "- La 'explicacion' debe ser MUY breve: máximo 1-2 líneas citando la parte del material.",
    "- Rellena SIEMPRE todos los campos del esquema: en preguntas de opción múltiple usa opciones/respuestaCorrecta y deja respuestaModelo='' y criteriosClave=[]; en preguntas abiertas usa respuestaModelo/criteriosClave y deja opciones=[] y respuestaCorrecta=-1.",
    "- Cubre temas distintos y representativos de todo el material; no repitas preguntas.",
    "- No inventes información que no esté en el material.",
    "- Responde de forma directa y concisa; no añadas texto fuera del JSON.",
    "- Devuelve únicamente JSON válido según el esquema.",
    "",
    "=== MATERIAL DE ESTUDIO ===",
    truncarTexto(peticion.texto),
    "=== FIN DEL MATERIAL ===",
  ].join("\n");

  const ai = obtenerCliente();
  const texto = await llamadaIA(
    (modelo) =>
      ai.models
        .generateContent({
          model: modelo,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: esquemaCuestionario,
            temperature: 0.5,
            maxOutputTokens: 16384,
            abortSignal: AbortSignal.timeout(TIMEOUT_ESTUDIO_MS),
            thinkingConfig: { thinkingBudget: 0 },
          },
        })
        .then((r) => r.text),
    {
      etiqueta: "cuestionario",
      timeoutMs: TIMEOUT_ESTUDIO_MS,
    },
    ai
  );

  const datos = parsearJsonIA<Cuestionario>(texto);
  const preguntas = (datos.preguntas ?? []).flatMap<PreguntaCuestionario>((p) => {
    if (!p?.pregunta || !p.tipo) return [];
    if (p.tipo === "abierta") {
      if (!p.respuestaModelo || !Array.isArray(p.criteriosClave) || p.criteriosClave.length === 0) {
        return [];
      }
      return [
        {
          pregunta: p.pregunta,
          tipo: "abierta",
          opciones: [],
          respuestaCorrecta: -1,
          explicacion: p.explicacion || "",
          respuestaModelo: p.respuestaModelo,
          criteriosClave: p.criteriosClave,
        },
      ];
    }
    if (
      Array.isArray(p.opciones) &&
      p.opciones.length === 4 &&
      typeof p.respuestaCorrecta === "number" &&
      p.respuestaCorrecta >= 0 &&
      p.respuestaCorrecta <= 3
    ) {
      return [
        {
          pregunta: p.pregunta,
          tipo: "multiple",
          opciones: p.opciones,
          respuestaCorrecta: p.respuestaCorrecta,
          explicacion: p.explicacion || "",
          respuestaModelo: "",
          criteriosClave: [],
        },
      ];
    }
    return [];
  });
  if (preguntas.length === 0) {
    throw new Error("La IA no generó preguntas válidas.");
  }
  return {
    titulo: datos.titulo || "Cuestionario de estudio",
    preguntas,
  };
}

export async function evaluarRespuestasAbiertas(
  peticion: PeticionEvaluacionAbierta
): Promise<ResultadoEvaluacionAbierta> {
  const pares = peticion.preguntas
    .map((p, i) => ({ pregunta: p, respuesta: peticion.respuestas[i] }))
    .filter(
      (par): par is { pregunta: PreguntaCuestionario; respuesta: string } =>
        par.pregunta?.tipo === "abierta" &&
        !!par.pregunta.pregunta &&
        !!par.pregunta.respuestaModelo &&
        typeof par.respuesta === "string"
    );
  if (pares.length === 0) {
    throw new Error("No hay preguntas abiertas ni respuestas del usuario para evaluar.");
  }

  const instrucciones = pares
    .map(
      (par, i) =>
        [
          `PREGUNTA ${i + 1}: ${par.pregunta.pregunta}`,
          `CRITERIOS CLAVE (lo que la respuesta debe cubrir): ${par.pregunta.criteriosClave.join(" | ")}`,
          `RESPUESTA MODELO: ${par.pregunta.respuestaModelo}`,
          `RESPUESTA DEL ESTUDIANTE: ${par.respuesta.trim() || "(sin respuesta)"}`,
        ].join("\n")
    )
    .join("\n\n");

  const prompt = [
    "Eres un profesor experto y exigente pero justo. Califica las siguientes respuestas abiertas de un estudiante, escritas por él mismo.",
    "Para CADA pregunta, en el MISMO orden y devolviendo EXACTAMENTE la misma cantidad de evaluaciones que preguntas:",
    "- 'nota': calificación de 0 a 10 proporcional a los criterios clave cubiertos y a la calidad de la redacción. Si la respuesta está vacía o no responde la pregunta, la nota es 0. Si cubre todos los criterios con buena redacción, 9-10.",
    "- 'aciertos': lista de ideas, conceptos o criterios que la respuesta SÍ cubrió correctamente (puede estar vacía).",
    "- 'faltantes': lista de criterios clave o ideas importantes que omitió o en las que se equivocó (puede estar vacía).",
    "- 'comentario': retroalimentación breve (1-3 oraciones) sobre su respuesta.",
    "- 'explicacionIdeal': la respuesta ideal completa y bien redactada (2-5 oraciones), basada en el material.",
    "- 'notaFinal': promedio de todas las notas, de 0 a 10, con un decimal.",
    "- Evalúa el contenido, no la ortografía; sé coherente entre respuestas.",
    "- Devuelve únicamente JSON válido según el esquema.",
    "",
    "=== RESPUESTAS A EVALUAR ===",
    instrucciones,
    "=== FIN DE LAS RESPUESTAS ===",
  ].join("\n");

  const ai = obtenerCliente();
  const texto = await llamadaIA(
    (modelo) =>
      ai.models
        .generateContent({
          model: modelo,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: esquemaEvaluacion,
            temperature: 0.3,
            maxOutputTokens: 16384,
            abortSignal: AbortSignal.timeout(TIMEOUT_ESTUDIO_MS),
            thinkingConfig: { thinkingBudget: 0 },
          },
        })
        .then((r) => r.text),
    {
      etiqueta: "evaluar-abiertas",
      timeoutMs: TIMEOUT_ESTUDIO_MS,
    },
    ai
  );

  const datos = parsearJsonIA<{
    notaFinal: number;
    evaluaciones: (EvaluacionAbierta & { nota: number })[];
  }>(texto);
  const evaluaciones = pares.map((par, i) => {
    const e = datos.evaluaciones?.[i];
    return {
      nota: Math.min(10, Math.max(0, Number(e?.nota) || 0)),
      aciertos: Array.isArray(e?.aciertos) ? e?.aciertos.filter(Boolean) ?? [] : [],
      faltantes: Array.isArray(e?.faltantes) ? e?.faltantes.filter(Boolean) ?? [] : [],
      comentario: e?.comentario || "",
      explicacionIdeal: e?.explicacionIdeal || par.pregunta.respuestaModelo,
    } satisfies EvaluacionAbierta;
  });
  const notaFinal =
    typeof datos.notaFinal === "number" && Number.isFinite(datos.notaFinal)
      ? datos.notaFinal
      : evaluaciones.reduce((total, e) => total + e.nota, 0) / evaluaciones.length;

  return {
    notaFinal: Math.round(Math.min(10, Math.max(0, notaFinal)) * 10) / 10,
    evaluaciones,
  };
}

export async function generarResumen(
  peticion: Pick<PeticionEstudio, "texto" | "tituloFuente">
): Promise<ResumenEstructurado> {
  const prompt = [
    `Basándote EXCLUSIVAMENTE en el siguiente material de estudio (proveniente de PDFs titulados "${peticion.tituloFuente}"), genera un resumen estructurado para preparar un examen.`,
    "Incluye: idea principal (1-2 oraciones), puntos clave breves y directos, glosario de conceptos con definiciones cortas y conclusiones finales.",
    "Sé conciso: cada punto o definición debe tener 1-2 líneas como máximo.",
    "No inventes información que no esté en el material.",
    "Devuelve únicamente JSON válido según el esquema.",
    "",
    "=== MATERIAL DE ESTUDIO ===",
    truncarTexto(peticion.texto),
    "=== FIN DEL MATERIAL ===",
  ].join("\n");

  const ai = obtenerCliente();
  const texto = await llamadaIA(
    (modelo) =>
      ai.models
        .generateContent({
          model: modelo,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: esquemaResumen,
            temperature: 0.4,
            maxOutputTokens: 16384,
            abortSignal: AbortSignal.timeout(TIMEOUT_ESTUDIO_MS),
            thinkingConfig: { thinkingBudget: 0 },
          },
        })
        .then((r) => r.text),
    {
      etiqueta: "resumen",
      timeoutMs: TIMEOUT_ESTUDIO_MS,
    },
    ai
  );

  const datos = parsearJsonIA<ResumenEstructurado>(texto);
  if (!datos.puntosClave?.length) {
    throw new Error("La IA no generó contenido útil.");
  }
  return datos;
}

const MAX_CARACTERES = 25_000;

export function truncarTexto(texto: string, max = MAX_CARACTERES): string {
  if (texto.length <= max) return texto;
  return `${texto.slice(0, max)}\n\n[Nota: el material fue recortado por longitud.]`;
}
