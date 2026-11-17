"use client";

/**
 * Procesador de PDFs 100% client-side con pdfjs-dist.
 * Los binarios NUNCA se envían al servidor: solo se extrae el texto
 * en el navegador y se envía el resultado (texto plano) a la API.
 */

import type { PdfCargado } from "@/types/estudio";

let bibliotecaCargada = false;

async function cargarBiblioteca() {
  const pdfjs = await import("pdfjs-dist");
  if (!bibliotecaCargada) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    bibliotecaCargada = true;
  }
  return pdfjs;
}

export interface ProgresoExtraccion {
  paginaActual: number;
  paginasTotales: number;
}

/**
 * Extrae el texto de un archivo PDF en el navegador.
 * Soporta archivos grandes (se procesan por páginas, sin límite).
 */
export async function extraerTextoPdf(
  archivo: File,
  alProgresar?: (progreso: ProgresoExtraccion) => void
): Promise<{ texto: string; paginas: number }> {
  const pdfjs = await cargarBiblioteca();
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const tarea = pdfjs.getDocument({ data: datos });
  const pdf = await tarea.promise;

  const fragmentos: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const contenido = await pagina.getTextContent();
    const linea = contenido.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (linea) fragmentos.push(linea);
    alProgresar?.({ paginaActual: i, paginasTotales: pdf.numPages });
  }

  await tarea.destroy();

  return {
    texto: fragmentos.join("\n"),
    paginas: pdf.numPages,
  };
}

/**
 * Procesa una lista de archivos PDF en paralelo con límite de concurrencia,
 * devolviendo el estado actualizado de cada uno.
 */
export async function procesarArchivosPdf(
  archivos: File[],
  alActualizar: (actualizado: PdfCargado) => void
): Promise<void> {
  const LIMITE_CONCURRENCIA = 3;
  let indice = 0;

  async function siguiente() {
    while (indice < archivos.length) {
      const archivo = archivos[indice++];
      await procesarUno(archivo, alActualizar);
    }
  }

  const trabajadores = Array.from(
    { length: Math.min(LIMITE_CONCURRENCIA, archivos.length) },
    () => siguiente()
  );
  await Promise.all(trabajadores);
}

async function procesarUno(
  archivo: File,
  alActualizar: (actualizado: PdfCargado) => void
): Promise<void> {
  const id = idDeArchivo(archivo);
  alActualizar({
    id,
    nombre: archivo.name,
    tamano: archivo.size,
    paginas: 0,
    estado: "procesando",
    progreso: 0,
    texto: "",
  });

  try {
    if (!archivo.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("El archivo no es un PDF válido.");
    }

    const { texto, paginas } = await extraerTextoPdf(archivo, (p) => {
      alActualizar({
        id,
        nombre: archivo.name,
        tamano: archivo.size,
        paginas: p.paginasTotales,
        estado: "procesando",
        progreso: p.paginasTotales > 0 ? (p.paginaActual / p.paginasTotales) * 100 : 0,
        texto: "",
      });
    });

    if (texto.trim().length < 100) {
      throw new Error(
        "Este PDF no tiene texto seleccionable (parece escaneado o hecho solo de imágenes). Los demás archivos siguen procesándose con normalidad; usa un PDF digital para que la IA pueda leerlo."
      );
    }

    alActualizar({
      id,
      nombre: archivo.name,
      tamano: archivo.size,
      paginas,
      estado: "listo",
      progreso: 100,
      texto,
    });
  } catch (error) {
    alActualizar({
      id,
      nombre: archivo.name,
      tamano: archivo.size,
      paginas: 0,
      estado: "error",
      progreso: 0,
      texto: "",
      error: mensajeAmigablePdf(error),
    });
  }
}

/**
 * Traduce los errores de pdfjs-dist a avisos claros y amigables en español.
 */
function mensajeAmigablePdf(error: unknown): string {
  const nombre = error instanceof Error ? error.name : "";
  const mensaje = error instanceof Error ? error.message : String(error);

  if (nombre === "PasswordException") {
    return "El PDF está protegido con contraseña. Quítala y vuelve a cargarlo.";
  }
  if (nombre === "InvalidPDFException" || mensaje.includes("invalid pdf")) {
    return "El archivo parece dañado o no es un PDF válido. Prueba a descargarlo de nuevo.";
  }
  if (nombre === "MissingPDFException") {
    return "El archivo está vacío o no se pudo abrir.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Error desconocido al procesar el PDF.";
}

export function idDeArchivo(archivo: File): string {
  return `${archivo.name}-${archivo.size}-${archivo.lastModified}`;
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
