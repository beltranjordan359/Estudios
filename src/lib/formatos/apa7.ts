import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type {
  DatosPortada,
  DocumentoEstructurado,
  FiguraDoc,
  ParametrosFormato,
  TablaDoc,
} from "@/types/documento";
import { generarImagenFigura } from "@/lib/documentos/generadorFiguras";

/* Configuración APA 7 */
const MARGEN = 1440; // 2.54 cm en twips
const FUENTE = "Times New Roman";
const TAMANO = 24; // 12 pt (docx usa medios puntos)
const INTERLINEADO = 480; // 2.0 líneas (docx usa twips: 240 = simple)
const SANGRIA_PRIMERA_LINEA = 720; // 1.27 cm
const SANGRIA_FRANCESA = 720; // sangría francesa 1.27 cm

export const configuracionAPA = {
  margen: MARGEN,
  fuente: FUENTE,
  tamano: TAMANO,
} satisfies ParametrosFormato;

function runTexto(
  texto: string,
  opciones: { negrita?: boolean; cursiva?: boolean } = {}
): TextRun {
  return new TextRun({
    text: texto,
    font: FUENTE,
    size: TAMANO,
    bold: opciones.negrita,
    italics: opciones.cursiva,
  });
}

function parrafoTexto(texto: string, sangria = true): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: INTERLINEADO, before: 0, after: 0 },
    indent: sangria ? { firstLine: SANGRIA_PRIMERA_LINEA } : undefined,
    children: [runTexto(texto)],
  });
}

function parrafoReferencia(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: INTERLINEADO, before: 0, after: 0 },
    indent: { hanging: SANGRIA_FRANCESA },
    children: [runTexto(texto)],
  });
}

function lineaPortada(texto: string, negrita = false, paginaSiguiente = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: INTERLINEADO, before: 0, after: 0 },
    pageBreakBefore: paginaSiguiente,
    children: [runTexto(texto, { negrita })],
  });
}

function lineaVacia(paginaSiguiente = false): Paragraph {
  return new Paragraph({
    spacing: { line: INTERLINEADO, before: 0, after: 0 },
    pageBreakBefore: paginaSiguiente,
    children: [],
  });
}

function parrafoPortada(texto: string, negrita = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: INTERLINEADO, before: 0, after: 0 },
    children: [runTexto(texto, { negrita })],
  });
}

function tituloSeccion(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: INTERLINEADO, before: 240, after: 0 },
    children: [runTexto(texto, { negrita: true })],
  });
}

function tituloSubseccion(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: INTERLINEADO, before: 240, after: 0 },
    children: [runTexto(texto, { negrita: true, cursiva: true })],
  });
}

function parrafoCentrado(texto: string, negrita = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: INTERLINEADO, before: 0, after: 0 },
    children: [runTexto(texto, { negrita })],
  });
}

/* ------------------------------------------------------------------ */
/*  Tablas APA 7                                                       */
/* ------------------------------------------------------------------ */

/* APA 7: solo líneas horizontales superior e inferior (sin verticales). */
const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const BORDES_TABLA_APA = {
  top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  left: SIN_BORDE,
  right: SIN_BORDE,
  insideHorizontal: SIN_BORDE,
  insideVertical: SIN_BORDE,
};

const LINEA_CELDA = { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } };

function celdaTablaApa(texto: string, encabezado = false): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    borders: encabezado ? LINEA_CELDA : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: encabezado ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { line: 276, before: 0, after: 0 },
        children: [runTexto(texto)],
      }),
    ],
  });
}

function tablaApa(tabla: TablaDoc, numero: number): (Paragraph | Table)[] {
  const bloques: (Paragraph | Table)[] = [];

  /* Número de tabla en negrita, encima del título en cursiva (APA 7). */
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { line: INTERLINEADO, before: 240, after: 0 },
      children: [runTexto(`Tabla ${numero}`, { negrita: true })],
    })
  );
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { line: INTERLINEADO, before: 0, after: 120 },
      children: [runTexto(tabla.titulo, { cursiva: true })],
    })
  );

  const numColumnas = Math.max(1, tabla.encabezados.length);
  const filas = tabla.filas.map((fila) => {
    const celdas = fila.map((c) => (c ?? "").trim());
    while (celdas.length < numColumnas) celdas.push("");
    return celdas.slice(0, numColumnas);
  });

  bloques.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDES_TABLA_APA,
      rows: [
        new TableRow({
          tableHeader: true,
          children: Array.from(
            { length: numColumnas },
            (_, i) => celdaTablaApa(tabla.encabezados[i] ?? "", true)
          ),
        }),
        ...filas.map(
          (fila) =>
            new TableRow({
              children: fila.map((celda) => celdaTablaApa(celda)),
            })
        ),
      ],
    })
  );

  /* Nota general debajo de la tabla (APA 7). */
  bloques.push(
    new Paragraph({
      spacing: { line: 276, before: 80, after: 240 },
      children: [
        runTexto("Nota. ", { cursiva: true }),
        runTexto(tabla.fuente || "Elaboración propia."),
      ],
    })
  );

  return bloques;
}

/* ------------------------------------------------------------------ */
/*  Figuras APA 7 (imagen PNG generada con canvas)                     */
/* ------------------------------------------------------------------ */

async function figuraApa(
  figura: FiguraDoc,
  numero: number
): Promise<(Paragraph | Table)[]> {
  const bloques: (Paragraph | Table)[] = [];

  bloques.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { line: INTERLINEADO, before: 240, after: 0 },
      children: [runTexto(`Figura ${numero}`, { negrita: true })],
    })
  );
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { line: INTERLINEADO, before: 0, after: 120 },
      children: [runTexto(figura.titulo, { cursiva: true })],
    })
  );

  try {
    const imagen = await generarImagenFigura(figura);
    const anchoPx = 560;
    const altoPx = Math.round((anchoPx * imagen.altoPx) / imagen.anchoPx);
    bloques.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 240, before: 0, after: 80 },
        children: [
          new ImageRun({
            data: imagen.datos,
            type: "png",
            transformation: { width: anchoPx, height: altoPx },
          }),
        ],
      })
    );
  } catch {
    bloques.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: INTERLINEADO, before: 0, after: 80 },
        children: [
          runTexto(
            `[No se pudo generar la imagen de la figura: ${figura.titulo}]`
          ),
        ],
      })
    );
  }

  if (figura.pieDeFigura) {
    bloques.push(
      new Paragraph({
        spacing: { line: 276, before: 0, after: 240 },
        children: [
          runTexto("Nota. ", { cursiva: true }),
          runTexto(figura.pieDeFigura),
        ],
      })
    );
  } else {
    bloques.push(
      new Paragraph({ spacing: { line: 240, before: 0, after: 240 }, children: [] })
    );
  }

  return bloques;
}

export async function generarApa7(
  doc: DocumentoEstructurado,
  portada: DatosPortada
): Promise<Blob> {
  /* --- Portada APA 7 (estilo estudiante): título a 1/3 superior, centrado --- */
  const portadaApa: Paragraph[] = [
    lineaVacia(),
    lineaVacia(),
    lineaVacia(),
    lineaVacia(),
    parrafoPortada(portada.titulo.toUpperCase(), true),
    lineaVacia(),
    parrafoPortada(portada.autor),
    parrafoPortada(portada.institucion),
    parrafoPortada(portada.curso),
    parrafoPortada(portada.profesor),
    parrafoPortada(`${portada.ciudad}, ${portada.fecha}`),
  ];

  /* --- Resumen --- */
  const contenido: (Paragraph | Table)[] = [];
  contenido.push(lineaVacia(true));
  contenido.push(parrafoPortada("Resumen", true));
  if (doc.resumen) {
    contenido.push(parrafoTexto(doc.resumen));
  }

  /* --- Cuerpo: página nueva con el título repetido centrado --- */
  contenido.push(lineaVacia(true));
  contenido.push(parrafoCentrado(portada.titulo, true));

  let contadorTablas = 0;
  let contadorFiguras = 0;

  for (const seccion of doc.secciones) {
    contenido.push(tituloSeccion(seccion.titulo));
    for (const parrafo of seccion.parrafos) {
      contenido.push(parrafoTexto(parrafo));
    }
    for (const sub of seccion.subsecciones ?? []) {
      contenido.push(tituloSubseccion(sub.titulo));
      for (const parrafo of sub.parrafos) {
        contenido.push(parrafoTexto(parrafo));
      }
    }
    /* Tablas y figuras de la sección (numeración continua en el documento). */
    for (const tabla of seccion.tablas ?? []) {
      contadorTablas += 1;
      contenido.push(...tablaApa(tabla, contadorTablas));
    }
    for (const figura of seccion.figuras ?? []) {
      contadorFiguras += 1;
      contenido.push(...(await figuraApa(figura, contadorFiguras)));
    }
  }

  /* --- Referencias: página nueva, sangría francesa --- */
  contenido.push(lineaVacia(true));
  contenido.push(parrafoPortada("Referencias", true));
  for (const referencia of doc.referencias) {
    contenido.push(parrafoReferencia(referencia));
  }

  const documento = new Document({
    creator: portada.autor || "AcadIA Studio",
    title: portada.titulo,
    description: "Trabajo académico en formato APA 7 generado con AcadIA Studio",
    styles: {
      default: {
        document: {
          run: { font: FUENTE, size: TAMANO },
          paragraph: { spacing: { line: INTERLINEADO } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FUENTE,
                    size: TAMANO,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [...portadaApa, ...contenido],
      },
    ],
  });

  return Packer.toBlob(documento);
}
