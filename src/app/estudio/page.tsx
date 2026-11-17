"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  Brain,
  ClipboardList,
  Loader2,
  XCircle,
} from "lucide-react";
import CargadorPDF from "@/components/estudio/CargadorPDF";
import { PanelCuestionario, PanelResumen } from "@/components/estudio/Cuestionario";
import type {
  DificultadCuestionario,
  ModoEstudio,
  PdfCargado,
  ResultadoEstudio,
  TipoCuestionario,
} from "@/types/estudio";

const dificultades: { id: DificultadCuestionario; nombre: string }[] = [
  { id: "facil", nombre: "Fácil" },
  { id: "media", nombre: "Media" },
  { id: "dificil", nombre: "Difícil (Universitario)" },
];

const tiposPregunta: { id: TipoCuestionario; nombre: string }[] = [
  { id: "multiple", nombre: "Selección múltiple" },
  { id: "abierta", nombre: "Respuesta escrita (Abierta)" },
  { id: "mixto", nombre: "Mixto" },
];

const modos: {
  id: ModoEstudio;
  nombre: string;
  descripcion: string;
  icono: typeof Brain;
}[] = [
  {
    id: "cuestionario",
    nombre: "Cuestionario",
    descripcion: "Preguntas con calificación, incluso escritas por ti",
    icono: ClipboardList,
  },
  {
    id: "resumen",
    nombre: "Resumen",
    descripcion: "Puntos clave, conceptos y conclusiones",
    icono: Brain,
  },
];

export default function PaginaEstudio() {
  const [archivos, setArchivos] = useState<PdfCargado[]>([]);
  const [modo, setModo] = useState<ModoEstudio>("cuestionario");
  const [numPreguntas, setNumPreguntas] = useState(10);
  const [dificultad, setDificultad] =
    useState<DificultadCuestionario>("media");
  const [tipoCuestionario, setTipoCuestionario] =
    useState<TipoCuestionario>("multiple");
  const [resultado, setResultado] = useState<ResultadoEstudio | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controladorRef = useRef<AbortController | null>(null);

  const textoCombinado = useMemo(
    () =>
      archivos
        .filter((a) => a.estado === "listo" && a.texto)
        .map((a) => a.texto)
        .join("\n\n"),
    [archivos]
  );

  const hayTexto = textoCombinado.length >= 200;
  const nombreFuentes =
    archivos
      .filter((a) => a.estado === "listo")
      .map((a) => a.nombre)
      .join(", ") || "Material de estudio";

  async function estudiar() {
    setCargando(true);
    setError(null);
    setResultado(null);
    const controlador = new AbortController();
    controladorRef.current = controlador;
    const temporizador = setTimeout(() => controlador.abort(), 50_000);
    try {
      const respuesta = await fetch("/api/estudiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: textoCombinado,
          modo,
          numPreguntas,
          tituloFuente: nombreFuentes,
          dificultad,
          tipoCuestionario,
        }),
        signal: controlador.signal,
      });
      const datos = (await respuesta.json()) as ResultadoEstudio & {
        error?: string;
      };
      if (!respuesta.ok || (!datos.cuestionario && !datos.resumen)) {
        throw new Error(
          datos.error || "No se pudo generar el material de estudio."
        );
      }
      setResultado(datos);
      requestAnimationFrame(() => {
        document
          .getElementById("resultado-estudio")
          ?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError(
          'La petición se canceló: tardó más de 50 segundos o pulsaste "Cancelar". Inténtalo de nuevo.'
        );
      } else {
        setError(e instanceof Error ? e.message : "Error inesperado.");
      }
    } finally {
      clearTimeout(temporizador);
      controladorRef.current = null;
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8 lg:px-0">
      <header className="animar-aparecer text-center md:text-left">
        <span className="chip">
          <BookOpenCheck size={13} />
          Módulo 2 · Estudio inteligente
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Estudia con tus{" "}
          <span className="texto-gradiente">PDFs ilimitados</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Sube tus apuntes o libros en PDF, extrae el texto en tu propio
          navegador y genera cuestionarios o resúmenes con IA.
        </p>
      </header>

      {/* Paso 1 · Subir PDFs */}
      <CargadorPDF archivos={archivos} alCambiar={setArchivos} />

      {/* Paso 2 · Configurar qué estudiar */}
      <section className="tarjeta animar-aparecer space-y-5 p-6 sm:p-8">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">
            Paso 2 · Configura qué estudiar
          </h2>
          <p className="text-xs text-muted">
            Elige el modo de estudio según lo que necesites hoy.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {modos.map((m) => (
            <button
              key={m.id}
              onClick={() => setModo(m.id)}
              className={`rounded-xl border p-4 text-left transition ${
                modo === m.id
                  ? "border-brand bg-brand/10 shadow-[0_0_0_3px] shadow-brand/20"
                  : "border-slate-200 bg-foreground/[0.03] hover:border-brand/50 dark:border-slate-800"
              }`}
            >
              <span className="flex items-center gap-2 font-bold">
                <m.icono
                  size={16}
                  className={modo === m.id ? "text-brand" : "text-muted"}
                />
                {m.nombre}
              </span>
              <span className="mt-1 block text-xs text-muted">
                {m.descripcion}
              </span>
            </button>
          ))}
        </div>

        {modo === "cuestionario" && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">
                  Nivel de dificultad
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {dificultades.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDificultad(d.id)}
                      className={`rounded-xl border px-2 py-2.5 text-[11px] font-semibold leading-tight transition sm:text-xs ${
                        dificultad === d.id
                          ? "border-brand bg-brand/10 text-brand shadow-[0_0_0_3px] shadow-brand/20"
                          : "border-slate-200 bg-foreground/[0.03] hover:border-brand/50 dark:border-slate-800"
                      }`}
                    >
                      {d.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Tipo de preguntas</p>
                <div className="grid grid-cols-3 gap-2">
                  {tiposPregunta.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTipoCuestionario(t.id)}
                      className={`rounded-xl border px-2 py-2.5 text-[11px] font-semibold leading-tight transition sm:text-xs ${
                        tipoCuestionario === t.id
                          ? "border-brand bg-brand/10 text-brand shadow-[0_0_0_3px] shadow-brand/20"
                          : "border-slate-200 bg-foreground/[0.03] hover:border-brand/50 dark:border-slate-800"
                      }`}
                    >
                      {t.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span>Cantidad de preguntas</span>
                <span className="text-brand">{numPreguntas}</span>
              </label>
              <input
                type="range"
                min={3}
                max={30}
                value={numPreguntas}
                onChange={(e) => setNumPreguntas(Number(e.target.value))}
                className="w-full accent-[var(--brand)]"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-500 sm:text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          onClick={estudiar}
          disabled={!hayTexto || cargando}
          className="btn-primario w-full py-4"
        >
          {cargando ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generando {modo === "cuestionario" ? "cuestionario" : "resumen"}…
            </>
          ) : (
            <>
              <Brain size={18} />
              {modo === "cuestionario"
                ? "Generar cuestionario"
                : "Generar resumen"}
            </>
          )}
        </button>

        {cargando && (
          <button
            onClick={() => controladorRef.current?.abort()}
            className="btn-secundario w-full"
          >
            <XCircle size={15} />
            Cancelar
          </button>
        )}
        {!hayTexto && archivos.length > 0 && (
          <p className="text-center text-xs text-muted">
            Espera a que al menos un PDF termine de procesarse (o carga uno con
            texto legible).
          </p>
        )}
      </section>

      {/* Paso 3 · Área de resultados */}
      <div id="resultado-estudio" className="space-y-6">
        {cargando && (
          <div className="tarjeta animar-aparecer flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 size={32} className="animate-spin text-brand" />
            <p className="text-sm font-semibold">
              La IA está analizando tu material…
            </p>
            <p className="text-xs text-muted">
              Está leyendo{" "}
              {textoCombinado.length.toLocaleString("es")} caracteres extraídos
              de tus PDFs.
            </p>
          </div>
        )}
        {!cargando && resultado?.cuestionario && (
          <PanelCuestionario
            titulo={resultado.titulo}
            preguntas={resultado.cuestionario.preguntas}
            alRepetir={() => setResultado(null)}
          />
        )}
        {!cargando && resultado?.resumen && (
          <PanelResumen resumen={resultado.resumen} />
        )}
      </div>
    </div>
  );
}
