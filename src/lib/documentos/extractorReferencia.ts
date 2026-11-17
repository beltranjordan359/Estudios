"use client";

/**
 * Extracción de texto de archivos de referencia (.pdf, .docx, .txt, .md)
 * 100% client-side. Solo el texto plano resultante viaja a la API.
 */

import mammoth from "mammoth";
import { extraerTextoPdf } from "@/lib/pdf/extractor";

export const MAX_CARACTERES_REFERENCIA = 18_000;

function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto === -1 ? "" : nombre.slice(punto).toLowerCase();
}

function recortar(texto: string): string {
  const limpio = texto.replace(/\r\n/g, "\n").trim();
  if (limpio.length <= MAX_CARACTERES_REFERENCIA) return limpio;
  return `${limpio.slice(0, MAX_CARACTERES_REFERENCIA)}\n\n[Nota: el documento de referencia fue recortado por longitud.]`;
}

export async function extraerTextoReferencia(archivo: File): Promise<string> {
  const extension = extensionDe(archivo.name);
  let texto = "";

  if (extension === ".pdf") {
    const { texto: textoPdf } = await extraerTextoPdf(archivo);
    texto = textoPdf;
  } else if (extension === ".docx") {
    const { value } = await mammoth.extractRawText({
      arrayBuffer: await archivo.arrayBuffer(),
    });
    texto = value;
  } else if (extension === ".txt" || extension === ".md") {
    texto = await archivo.text();
  } else {
    throw new Error(
      "Formato de referencia no soportado. Usa un archivo .pdf, .docx, .txt o .md."
    );
  }

  if (!texto.trim()) {
    throw new Error(
      "No se pudo extraer texto del archivo de referencia (parece vacío o es un documento escaneado sin texto)."
    );
  }

  return recortar(texto);
}
