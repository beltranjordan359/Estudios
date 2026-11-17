import type { FiguraDoc, TipoDiagrama } from "@/types/documento";

/**
 * Generador de imágenes PNG para figuras y diagramas, en el navegador.
 * Dibuja sobre un <canvas> fuera de pantalla y devuelve los bytes PNG
 * listos para incrustarlos con ImageRun de la librería "docx".
 */

export interface ImagenFigura {
  /** Bytes del PNG generado. */
  datos: Uint8Array;
  /** Ancho lógico del dibujo (px de referencia para ImageRun). */
  anchoPx: number;
  /** Alto lógico del dibujo (px de referencia para ImageRun). */
  altoPx: number;
}

/* --- Constantes de dibujo --- */

const ANCHO = 900;
const MARGEN = 40;
const ESCALA = 2; // Render a 2x para nitidez en el documento

const COLORES = {
  fondo: "#FFFFFF",
  caja: "#EEF2FF",
  cajaBorde: "#4338CA",
  cajaTexto: "#1E293B",
  central: "#4338CA",
  centralTexto: "#FFFFFF",
  trazo: "#64748B",
  linea: "#94A3B8",
};

const FUENTE_CAJA = "600 20px 'Segoe UI', Arial, sans-serif";
const FUENTE_CAJA_PEQUEÑA = "500 18px 'Segoe UI', Arial, sans-serif";

interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
  lineas: string[];
  central?: boolean;
}

interface Fila {
  cajas: Caja[];
  top: number;
  bottom: number;
  centroX: number;
}

/* --- Utilidades --- */

function inferirNodos(figura: FiguraDoc): string[] {
  if (figura.nodos?.length) {
    return figura.nodos.map((n) => n.trim()).filter(Boolean);
  }
  const trozos = figura.descripcionVisual
    .split(/[,;:\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  return trozos.length > 0 ? trozos.slice(0, 8) : [figura.titulo];
}

function envolverTexto(
  ctx: CanvasRenderingContext2D,
  texto: string,
  maxAncho: number
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || ctx.measureText(prueba).width <= maxAncho) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [texto];
}

function trazarRectRedondeado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + w, y, x + w, y + h, radio);
  ctx.arcTo(x + w, y + h, x, y + h, radio);
  ctx.arcTo(x, y + h, x, y, radio);
  ctx.arcTo(x, y, x + w, y, radio);
  ctx.closePath();
}

function dibujarCaja(ctx: CanvasRenderingContext2D, caja: Caja): void {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = caja.central ? COLORES.central : COLORES.caja;
  trazarRectRedondeado(ctx, caja.x, caja.y, caja.w, caja.h, 10);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = caja.central ? COLORES.central : COLORES.cajaBorde;
  ctx.lineWidth = 2;
  trazarRectRedondeado(ctx, caja.x, caja.y, caja.w, caja.h, 10);
  ctx.stroke();

  ctx.fillStyle = caja.central ? COLORES.centralTexto : COLORES.cajaTexto;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paso = caja.central ? 24 : 22;
  const altoTexto = caja.lineas.length * paso;
  let y = caja.y + caja.h / 2 - altoTexto / 2 + paso / 2;
  for (const linea of caja.lineas) {
    ctx.fillText(linea, caja.x + caja.w / 2, y);
    y += paso;
  }
}

function dibujarFlecha(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const cabeza = 11;
  ctx.strokeStyle = COLORES.trazo;
  ctx.fillStyle = COLORES.trazo;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - cabeza * Math.cos(ang - 0.42), y2 - cabeza * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - cabeza * Math.cos(ang + 0.42), y2 - cabeza * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
}

function dibujarLinea(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  ctx.strokeStyle = COLORES.linea;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function crearCaja(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  w: number,
  fuente: string,
  altoMinimo: number,
  central = false
): Caja {
  ctx.font = fuente;
  const lineas = envolverTexto(ctx, texto, w - 28);
  const paso = central ? 24 : 22;
  const h = Math.max(altoMinimo, lineas.length * paso + 26);
  return { x, y, w, h, lineas, central };
}

/* --- Distribuciones por tipo de diagrama --- */

function distribuirFlujo(
  ctx: CanvasRenderingContext2D,
  nodos: string[]
): { cajas: Caja[]; alto: number } {
  const cajaW = 560;
  const x = (ANCHO - cajaW) / 2;
  const cajas: Caja[] = [];
  let y = MARGEN;
  for (const nodo of nodos) {
    const caja = crearCaja(ctx, nodo, x, y, cajaW, FUENTE_CAJA, 56);
    cajas.push(caja);
    y += caja.h + 46;
  }
  return { cajas, alto: y - 46 + MARGEN };
}

function distribuirArquitectura(
  ctx: CanvasRenderingContext2D,
  nodos: string[]
): { filas: Fila[]; alto: number } {
  const numFilas = Math.ceil(nodos.length / 3);
  const porFila = Math.ceil(nodos.length / numFilas);
  const filas: Fila[] = [];
  let indice = 0;
  let y = MARGEN;

  for (let f = 0; f < numFilas; f++) {
    const grupo = nodos.slice(indice, indice + porFila);
    indice += porFila;
    const sep = 44;
    const cajaW = Math.min(250, (ANCHO - 2 * MARGEN - (grupo.length - 1) * sep) / grupo.length);
    const anchoFila = grupo.length * cajaW + (grupo.length - 1) * sep;
    const x0 = (ANCHO - anchoFila) / 2;
    const cajas = grupo.map((nodo, i) =>
      crearCaja(ctx, nodo, x0 + i * (cajaW + sep), y, cajaW, FUENTE_CAJA_PEQUEÑA, 56)
    );
    const bottom = Math.max(...cajas.map((c) => c.y + c.h));
    filas.push({
      cajas,
      top: y,
      bottom,
      centroX: ANCHO / 2,
    });
    y = bottom + 74;
  }
  return { filas, alto: y - 74 + MARGEN };
}

function distribuirComparativo(
  ctx: CanvasRenderingContext2D,
  nodos: string[]
): { cajas: Caja[]; alto: number } {
  const n = Math.max(1, nodos.length);
  const sep = 32;
  const cajaW = Math.min(240, (ANCHO - 2 * MARGEN - (n - 1) * sep) / n);
  const anchoFila = n * cajaW + (n - 1) * sep;
  const x0 = (ANCHO - anchoFila) / 2;
  const y = MARGEN + 30;
  const cajas = nodos.map((nodo, i) =>
    crearCaja(ctx, nodo, x0 + i * (cajaW + sep), y, cajaW, FUENTE_CAJA, 64)
  );
  const bottom = Math.max(...cajas.map((c) => c.y + c.h), y + 64);
  return { cajas, alto: bottom + MARGEN + 30 };
}

function distribuirEsquema(
  ctx: CanvasRenderingContext2D,
  nodos: string[]
): { central: Caja; satelites: Caja[]; alto: number } {
  const numSatelites = Math.max(0, Math.min(nodos.length - 1, 8));
  const satelitesNodos = nodos.slice(1, 1 + numSatelites);
  const alto = Math.min(720, 460 + numSatelites * 26);
  const cx = ANCHO / 2;
  const cy = alto / 2;

  const central = crearCaja(
    ctx,
    nodos[0] ?? "",
    cx - 115,
    cy - 32,
    230,
    FUENTE_CAJA,
    64,
    true
  );

  const satelites: Caja[] = satelitesNodos.map((nodo, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, numSatelites);
    const rx = 300;
    const ry = alto / 2 - 80;
    const w = 190;
    const caja = crearCaja(
      ctx,
      nodo,
      0,
      0,
      w,
      FUENTE_CAJA_PEQUEÑA,
      52
    );
    caja.x = cx + rx * Math.cos(ang) - w / 2;
    caja.y = cy + ry * Math.sin(ang) - caja.h / 2;
    return caja;
  });

  return { central, satelites, alto };
}

/* --- Render principal --- */

function dibujarFiguraEnCanvas(
  ctx: CanvasRenderingContext2D,
  figura: FiguraDoc,
  nodos: string[]
): number {
  const tipo: TipoDiagrama = figura.tipoDiagrama ?? "esquema";

  ctx.fillStyle = COLORES.fondo;
  ctx.fillRect(0, 0, ANCHO, 1600);

  if (tipo === "flujo") {
    const { cajas, alto } = distribuirFlujo(ctx, nodos);
    for (let i = 0; i < cajas.length - 1; i++) {
      const actual = cajas[i];
      const siguiente = cajas[i + 1];
      dibujarFlecha(
        ctx,
        ANCHO / 2,
        actual.y + actual.h,
        ANCHO / 2,
        siguiente.y
      );
    }
    for (const caja of cajas) dibujarCaja(ctx, caja);
    return alto;
  }

  if (tipo === "arquitectura") {
    const { filas, alto } = distribuirArquitectura(ctx, nodos);
    for (let f = 0; f < filas.length - 1; f++) {
      const actual = filas[f];
      const siguiente = filas[f + 1];
      const busY = actual.bottom + 28;
      for (const caja of actual.cajas) {
        dibujarLinea(ctx, caja.x + caja.w / 2, caja.y + caja.h, caja.x + caja.w / 2, busY);
      }
      const xs = actual.cajas.map((c) => c.x + c.w / 2);
      dibujarLinea(ctx, Math.min(...xs), busY, Math.max(...xs), busY);
      dibujarFlecha(ctx, actual.centroX, busY, actual.centroX, siguiente.top);
    }
    for (const fila of filas) for (const caja of fila.cajas) dibujarCaja(ctx, caja);
    return alto;
  }

  if (tipo === "comparativo") {
    const { cajas, alto } = distribuirComparativo(ctx, nodos);
    if (cajas.length > 1) {
      const bottoms = cajas.map((c) => c.y + c.h);
      const base = Math.max(...bottoms) + 16;
      const xs = cajas.map((c) => c.x + c.w / 2);
      dibujarLinea(ctx, Math.min(...xs), base, Math.max(...xs), base);
      for (let i = 0; i < cajas.length; i++) {
        dibujarLinea(ctx, xs[i], bottoms[i], xs[i], base);
      }
    }
    for (const caja of cajas) dibujarCaja(ctx, caja);
    return alto;
  }

  /* esquema (mapa conceptual radial) */
  const { central, satelites, alto } = distribuirEsquema(ctx, nodos);
  for (const satelite of satelites) {
    dibujarLinea(
      ctx,
      central.x + central.w / 2,
      central.y + central.h / 2,
      satelite.x + satelite.w / 2,
      satelite.y + satelite.h / 2
    );
  }
  for (const satelite of satelites) dibujarCaja(ctx, satelite);
  dibujarCaja(ctx, central);
  return alto;
}

/**
 * Genera la imagen PNG de una figura/diagrama.
 * Devuelve los bytes y las dimensiones lógicas para ImageRun.
 */
export async function generarImagenFigura(figura: FiguraDoc): Promise<ImagenFigura> {
  if (typeof document === "undefined") {
    throw new Error(
      "Las figuras solo pueden generarse en el navegador (se requiere <canvas>)."
    );
  }

  const nodos = inferirNodos(figura);

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO * ESCALA;
  canvas.height = 1600 * ESCALA;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear el contexto de dibujo para la figura.");
  }
  ctx.scale(ESCALA, ESCALA);

  const alto = dibujarFiguraEnCanvas(ctx, figura, nodos);

  /* Ajustar el lienzo a la altura real del diagrama (reinicia el contexto). */
  canvas.height = Math.round(alto * ESCALA);
  const ctxFinal = canvas.getContext("2d");
  if (!ctxFinal) {
    throw new Error("No se pudo preparar el dibujo final de la figura.");
  }
  ctxFinal.scale(ESCALA, ESCALA);
  dibujarFiguraEnCanvas(ctxFinal, figura, nodos);

  const blob = await new Promise<Blob | null>((resuelve) =>
    canvas.toBlob(resuelve, "image/png")
  );
  if (!blob) {
    throw new Error("No se pudo exportar la figura como PNG.");
  }
  const datos = new Uint8Array(await blob.arrayBuffer());
  return { datos, anchoPx: ANCHO, altoPx: Math.round(alto) };
}
