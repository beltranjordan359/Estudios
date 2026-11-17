export type NormaFormato = "apa7" | "ieee";

export interface DatosPortada {
  titulo: string;
  autor: string;
  institucion: string;
  curso: string;
  profesor: string;
  ciudad: string;
  fecha: string;
}

export interface SubseccionDoc {
  titulo: string;
  parrafos: string[];
}

export interface TablaDoc {
  titulo: string;
  fuente?: string;
  encabezados: string[];
  filas: string[][];
}

export type TipoDiagrama = "flujo" | "arquitectura" | "comparativo" | "esquema";

export interface FiguraDoc {
  titulo: string;
  descripcionVisual: string;
  pieDeFigura: string;
  tipoDiagrama?: TipoDiagrama;
  nodos?: string[];
}

export interface SeccionDoc {
  titulo: string;
  parrafos: string[];
  subsecciones?: SubseccionDoc[];
  tablas?: TablaDoc[];
  figuras?: FiguraDoc[];
}

export interface DocumentoEstructurado {
  norma: NormaFormato;
  titulo: string;
  abstract?: string;
  palabrasClave?: string[];
  resumen?: string;
  secciones: SeccionDoc[];
  referencias: string[];
}

export interface FuenteTexto {
  nombre: string;
  contenido: string;
}

export interface PeticionGeneracion {
  norma: NormaFormato;
  tema: string;
  instrucciones?: string;
  paginas: number;
  portada: DatosPortada;
  textoReferencia?: string;
  enlacesFuentes?: string[];
  textosFuentes?: FuenteTexto[];
}

export interface ParametrosFormato {
  margen: number;
  fuente: string;
  tamano: number;
}
