"use client";

import { useState } from "react";
import {
  Award,
  BookOpen,
  Brain,
  CheckCircle2,
  Lightbulb,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  EvaluacionAbierta,
  PreguntaCuestionario,
  ResultadoEvaluacionAbierta,
  ResumenEstructurado,
} from "@/types/estudio";

interface PropsCuestionario {
  titulo: string;
  preguntas: PreguntaCuestionario[];
  alRepetir: () => void;
}

interface PropsResumen {
  resumen: ResumenEstructurado;
}

function BarraProgreso({ valor }: { valor: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
      <div
        className="barra-progreso h-full rounded-full bg-gradient-to-r from-brand to-brand-2"
        style={{ width: `${valor}%` }}
      />
    </div>
  );
}

export function PanelCuestionario({
  titulo,
  preguntas,
  alRepetir,
}: PropsCuestionario) {
  const [elegidas, setElegidas] = useState<Record<number, number>>({});
  const [redacciones, setRedacciones] = useState<Record<number, string>>({});
  const [evaluaciones, setEvaluaciones] = useState<
    Record<number, EvaluacionAbierta>
  >({});
  const [notaFinalIA, setNotaFinalIA] = useState<number | null>(null);
  const [calificando, setCalificando] = useState(false);
  const [errorEval, setErrorEval] = useState<string | null>(null);

  const indicesMultiples = preguntas
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.tipo === "multiple")
    .map(({ i }) => i);
  const indicesAbiertas = preguntas
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.tipo === "abierta")
    .map(({ i }) => i);

  const respondidasMultiples = indicesMultiples.filter(
    (i) => elegidas[i] !== undefined
  ).length;
  const aciertos = indicesMultiples.filter(
    (i) => elegidas[i] === preguntas[i].respuestaCorrecta
  ).length;
  const respondidasAbiertas = indicesAbiertas.filter(
    (i) => (redacciones[i] ?? "").trim().length > 0
  ).length;

  const respondidas = respondidasMultiples + respondidasAbiertas;
  const notaMultiple =
    indicesMultiples.length > 0
      ? (aciertos / indicesMultiples.length) * 10
      : 0;
  const terminado = respondidas === preguntas.length;
  const puedeCalificar =
    !calificando &&
    respondidasAbiertas === indicesAbiertas.length &&
    indicesAbiertas.length > 0;
  const evaluado = notaFinalIA !== null;

  function responder(indicePregunta: number, indiceOpcion: number) {
    if (elegidas[indicePregunta] !== undefined) return;
    setElegidas((r) => ({ ...r, [indicePregunta]: indiceOpcion }));
  }

  function redactar(indicePregunta: number, texto: string) {
    if (evaluado) return;
    setRedacciones((r) => ({ ...r, [indicePregunta]: texto }));
  }

  function reiniciar() {
    setElegidas({});
    setRedacciones({});
    setEvaluaciones({});
    setNotaFinalIA(null);
    setErrorEval(null);
    setCalificando(false);
    alRepetir();
  }

  async function calificarConIA() {
    if (indicesAbiertas.length === 0 || calificando) return;
    setCalificando(true);
    setErrorEval(null);
    try {
      const respuesta = await fetch("/api/estudiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "evaluar",
          preguntas: indicesAbiertas.map((i) => preguntas[i]),
          respuestas: indicesAbiertas.map((i) =>
            (redacciones[i] ?? "").trim()
          ),
        }),
      });
      const datos = (await respuesta.json()) as {
        evaluacion?: ResultadoEvaluacionAbierta;
        error?: string;
      };
      if (!respuesta.ok || !datos.evaluacion) {
        throw new Error(
          datos.error || "No se pudieron calificar las respuestas."
        );
      }
      const mapa: Record<number, EvaluacionAbierta> = {};
      datos.evaluacion.evaluaciones.forEach((e, k) => {
        const indice = indicesAbiertas[k];
        if (indice !== undefined) mapa[indice] = e;
      });
      setEvaluaciones(mapa);
      setNotaFinalIA(datos.evaluacion.notaFinal);
    } catch (e) {
      setErrorEval(
        e instanceof Error
          ? e.message
          : "Error inesperado al calificar las respuestas."
      );
    } finally {
      setCalificando(false);
    }
  }

  return (
    <section className="tarjeta animar-aparecer space-y-5 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <ListChecks size={20} className="text-brand" />
            {titulo}
          </h2>
          <p className="text-xs text-muted">
            Paso 3 · Resultados · {respondidas}/{preguntas.length} respondidas
            {indicesMultiples.length > 0 ? ` · ${aciertos} correctas` : ""}
          </p>
        </div>
        <button onClick={reiniciar} className="btn-secundario">
          <RotateCcw size={14} />
          Nuevo cuestionario
        </button>
      </div>

      <BarraProgreso valor={(respondidas / preguntas.length) * 100} />

      {indicesAbiertas.length === 0 && terminado && (
        <div className="animar-aparecer flex items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-brand/15 to-brand-2/15 p-5">
          <Award size={36} className="text-brand" />
          <div>
            <p className="text-3xl font-extrabold">
              {notaMultiple.toFixed(1)}
              <span className="text-sm text-muted"> / 10</span>
            </p>
            <p className="text-xs text-muted">
              {notaMultiple >= 8
                ? "¡Excelente! Estás listo para el examen."
                : notaMultiple >= 5
                ? "Vas bien. Repasa las preguntas falladas."
                : "Revisa el material y vuelve a intentarlo."}
            </p>
          </div>
        </div>
      )}

      {evaluado && (
        <div className="animar-aparecer flex items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-brand/15 to-brand-2/15 p-5">
          <Award size={36} className="text-brand" />
          <div>
            <p className="text-3xl font-extrabold">
              {notaFinalIA.toFixed(1)}
              <span className="text-sm text-muted"> / 10</span>
            </p>
            <p className="text-xs text-muted">
              Calificación de la IA sobre tus respuestas escritas ·{" "}
              {notaFinalIA >= 8
                ? "¡Excelente redacción y comprensión!"
                : notaFinalIA >= 5
                ? "Vas bien. Lee los comentarios y repasa lo que faltó."
                : "Revisa la respuesta modelo ideal de cada pregunta."}
            </p>
          </div>
        </div>
      )}

      <ol className="space-y-5">
        {preguntas.map((pregunta, i) => {
          if (pregunta.tipo === "abierta") {
            return (
              <PreguntaAbierta
                key={i}
                indice={i}
                pregunta={pregunta}
                redaccion={redacciones[i] ?? ""}
                evaluacion={evaluaciones[i]}
                bloqueada={evaluado}
                onRedactar={redactar}
              />
            );
          }

          const elegida = elegidas[i];
          const respondida = elegida !== undefined;
          const correcta = respondida && elegida === pregunta.respuestaCorrecta;
          return (
            <li
              key={i}
              className="rounded-xl border border-slate-200 bg-foreground/[0.03] p-5 dark:border-slate-800"
            >
              <p className="flex items-start gap-2 text-sm font-semibold">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                    respondida
                      ? correcta
                        ? "bg-emerald-500"
                        : "bg-red-500"
                      : "bg-brand"
                  }`}
                >
                  {i + 1}
                </span>
                {pregunta.pregunta}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {pregunta.opciones.map((opcion, j) => {
                  const esElegida = respondida && elegida === j;
                  const esCorrecta =
                    respondida && j === pregunta.respuestaCorrecta;
                  return (
                    <button
                      key={j}
                      onClick={() => responder(i, j)}
                      disabled={respondida}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition sm:text-sm ${
                        respondida
                          ? esCorrecta
                            ? "border-emerald-500 bg-emerald-500/10 font-semibold"
                            : esElegida
                            ? "border-red-500 bg-red-500/10"
                            : "border-transparent opacity-60"
                          : "border-slate-200 bg-white/50 hover:border-brand/60 hover:bg-brand/5 dark:border-slate-700 dark:bg-white/5"
                      }`}
                    >
                      {respondida ? (
                        esCorrecta ? (
                          <CheckCircle2
                            size={14}
                            className="shrink-0 text-emerald-500"
                          />
                        ) : esElegida ? (
                          <XCircle size={14} className="shrink-0 text-red-500" />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted" />
                        )
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted" />
                      )}
                      {opcion}
                    </button>
                  );
                })}
              </div>
              {respondida && (
                <p className="animar-aparecer mt-3 flex items-start gap-1.5 rounded-xl bg-brand/10 px-3 py-2 text-xs text-foreground/80">
                  <Lightbulb size={13} className="mt-0.5 shrink-0 text-brand" />
                  {pregunta.explicacion}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {indicesAbiertas.length > 0 && !evaluado && (
        <div className="space-y-2">
          <button
            onClick={calificarConIA}
            disabled={!puedeCalificar}
            className="btn-primario w-full py-4"
          >
            {calificando ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                La IA está calificando tus respuestas…
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Calificar mis respuestas con IA
              </>
            )}
          </button>
          {!puedeCalificar && !calificando && (
            <p className="text-center text-xs text-muted">
              Redacta tus respuestas a las {indicesAbiertas.length}{" "}
              {indicesAbiertas.length === 1
                ? "pregunta abierta"
                : "preguntas abiertas"}{" "}
              para poder calificarlas.
            </p>
          )}
          {errorEval && (
            <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-500 sm:text-sm">
              <XCircle size={15} className="mt-0.5 shrink-0" />
              {errorEval}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface PropsPreguntaAbierta {
  indice: number;
  pregunta: PreguntaCuestionario;
  redaccion: string;
  evaluacion?: EvaluacionAbierta;
  bloqueada: boolean;
  onRedactar: (indice: number, texto: string) => void;
}

function PreguntaAbierta({
  indice,
  pregunta,
  redaccion,
  evaluacion,
  bloqueada,
  onRedactar,
}: PropsPreguntaAbierta) {
  const nota = evaluacion?.nota;
  const colorNumero =
    nota === undefined
      ? "bg-brand"
      : nota >= 5
      ? "bg-emerald-500"
      : "bg-red-500";

  return (
    <li className="rounded-xl border border-slate-200 bg-foreground/[0.03] p-5 dark:border-slate-800">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${colorNumero}`}
        >
          {indice + 1}
        </span>
        {pregunta.pregunta}
      </p>
      <textarea
        value={redaccion}
        onChange={(e) => onRedactar(indice, e.target.value)}
        disabled={bloqueada}
        rows={4}
        placeholder="Escribe tu respuesta con tus propias palabras…"
        className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white/50 px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-muted focus:border-brand/60 focus:ring-2 focus:ring-brand/20 disabled:opacity-70 dark:border-slate-700 dark:bg-white/5"
      />
      {evaluacion && (
        <div className="animar-aparecer mt-3 space-y-2.5 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Sparkles size={14} className="text-brand" />
            Calificación IA:{" "}
            <span
              className={
                evaluacion.nota >= 5 ? "text-emerald-500" : "text-red-500"
              }
            >
              {evaluacion.nota.toFixed(1)} / 10
            </span>
          </p>
          {evaluacion.comentario && (
            <p className="text-xs leading-relaxed text-foreground/80">
              {evaluacion.comentario}
            </p>
          )}
          {evaluacion.aciertos.length > 0 && (
            <ul className="space-y-1">
              {evaluacion.aciertos.map((acierto, k) => (
                <li key={k} className="flex items-start gap-1.5 text-xs">
                  <CheckCircle2
                    size={12}
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                  {acierto}
                </li>
              ))}
            </ul>
          )}
          {evaluacion.faltantes.length > 0 && (
            <div>
              <p className="text-xs font-bold text-red-500">
                Te faltó incluir:
              </p>
              <ul className="mt-1 space-y-1">
                {evaluacion.faltantes.map((falta, k) => (
                  <li key={k} className="flex items-start gap-1.5 text-xs">
                    <XCircle
                      size={12}
                      className="mt-0.5 shrink-0 text-red-500"
                    />
                    {falta}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg bg-foreground/[0.04] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
              <Lightbulb size={12} />
              Respuesta modelo ideal
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              {evaluacion.explicacionIdeal}
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

export function PanelResumen({ resumen }: PropsResumen) {
  return (
    <section className="tarjeta animar-aparecer space-y-5 p-6 sm:p-8">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <BookOpen size={20} className="text-brand" />
          {resumen.titulo}
        </h2>
        <p className="text-xs text-muted">Paso 3 · Resultados</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-brand/15 to-brand-2/15 p-5">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
          <Brain size={13} />
          Idea principal
        </p>
        <p className="text-sm leading-relaxed">{resumen.ideaPrincipal}</p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Puntos clave</h3>
        <ul className="space-y-2">
          {resumen.puntosClave.map((punto, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-xl border border-slate-200 bg-foreground/[0.03] px-4 py-2.5 text-sm dark:border-slate-800"
            >
              <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-500" />
              {punto}
            </li>
          ))}
        </ul>
      </div>

      {resumen.conceptosClave.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">Conceptos clave</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {resumen.conceptosClave.map((concepto, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-foreground/[0.03] p-4 dark:border-slate-800"
              >
                <p className="text-sm font-bold text-brand">{concepto.termino}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {concepto.definicion}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {resumen.conclusiones.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">Conclusiones para repasar</h3>
          <ol className="space-y-2">
            {resumen.conclusiones.map((conclusion, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {conclusion}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
