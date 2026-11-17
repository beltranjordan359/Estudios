"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  FileUp,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import mammoth from "mammoth";
import type { DatosPortada, NormaFormato } from "@/types/documento";
import { extraerTextoReferencia } from "@/lib/documentos/extractorReferencia";
import { extraerTextoPdf } from "@/lib/pdf/extractor";

export interface ValoresFormulario {
  norma: NormaFormato;
  tema: string;
  instrucciones: string;
  paginas: number;
  portada: DatosPortada;
  textoReferencia?: string;
  enlacesFuentes?: string[];
  textosFuentes?: { nombre: string; contenido: string }[];
}

interface FuenteTextoCargada {
  id: string;
  nombre: string;
  contenido: string;
  paginas?: number;
  estado: "procesando" | "listo" | "error";
  error?: string;
}

const MAX_ENLACES = 8;
const MAX_FUENTES_TEXTO = 10;
const MAX_CARACTERES_FUENTE = 15_000;

function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto === -1 ? "" : nombre.slice(punto).toLowerCase();
}

function idDe(archivo: File): string {
  return `${archivo.name}-${archivo.size}-${archivo.lastModified}`;
}

/** Extracción de texto en el navegador para las fuentes de contenido
    (PDFs con conteo de páginas, Word y texto plano). */
async function extraerContenidoFuente(
  archivo: File
): Promise<{ texto: string; paginas?: number }> {
  const extension = extensionDe(archivo.name);
  if (extension === ".pdf") {
    return await extraerTextoPdf(archivo);
  }
  if (extension === ".docx") {
    const { value } = await mammoth.extractRawText({
      arrayBuffer: await archivo.arrayBuffer(),
    });
    return { texto: value };
  }
  if (extension === ".txt" || extension === ".md") {
    return { texto: await archivo.text() };
  }
  throw new Error(
    "Formato no soportado. Usa archivos .pdf, .docx, .txt o .md."
  );
}

interface Props {
  alEnviar: (valores: ValoresFormulario) => void;
  cargando: boolean;
}

const normas: {
  id: NormaFormato;
  nombre: string;
  detalle: string;
}[] = [
  {
    id: "apa7",
    nombre: "APA 7",
    detalle: "Ciencias sociales · interlineado doble · portada centrada",
  },
  {
    id: "ieee",
    nombre: "IEEE",
    detalle: "Ingeniería y tecnología · abstract · 2 columnas",
  },
];

function TituloPaso({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-xs font-bold text-white shadow-md">
        {numero}
      </span>
      <h3 className="text-sm font-bold sm:text-base">{titulo}</h3>
    </div>
  );
}

export default function FormularioTarea({ alEnviar, cargando }: Props) {
  const [norma, setNorma] = useState<NormaFormato>("apa7");
  const [tema, setTema] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [paginas, setPaginas] = useState(5);
  const [portada, setPortada] = useState<DatosPortada>(() => ({
    titulo: "",
    autor: "",
    institucion: "",
    curso: "",
    profesor: "",
    ciudad: "",
    fecha: "",
  }));
  const [archivoReferencia, setArchivoReferencia] = useState<File | null>(null);
  const [textoReferencia, setTextoReferencia] = useState("");
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);

  const [enlacesFuentes, setEnlacesFuentes] = useState<string[]>([]);
  const [nuevoEnlace, setNuevoEnlace] = useState("");
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null);
  const [fuentesTexto, setFuentesTexto] = useState<FuenteTextoCargada[]>([]);
  const inputFuentesRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPortada((p) => ({ ...p, fecha: new Date().toISOString().slice(0, 10) }));
  }, []);

  function actualizarPortada(campo: keyof DatosPortada, valor: string) {
    setPortada((p) => ({ ...p, [campo]: valor }));
  }

  async function seleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!archivo) return;
    setArchivoReferencia(archivo);
    setProcesandoArchivo(true);
    setErrorArchivo(null);
    setTextoReferencia("");
    try {
      const texto = await extraerTextoReferencia(archivo);
      setTextoReferencia(texto);
    } catch (err) {
      setArchivoReferencia(null);
      setErrorArchivo(
        err instanceof Error ? err.message : "No se pudo leer el archivo."
      );
    } finally {
      setProcesandoArchivo(false);
    }
  }

  function quitarArchivo() {
    setArchivoReferencia(null);
    setTextoReferencia("");
    setErrorArchivo(null);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
  }

  function agregarEnlace() {
    const url = nuevoEnlace.trim();
    setErrorEnlace(null);
    if (!url) return;
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setErrorEnlace("Pega una URL válida que empiece por http:// o https://");
      return;
    }
    if (enlacesFuentes.some((e) => e.toLowerCase() === url.toLowerCase())) {
      setErrorEnlace("Ese enlace ya está en la lista.");
      setNuevoEnlace("");
      return;
    }
    if (enlacesFuentes.length >= MAX_ENLACES) {
      setErrorEnlace(`Máximo ${MAX_ENLACES} enlaces por trabajo.`);
      return;
    }
    setEnlacesFuentes((lista) => [...lista, url]);
    setNuevoEnlace("");
  }

  function quitarEnlace(indice: number) {
    setEnlacesFuentes((lista) => lista.filter((_, i) => i !== indice));
    setErrorEnlace(null);
  }

  async function seleccionarFuentes(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (archivos.length === 0) return;
    const entradas: FuenteTextoCargada[] = archivos.map((archivo) => ({
      id: idDe(archivo),
      nombre: archivo.name,
      contenido: "",
      estado: "procesando",
    }));
    setFuentesTexto((prev) => {
      const existentes = new Set(prev.map((f) => f.id));
      return [...prev, ...entradas.filter((n) => !existentes.has(n.id))];
    });
    for (const archivo of archivos) {
      const id = idDe(archivo);
      try {
        const { texto, paginas } = await extraerContenidoFuente(archivo);
        const limpio = texto.replace(/\r\n/g, "\n").trim();
        if (!limpio) {
          throw new Error(
            "No se pudo extraer texto (parece vacío o es un documento escaneado sin texto)."
          );
        }
        setFuentesTexto((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  estado: "listo",
                  contenido: limpio.slice(0, MAX_CARACTERES_FUENTE),
                  paginas,
                }
              : f
          )
        );
      } catch (err) {
        setFuentesTexto((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  estado: "error",
                  error:
                    err instanceof Error
                      ? err.message
                      : "No se pudo leer el archivo.",
                }
              : f
          )
        );
      }
    }
  }

  function quitarFuenteTexto(id: string) {
    setFuentesTexto((prev) => prev.filter((f) => f.id !== id));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    alEnviar({
      norma,
      tema,
      instrucciones: instrucciones.trim(),
      paginas,
      portada: {
        ...portada,
        titulo: portada.titulo.trim() || tema.trim(),
      },
      textoReferencia: textoReferencia || undefined,
      enlacesFuentes: enlacesFuentes.length ? enlacesFuentes : undefined,
      textosFuentes: fuentesTexto.some((f) => f.estado === "listo" && f.contenido.trim())
        ? fuentesTexto
            .filter((f) => f.estado === "listo" && f.contenido.trim())
            .slice(0, MAX_FUENTES_TEXTO)
            .map((f) => ({ nombre: f.nombre, contenido: f.contenido }))
        : undefined,
    });
  }

  return (
    <form onSubmit={enviar} className="tarjeta animar-aparecer space-y-6 p-6 sm:p-8">
      {/* Paso 1 · Norma */}
      <div>
        <TituloPaso numero="1" titulo="Elige la norma de formato" />
        <div className="grid gap-3 sm:grid-cols-2">
          {normas.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNorma(n.id)}
              className={`rounded-xl border p-4 text-left transition ${
                norma === n.id
                  ? "border-brand bg-brand/10 shadow-[0_0_0_3px] shadow-brand/20"
                  : "border-slate-200 bg-foreground/[0.03] hover:border-brand/50 dark:border-slate-800"
              }`}
            >
              <span className="flex items-center gap-2 font-bold">
                <FileText
                  size={16}
                  className={norma === n.id ? "text-brand" : "text-muted"}
                />
                {n.nombre}
              </span>
              <span className="mt-1 block text-xs text-muted">{n.detalle}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Paso 2 · Tema */}
      <div>
        <TituloPaso numero="2" titulo="¿Sobre qué trata el trabajo?" />
        <div className="space-y-3">
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Ej.: El impacto de la inteligencia artificial en la educación superior"
            className="campo"
            required
            minLength={5}
          />
          <textarea
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            placeholder="Instrucciones extra del profesor (opcional). Ej: Incluir 2 tablas comparativas, 1 diagrama de arquitectura y enfocar en Linux"
            rows={3}
            className="campo resize-y"
            maxLength={2000}
          />
        </div>
      </div>

      {/* Paso 3 · Extensión */}
      <div>
        <TituloPaso numero="3" titulo="Extensión del contenido" />
        <label className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">Desliza para elegir</span>
          <span className="font-bold text-brand">{paginas} páginas</span>
        </label>
        <input
          type="range"
          min={2}
          max={30}
          value={paginas}
          onChange={(e) => setPaginas(Number(e.target.value))}
          className="w-full accent-[var(--brand)]"
        />
        <p className="mt-1 text-xs text-muted">
          Equivalencia real: la IA redactará ≈{" "}
          <span className="font-semibold text-brand">
            {(paginas * (norma === "apa7" ? 280 : 600)).toLocaleString("es")}
          </span>{" "}
          palabras de cuerpo (~{norma === "apa7" ? "280" : "600"} palabras por
          página en {norma === "apa7" ? "APA 7" : "IEEE"}).
        </p>
      </div>

      {/* Paso 4 · Portada */}
      <div>
        <TituloPaso numero="4" titulo="Datos de la portada" />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={portada.titulo}
            onChange={(e) => actualizarPortada("titulo", e.target.value)}
            placeholder="Título formal (si lo dejas vacío se usa el tema)"
            className="campo sm:col-span-2"
          />
          <input
            value={portada.autor}
            onChange={(e) => actualizarPortada("autor", e.target.value)}
            placeholder="Tu nombre completo *"
            className="campo"
            required
          />
          <input
            value={portada.institucion}
            onChange={(e) => actualizarPortada("institucion", e.target.value)}
            placeholder="Institución / Universidad *"
            className="campo"
            required
          />
          <input
            value={portada.curso}
            onChange={(e) => actualizarPortada("curso", e.target.value)}
            placeholder="Curso / Asignatura"
            className="campo"
          />
          <input
            value={portada.profesor}
            onChange={(e) => actualizarPortada("profesor", e.target.value)}
            placeholder="Profesor(a)"
            className="campo"
          />
          <input
            value={portada.ciudad}
            onChange={(e) => actualizarPortada("ciudad", e.target.value)}
            placeholder="Ciudad"
            className="campo"
          />
          <input
            type="date"
            value={portada.fecha}
            onChange={(e) => actualizarPortada("fecha", e.target.value)}
            className="campo"
          />
        </div>
      </div>

      {/* Paso 5 · Fuentes de información para el contenido */}
      <div>
        <TituloPaso numero="5" titulo="Fuentes de información (Links, PDFs, Libros, Repositorios)" />
        <p className="mb-3 text-xs text-muted">
          Material que servirá de <strong>base del contenido</strong>: artículos,
          documentación, repositorios de GitHub, capítulos de libros, apuntes o
          PDFs. La IA extraerá datos, conceptos y citas reales de estas fuentes
          y las incluirá en la bibliografía.
        </p>

        {/* Enlaces */}
        <div className="mb-2 flex gap-2">
          <div className="relative flex-1">
            <Link2
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={nuevoEnlace}
              onChange={(e) => setNuevoEnlace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarEnlace();
                }
              }}
              placeholder="Pega un enlace: https://… (artículo, documentación o github.com/usuario/repo)"
              className="campo w-full pl-9"
            />
          </div>
          <button
            type="button"
            onClick={agregarEnlace}
            className="btn-secundario shrink-0"
          >
            <Plus size={15} />
            Agregar enlace
          </button>
        </div>
        {errorEnlace && (
          <p className="mb-2 text-xs text-red-500">{errorEnlace}</p>
        )}

        {enlacesFuentes.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {enlacesFuentes.map((enlace, i) => (
              <li
                key={enlace}
                className="flex max-w-full items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 py-1 pl-3 pr-1 text-xs font-medium"
              >
                <Link2 size={12} className="shrink-0 text-brand" />
                <span
                  className="max-w-[200px] truncate sm:max-w-[320px]"
                  title={enlace}
                >
                  {enlace.replace(/^https?:\/\//i, "")}
                </span>
                <button
                  type="button"
                  onClick={() => quitarEnlace(i)}
                  aria-label={`Quitar enlace ${enlace}`}
                  className="shrink-0 rounded-full p-1 text-muted transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Archivos de contenido (múltiples) */}
        <input
          ref={inputFuentesRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          onChange={seleccionarFuentes}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputFuentesRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm font-semibold text-muted transition hover:border-brand/60 hover:text-brand dark:border-slate-700"
        >
          <FileUp size={18} />
          Subir PDFs, Word, libros o apuntes (puedes elegir varios)
        </button>

        {fuentesTexto.length > 0 && (
          <ul className="mt-3 space-y-2">
            {fuentesTexto.map((fuente) => (
              <li
                key={fuente.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                  fuente.estado === "listo"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : fuente.estado === "error"
                      ? "border-red-500/40 bg-red-500/10"
                      : "border-slate-200 bg-foreground/[0.03] dark:border-slate-800"
                }`}
              >
                {fuente.estado === "procesando" ? (
                  <Loader2 size={18} className="shrink-0 animate-spin text-brand" />
                ) : fuente.estado === "listo" ? (
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                ) : (
                  <X size={18} className="shrink-0 text-red-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{fuente.nombre}</p>
                  <p className="text-xs text-muted">
                    {fuente.estado === "procesando"
                      ? "Extrayendo texto en tu navegador…"
                      : fuente.estado === "listo"
                        ? `Fuente lista: ${fuente.paginas ? `${fuente.paginas} páginas · ` : ""}${fuente.contenido.length.toLocaleString("es")} caracteres extraídos`
                        : fuente.error}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => quitarFuenteTexto(fuente.id)}
                  aria-label={`Quitar fuente ${fuente.nombre}`}
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {(enlacesFuentes.length > 0 || fuentesTexto.some((f) => f.estado === "listo")) && (
          <p className="mt-2 text-xs text-muted">
            {enlacesFuentes.length} enlace(s) y{" "}
            {fuentesTexto.filter((f) => f.estado === "listo").length} documento(s)
            listos como fuentes de contenido.
          </p>
        )}
      </div>

      {/* Paso 6 · Plantilla o archivo de referencia de formato (opcional) */}
      <div>
        <TituloPaso numero="6" titulo="Plantilla o archivo de referencia de formato (Opcional)" />
        <p className="mb-3 text-xs text-muted">
          <strong>Diferente al paso 5:</strong> aquí se sube un documento solo
          para copiar su <strong>estructura, estilo y profundidad</strong> (no
          aporta contenido). El contenido del trabajo se basará en tu tema y en
          las fuentes de información del paso 5. Todo se procesa en tu
          navegador: el archivo nunca se sube a ningún servidor.
        </p>
        <input
          ref={inputArchivoRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={seleccionarArchivo}
          className="hidden"
        />

        {archivoReferencia ? (
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
              textoReferencia
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-slate-200 bg-foreground/[0.03] dark:border-slate-800"
            }`}
          >
            {procesandoArchivo ? (
              <Loader2 size={18} className="shrink-0 animate-spin text-brand" />
            ) : textoReferencia ? (
              <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
            ) : (
              <FileText size={18} className="shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {archivoReferencia.name}
              </p>
              <p className="text-xs text-muted">
                {procesandoArchivo
                  ? "Extrayendo texto del documento…"
                  : textoReferencia
                    ? "Listo: el contenido se enviará como guía de estilo."
                    : "Esperando procesamiento…"}
              </p>
            </div>
            <button
              type="button"
              onClick={quitarArchivo}
              disabled={procesandoArchivo}
              aria-label="Quitar archivo de referencia"
              className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputArchivoRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm font-semibold text-muted transition hover:border-brand/60 hover:text-brand dark:border-slate-700"
          >
            <FileUp size={18} />
            Subir archivo (.pdf, .docx, .txt)
          </button>
        )}

        {errorArchivo && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-500">
            <X size={12} className="mt-0.5 shrink-0" />
            {errorArchivo}
          </p>
        )}
      </div>

      {/* Enviar */}
      <button type="submit" disabled={cargando} className="btn-primario w-full py-4">
        {cargando ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Redactando el trabajo... (puede tardar 1-2 min)
          </>
        ) : (
          <>
            <Wand2 size={18} />
            Generar trabajo con IA
          </>
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Sparkles size={12} className="shrink-0" />
        La IA redacta todo el contenido; el .docx se ensambla en tu navegador
        con formato real.
      </p>
    </form>
  );
}
