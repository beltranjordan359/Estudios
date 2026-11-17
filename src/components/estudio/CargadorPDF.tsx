"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  FileUp,
  Trash2,
  XCircle,
} from "lucide-react";
import { formatearTamano, procesarArchivosPdf } from "@/lib/pdf/extractor";
import type { PdfCargado } from "@/types/estudio";

interface Props {
  archivos: PdfCargado[];
  alCambiar: React.Dispatch<React.SetStateAction<PdfCargado[]>>;
}

const estados: Record<
  PdfCargado["estado"],
  { color: string; texto: string }
> = {
  pendiente: { color: "text-muted", texto: "En cola" },
  procesando: { color: "text-brand", texto: "Procesando" },
  listo: { color: "text-emerald-500", texto: "Listo" },
  error: { color: "text-red-500", texto: "Error" },
};

export default function CargadorPDF({ archivos, alCambiar }: Props) {
  const [arrastrando, setArrastrando] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);

  async function manejarArchivos(lista: FileList | File[] | null) {
    if (!lista) return;
    const nuevos = Array.from(lista).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (nuevos.length === 0) return;

    await procesarArchivosPdf(nuevos, (actualizado) => {
      alCambiar((actuales) => {
        const indice = actuales.findIndex((a) => a.id === actualizado.id);
        if (indice === -1) return [...actuales, actualizado];
        const copia = [...actuales];
        copia[indice] = actualizado;
        return copia;
      });
    });
  }

  function quitar(id: string) {
    alCambiar((actuales) => actuales.filter((a) => a.id !== id));
  }

  function limpiarTodo() {
    alCambiar([]);
  }

  const totalPaginas = archivos.reduce((t, a) => t + a.paginas, 0);
  const listos = archivos.filter((a) => a.estado === "listo");

  return (
    <section className="tarjeta animar-aparecer space-y-4 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">
            Paso 1 · Sube tus PDFs
          </h2>
          <p className="text-xs text-muted">
            Sin límite de cantidad ni tamaño: todo se procesa en tu navegador.
          </p>
        </div>
        {archivos.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="chip">
              <CheckCircle2 size={12} />
              {listos.length}/{archivos.length} listos · {totalPaginas} páginas
            </span>
            <button
              onClick={limpiarTodo}
              className="btn-secundario px-3 py-1.5 text-xs hover:!text-red-500"
            >
              <Trash2 size={12} />
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Zona drag & drop amplia */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => entradaRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") entradaRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void manejarArchivos(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition sm:p-16 ${
          arrastrando
            ? "scale-[1.01] border-brand bg-brand/10 shadow-[0_0_0_4px] shadow-brand/20"
            : "border-slate-300 hover:border-brand hover:bg-brand/5 dark:border-slate-700"
        }`}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-brand/30">
          <FileUp size={28} />
        </span>
        <p className="text-base font-bold sm:text-lg">
          Arrastra y suelta tus PDFs aquí
        </p>
        <p className="text-xs text-muted sm:text-sm">
          o haz clic para explorar · múltiples archivos permitidos
        </p>
        <input
          ref={entradaRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            void manejarArchivos(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Lista de archivos */}
      {archivos.length > 0 && (
        <ul className="scroll-fino max-h-72 space-y-2 overflow-y-auto pr-1">
          {archivos.map((archivo) => {
            const e = estados[archivo.estado];
            return (
              <li
                key={archivo.id}
                className="rounded-xl border border-slate-200 bg-foreground/[0.03] p-4 dark:border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <FileText size={18} className={`shrink-0 ${e.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {archivo.nombre}
                    </p>
                    <p className="text-xs text-muted">
                      {formatearTamano(archivo.tamano)}
                      {archivo.paginas > 0 && ` · ${archivo.paginas} págs`} ·{" "}
                      <span className={e.color}>{e.texto}</span>
                      {archivo.error ? ` — ${archivo.error}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => quitar(archivo.id)}
                    aria-label={`Quitar ${archivo.nombre}`}
                    className="shrink-0 rounded-lg p-1.5 text-muted transition hover:text-red-500"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
                {archivo.estado === "procesando" && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="barra-progreso h-full rounded-full bg-gradient-to-r from-brand to-brand-2"
                      style={{ width: `${Math.max(4, archivo.progreso)}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
