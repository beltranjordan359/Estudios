export type EstadoPdf = "pendiente" | "procesando" | "listo" | "error";

export interface PdfCargado {
  id: string;
  nombre: string;
  tamano: number;
  paginas: number;
  estado: EstadoPdf;
  progreso: number;
  texto: string;
  error?: string;
}

export interface Pregunta {
  pregunta: string;
  opciones: string[];
  respuestaCorrecta: number;
  explicacion: string;
}

export type TipoPregunta = "multiple" | "abierta";

export type DificultadCuestionario = "facil" | "media" | "dificil";

export type TipoCuestionario = "multiple" | "abierta" | "mixto";

export type AccionEstudio = "generar" | "evaluar";

export interface PreguntaCuestionario extends Pregunta {
  tipo: TipoPregunta;
  respuestaModelo: string;
  criteriosClave: string[];
}

export interface Cuestionario {
  titulo: string;
  preguntas: PreguntaCuestionario[];
}

export interface EvaluacionAbierta {
  nota: number;
  aciertos: string[];
  faltantes: string[];
  comentario: string;
  explicacionIdeal: string;
}

export interface ResultadoEvaluacionAbierta {
  notaFinal: number;
  evaluaciones: EvaluacionAbierta[];
}

export interface PeticionEvaluacionAbierta {
  preguntas: PreguntaCuestionario[];
  respuestas: string[];
}

export interface ConceptoClave {
  termino: string;
  definicion: string;
}

export interface ResumenEstructurado {
  titulo: string;
  ideaPrincipal: string;
  puntosClave: string[];
  conceptosClave: ConceptoClave[];
  conclusiones: string[];
}

export type ModoEstudio = "cuestionario" | "resumen";

export interface ResultadoEstudio {
  titulo: string;
  cuestionario?: Cuestionario;
  resumen?: ResumenEstructurado;
}

export interface PeticionEstudio {
  texto: string;
  modo: ModoEstudio;
  numPreguntas: number;
  tituloFuente: string;
  dificultad: DificultadCuestionario;
  tipoCuestionario: TipoCuestionario;
  accion?: AccionEstudio;
  preguntas?: PreguntaCuestionario[];
  respuestas?: string[];
}
