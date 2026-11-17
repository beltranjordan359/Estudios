import type { NextRequest } from "next/server";
import {
  evaluarRespuestasAbiertas,
  generarCuestionario,
  generarResumen,
  truncarTexto,
} from "@/lib/ia/gemini";
import type {
  AccionEstudio,
  DificultadCuestionario,
  ModoEstudio,
  PeticionEstudio,
  PreguntaCuestionario,
  TipoCuestionario,
} from "@/types/estudio";

function esModo(valor: unknown): valor is ModoEstudio {
  return valor === "cuestionario" || valor === "resumen";
}

function esDificultad(valor: unknown): valor is DificultadCuestionario {
  return valor === "facil" || valor === "media" || valor === "dificil";
}

function esTipoCuestionario(valor: unknown): valor is TipoCuestionario {
  return valor === "multiple" || valor === "abierta" || valor === "mixto";
}

function esAccion(valor: unknown): valor is AccionEstudio {
  return valor === "generar" || valor === "evaluar";
}

export async function POST(request: NextRequest) {
  const inicio = Date.now();
  try {
    const cuerpo = (await request.json()) as Partial<PeticionEstudio>;

    if (!esAccion(cuerpo.accion) || cuerpo.accion === "generar") {
      return await generar(cuerpo, inicio);
    }
    return await evaluar(cuerpo, inicio);
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error inesperado al generar el material de estudio.";
    console.error(
      `[/api/estudiar] ERROR tras ${((Date.now() - inicio) / 1000).toFixed(1)}s:`,
      error
    );
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

async function generar(
  cuerpo: Partial<PeticionEstudio>,
  inicio: number
) {
  try {
    if (
      !cuerpo.texto ||
      typeof cuerpo.texto !== "string" ||
      cuerpo.texto.trim().length < 200
    ) {
      return Response.json(
        {
          error:
            "El texto de estudio es insuficiente. Carga al menos un PDF con texto legible (mínimo ~200 caracteres).",
        },
        { status: 400 }
      );
    }
    if (!esModo(cuerpo.modo)) {
      return Response.json(
        { error: "El modo debe ser 'cuestionario' o 'resumen'." },
        { status: 400 }
      );
    }

    const numPreguntas = Number(cuerpo.numPreguntas);
    const preguntasValidas = Number.isFinite(numPreguntas)
      ? Math.min(30, Math.max(3, Math.round(numPreguntas)))
      : 10;

    const tituloFuente =
      typeof cuerpo.tituloFuente === "string" && cuerpo.tituloFuente.trim()
        ? cuerpo.tituloFuente.trim().slice(0, 300)
        : "Material de estudio";

    const dificultad = esDificultad(cuerpo.dificultad) ? cuerpo.dificultad : "media";
    const tipoCuestionario = esTipoCuestionario(cuerpo.tipoCuestionario)
      ? cuerpo.tipoCuestionario
      : "multiple";

    const texto = truncarTexto(cuerpo.texto.trim());

    if (cuerpo.modo === "cuestionario") {
      const cuestionario = await generarCuestionario({
        texto,
        numPreguntas: preguntasValidas,
        tituloFuente,
        dificultad,
        tipoCuestionario,
      });
      console.log(
        `[/api/estudiar] cuestionario OK en ${((Date.now() - inicio) / 1000).toFixed(1)}s (dificultad=${dificultad}, tipo=${tipoCuestionario})`
      );
      return Response.json({
        titulo: cuestionario.titulo,
        cuestionario,
      });
    }

    const resumen = await generarResumen({ texto, tituloFuente });
    console.log(
      `[/api/estudiar] resumen OK en ${((Date.now() - inicio) / 1000).toFixed(1)}s`
    );
    return Response.json({
      titulo: resumen.titulo,
      resumen,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : "Error inesperado al generar el material de estudio.";
    console.error(
      `[/api/estudiar] ERROR tras ${((Date.now() - inicio) / 1000).toFixed(1)}s:`,
      error
    );
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

async function evaluar(cuerpo: Partial<PeticionEstudio>, inicio: number) {
  try {
    const preguntas = Array.isArray(cuerpo.preguntas)
      ? (cuerpo.preguntas as PreguntaCuestionario[])
      : [];
    const abiertas = preguntas.filter(
      (p) =>
        p?.tipo === "abierta" &&
        !!p.pregunta &&
        !!p.respuestaModelo &&
        Array.isArray(p.criteriosClave) &&
        p.criteriosClave.length > 0
    );
    const respuestas = Array.isArray(cuerpo.respuestas)
      ? cuerpo.respuestas.filter((r): r is string => typeof r === "string")
      : [];

    if (abiertas.length === 0) {
      return Response.json(
        { error: "Debes enviar las preguntas abiertas con su respuestaModelo y criteriosClave." },
        { status: 400 }
      );
    }
    if (respuestas.length < abiertas.length) {
      return Response.json(
        {
          error: `Faltan respuestas del estudiante: se esperaban ${abiertas.length} y se recibieron ${respuestas.length}. Envía el arreglo 'respuestas' alineado por índice con las preguntas abiertas.`,
        },
        { status: 400 }
      );
    }

    const resultado = await evaluarRespuestasAbiertas({
      preguntas: abiertas,
      respuestas,
    });
    console.log(
      `[/api/estudiar] evaluación OK en ${((Date.now() - inicio) / 1000).toFixed(1)}s (${abiertas.length} respuestas, nota=${resultado.notaFinal})`
    );
    return Response.json({
      titulo: "Evaluación de respuestas abiertas",
      evaluacion: resultado,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : "Error inesperado al evaluar las respuestas.";
    console.error(
      `[/api/estudiar] ERROR tras ${((Date.now() - inicio) / 1000).toFixed(1)}s:`,
      error
    );
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
