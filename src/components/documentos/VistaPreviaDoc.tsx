"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Download,
  FileDown,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { generarApa7 } from "@/lib/formatos/apa7";
import { generarIeee } from "@/lib/formatos/ieee";
import type { DatosPortada, DocumentoEstructurado } from "@/types/documento";

interface Props {
  documento: DocumentoEstructurado;
  portada: DatosPortada;
  alRegenerar: () => void;
}

function nombreArchivo(doc: DocumentoEstructurado, portada: DatosPortada): string {
  const base = (portada.titulo || doc.titulo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return `${base || "trabajo"}_${doc.norma === "apa7" ? "APA7" : "IEEE"}.docx`;
}

export default function VistaPreviaDoc({ documento, portada, alRegenerar }: Props) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esApa = documento.norma === "apa7";

  async function descargar() {
    setDescargando(true);
    setError(null);
    try {
      const blob = esApa
        ? await generarApa7(documento, portada)
        : await generarIeee(documento, portada);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivo(documento, portada);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo generar el archivo .docx."
      );
    } finally {
      setDescargando(false);
    }
  }

  const palabras = documento.secciones.reduce(
    (total, s) =>
      total +
      s.parrafos.join(" ").split(/\s+/).length +
      (s.subsecciones ?? []).reduce(
        (t, sub) => t + sub.parrafos.join(" ").split(/\s+/).length,
        0
      ),
    0
  );

  return (
    <section className="tarjeta animar-aparecer space-y-5 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">
            Paso 4 · Vista previa y descarga
          </h2>
          <p className="text-xs text-muted">
            Formato {esApa ? "APA 7" : "IEEE"} · ~
            {palabras.toLocaleString("es")} palabras ·{" "}
            {documento.secciones.length} secciones ·{" "}
            {documento.referencias.length} referencias
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={alRegenerar} className="btn-secundario">
            <RotateCcw size={14} />
            Regenerar
          </button>
          <button
            onClick={descargar}
            disabled={descargando}
            className="btn-primario px-5 py-2.5 text-xs"
          >
            {descargando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            Descargar .docx
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-500">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      {/* Hoja simulada */}
      <div className="scroll-fino max-h-[32rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-inner sm:p-10">
        <article
          className={`mx-auto max-w-2xl text-[13px] leading-relaxed sm:text-sm ${
            esApa ? "font-serif" : ""
          }`}
        >
          {/* Encabezado tipo IEEE / título tipo APA */}
          {esApa ? (
            <>
              <h1 className="text-center font-bold uppercase tracking-wide">
                {documento.titulo}
              </h1>
              {documento.resumen && (
                <div className="mt-6">
                  <p className="text-center font-bold">Resumen</p>
                  <p className="mt-2 indent-8">{documento.resumen}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-center text-xl font-bold">{documento.titulo}</h1>
              <p className="mt-2 text-center italic text-slate-600">
                {portada.autor}
                <br />
                {portada.institucion}
              </p>
              {documento.abstract && (
                <p className="mt-5 indent-6">
                  <span className="font-bold italic">Abstract—</span>
                  <span className="italic">{documento.abstract}</span>
                </p>
              )}
              {documento.palabrasClave?.length ? (
                <p className="mt-2 indent-6">
                  <span className="font-bold italic">Index Terms—</span>
                  <span className="italic">
                    {documento.palabrasClave.join(", ")}.
                  </span>
                </p>
              ) : null}
            </>
          )}

          {/* Secciones */}
          <div className="mt-6 space-y-4">
            {documento.secciones.map((seccion, i) => (
              <section key={i}>
                <h2 className="font-bold">{seccion.titulo}</h2>
                {seccion.parrafos.map((parrafo, j) => (
                  <p key={j} className="mt-2 indent-8 text-justify">
                    {parrafo}
                  </p>
                ))}
                {(seccion.subsecciones ?? []).map((sub, k) => (
                  <div key={k} className="mt-3">
                    <p className="font-semibold italic">{sub.titulo}</p>
                    {sub.parrafos.map((parrafo, j) => (
                      <p key={j} className="mt-1 indent-8 text-justify">
                        {parrafo}
                      </p>
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>

          {/* Referencias */}
          <div className="mt-8 border-t border-slate-200 pt-4">
            <p className="text-center font-bold">Referencias</p>
            <ol className="mt-3 space-y-2">
              {documento.referencias.map((ref, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[12px] leading-relaxed sm:text-[13px]"
                >
                  {esApa ? (
                    <BookMarked size={13} className="mt-0.5 shrink-0 text-slate-400" />
                  ) : (
                    <span className="font-medium">[{i + 1}]</span>
                  )}
                  <span>{esApa ? ref : ref.replace(/^\[\d+\]\s*/, "")}</span>
                </li>
              ))}
            </ol>
          </div>
        </article>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted">
        <BookOpen size={13} />
        La descarga aplica el formato completo real (márgenes, tipografía,
        interlineado y columnas) mediante la librería <code>docx</code>.
        <Download size={13} className="shrink-0" />
      </p>
    </section>
  );
}
