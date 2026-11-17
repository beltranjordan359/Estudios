"use client";

import { useRef, useState } from "react";
import { AlertTriangle, GraduationCap, Loader2, XCircle } from "lucide-react";
import FormularioTarea, { type ValoresFormulario } from "@/components/documentos/FormularioTarea";
import VistaPreviaDoc from "@/components/documentos/VistaPreviaDoc";
import type { DocumentoEstructurado } from "@/types/documento";

export default function PaginaTareas() {
  const [documento, setDocumento] = useState<DocumentoEstructurado | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<ValoresFormulario | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controladorRef = useRef<AbortController | null>(null);

  async function generar(valores: ValoresFormulario) {
    setCargando(true);
    setError(null);
    setUltimoEnvio(valores);
    const controlador = new AbortController();
    controladorRef.current = controlador;
    const temporizador = setTimeout(() => controlador.abort(), 150_000);
    try {
      const respuesta = await fetch("/api/generar-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
        signal: controlador.signal,
      });
      const datos = (await respuesta.json()) as {
        documento?: DocumentoEstructurado;
        error?: string;
      };
      if (!respuesta.ok || !datos.documento) {
        throw new Error(datos.error || "No se pudo generar el documento.");
      }
      setDocumento(datos.documento);
      requestAnimationFrame(() => {
        document
          .getElementById("vista-previa")
          ?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError(
          'La petición se canceló: tardó más de 150 segundos o pulsaste "Cancelar". Prueba con una extensión menor e inténtalo de nuevo.'
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
          <GraduationCap size={13} />
          Módulo 1 · Trabajos académicos
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Generador de trabajos en{" "}
          <span className="texto-gradiente">APA 7 e IEEE</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Describe el trabajo, agrega tus fuentes (links, PDFs, libros o
          repositorios) y la IA redacta portada, resumen, secciones y
          referencias basándose en ellas. Descárgalo como un .docx con formato
          real.
        </p>
      </header>

      {error && (
        <div className="animar-aparecer flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-500">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">No se pudo generar el trabajo</p>
            <p className="mt-1 text-xs sm:text-sm">{error}</p>
          </div>
        </div>
      )}

      {cargando && (
        <div className="tarjeta animar-aparecer flex flex-col items-center gap-3 p-10 text-center">
          <Loader2 size={32} className="animate-spin text-brand" />
          <p className="text-sm font-semibold">
            La IA está redactando tu trabajo…
          </p>
          <p className="text-xs text-muted">
            Secciones, desarrollo y referencias a partir de tu tema y tus
            fuentes de información. Esto puede tardar uno o dos minutos para
            trabajos largos.
          </p>
          <button
            onClick={() => controladorRef.current?.abort()}
            className="btn-secundario"
          >
            <XCircle size={14} />
            Cancelar
          </button>
        </div>
      )}

      <FormularioTarea alEnviar={generar} cargando={cargando} />

      {!cargando && documento && ultimoEnvio && (
        <div id="vista-previa">
          <VistaPreviaDoc
            documento={documento}
            portada={ultimoEnvio.portada}
            alRegenerar={() => generar(ultimoEnvio)}
          />
        </div>
      )}
    </div>
  );
}
