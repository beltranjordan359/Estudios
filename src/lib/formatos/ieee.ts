import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ISectionOptions,
} from "docx";
import type {
  DatosPortada,
  DocumentoEstructurado,
  FiguraDoc,
  ParametrosFormato,
  TablaDoc,
} from "@/types/documento";
import { generarImagenFigura } from "@/lib/documentos/generadorFiguras";

/* Configuración IEEE */
const MARGEN = 1134; // 2 cm aprox. (IEEE usa márgenes más estrechos que APA)
const FUENTE = "Times New Roman";
const TAMANO_CUERPO = 20; // 10 pt
const TAMANO_TITULO = 48; // 24 pt
const TAMANO_AUTOR = 22; // 11 pt
const TAMANO_REFERENCIA = 16; // 8 pt
const TAMANO_ABSTRACT = 18; // 9 pt (tamaño oficial IEEE para Abstract/Index Terms)
const INTERLINEADO_SIMPLE = 276; // 1.15 aprox. visual IEEE
const INTERLINEADO_ABSTRACT = 240; // 1.0 exacto para Abstract/Index Terms
const COLUMNA_ESPACIO = 425; // 0.75 cm entre columnas

export const configuracionIEEE = {
  margen: MARGEN,
  fuente: FUENTE,
  tamano: TAMANO_CUERPO,
} satisfies ParametrosFormato;

function runTexto(
  texto: string,
  opciones: {
    negrita?: boolean;
    cursiva?: boolean;
    smallCaps?: boolean;
    tamano?: number;
  } = {}
): TextRun {
  return new TextRun({
    text: texto,
    font: FUENTE,
    size: opciones.tamano ?? TAMANO_CUERPO,
    bold: opciones.negrita,
    italics: opciones.cursiva,
    smallCaps: opciones.smallCaps,
  });
}

function parrafoCuerpo(texto: string, opciones: { sangria?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: INTERLINEADO_SIMPLE, before: 0, after: 120 },
    indent: opciones.sangria ? { firstLine: 283 } : undefined,
    children: [runTexto(texto)],
  });
}

function limpiarNumeracionPrevia(texto: string): string {
  return texto.replace(/^\s*\[\d+\]\s*/, "").trim();
}

function parrafoReferencia(indice: number, texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: INTERLINEADO_SIMPLE, before: 0, after: 60 },
    indent: { left: 283, hanging: 283 },
    children: [
      runTexto(`[${indice}] ${limpiarNumeracionPrevia(texto)}`, {
        tamano: TAMANO_REFERENCIA,
      }),
    ],
  });
}

function tituloSeccion(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: INTERLINEADO_SIMPLE, before: 240, after: 120 },
    children: [runTexto(texto.toUpperCase(), { smallCaps: true })],
  });
}

function tituloSubseccion(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: INTERLINEADO_SIMPLE, before: 180, after: 60 },
    children: [runTexto(texto, { cursiva: true })],
  });
}

/* ------------------------------------------------------------------ */
/*  Tablas IEEE                                                        */
/* ------------------------------------------------------------------ */

const TAMANO_TABLA = 16; // 8 pt (tamaño típico IEEE para tablas)
const TAMANO_FIGURA = 16; // 8 pt para el pie de figura

/* IEEE: solo líneas horizontales (superior, bajo el encabezado e inferior). */
const SIN_BORDE_IEEE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const BORDES_TABLA_IEEE = {
  top: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
  left: SIN_BORDE_IEEE,
  right: SIN_BORDE_IEEE,
  insideHorizontal: SIN_BORDE_IEEE,
  insideVertical: SIN_BORDE_IEEE,
};

const LINEA_CELDA_IEEE = {
  bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
};

function aRomano(numero: number): string {
  const valores: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let restante = numero;
  let resultado = "";
  for (const [valor, simbolo] of valores) {
    while (restante >= valor) {
      resultado += simbolo;
      restante -= valor;
    }
  }
  return resultado || "I";
}

function celdaTablaIeee(texto: string, encabezado = false): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    borders: encabezado ? LINEA_CELDA_IEEE : undefined,
    margins: { top: 30, bottom: 30, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: encabezado ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { line: 240, before: 0, after: 0 },
        children: [runTexto(texto, { tamano: TAMANO_TABLA })],
      }),
    ],
  });
}

function tablaIeee(tabla: TablaDoc, numero: number): (Paragraph | Table)[] {
  const bloques: (Paragraph | Table)[] = [];

  /* "TABLA I" + título en versalitas, centrados sobre la tabla (IEEE). */
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, before: 200, after: 40 },
      children: [runTexto(`TABLA ${aRomano(numero)}`, { tamano: TAMANO_TABLA })],
    })
  );
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, before: 0, after: 80 },
      children: [runTexto(tabla.titulo, { tamano: TAMANO_TABLA, smallCaps: true })],
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
      borders: BORDES_TABLA_IEEE,
      rows: [
        new TableRow({
          tableHeader: true,
          children: Array.from(
            { length: numColumnas },
            (_, i) => celdaTablaIeee(tabla.encabezados[i] ?? "", true)
          ),
        }),
        ...filas.map(
          (fila) =>
            new TableRow({
              children: fila.map((celda) => celdaTablaIeee(celda)),
            })
        ),
      ],
    })
  );

  bloques.push(
    new Paragraph({ spacing: { line: 240, before: 0, after: 200 }, children: [] })
  );

  return bloques;
}

/* ------------------------------------------------------------------ */
/*  Figuras IEEE (imagen PNG generada con canvas)                      */
/* ------------------------------------------------------------------ */

async function figuraIeee(
  figura: FiguraDoc,
  numero: number
): Promise<(Paragraph | Table)[]> {
  const bloques: (Paragraph | Table)[] = [];

  try {
    const imagen = await generarImagenFigura(figura);
    const anchoPx = 300; // ancho útil de una columna IEEE (~318 px)
    const altoPx = Math.round((anchoPx * imagen.altoPx) / imagen.anchoPx);
    bloques.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 240, before: 200, after: 60 },
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
        spacing: { line: 240, before: 200, after: 60 },
        children: [
          runTexto(`[No se pudo generar la imagen: ${figura.titulo}]`, {
            tamano: TAMANO_FIGURA,
          }),
        ],
      })
    );
  }

  /* Pie de figura debajo de la imagen: "Fig. 1. Título" en 8 pt. */
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, before: 0, after: 200 },
      children: [
        runTexto(`Fig. ${numero}. `, { tamano: TAMANO_FIGURA }),
        runTexto(figura.titulo, { tamano: TAMANO_FIGURA, cursiva: true }),
      ],
    })
  );

  return bloques;
}

export async function generarIeee(
  doc: DocumentoEstructurado,
  portada: DatosPortada
): Promise<Blob> {
  const encabezado: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [runTexto(portada.titulo, { tamano: TAMANO_TITULO })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [runTexto(portada.autor, { tamano: TAMANO_AUTOR })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        runTexto(portada.institucion, { tamano: TAMANO_AUTOR, cursiva: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        runTexto(
          [portada.curso, portada.ciudad, portada.fecha].filter(Boolean).join(" — "),
          { tamano: TAMANO_AUTOR, cursiva: true }
        ),
      ],
    }),
  ];

  /* --- Abstract e Index Terms: 9 pt, negrita, al inicio de la 1.ª columna --- */
  const resumen: Paragraph[] = [];
  if (doc.abstract) {
    resumen.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: INTERLINEADO_ABSTRACT, after: 120 },
        children: [
          runTexto("Abstract—", {
            negrita: true,
            cursiva: true,
            tamano: TAMANO_ABSTRACT,
          }),
          runTexto(doc.abstract, {
            negrita: true,
            tamano: TAMANO_ABSTRACT,
          }),
        ],
      })
    );
  }

  if (doc.palabrasClave?.length) {
    resumen.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: INTERLINEADO_ABSTRACT, after: 240 },
        children: [
          runTexto("Index Terms—", {
            negrita: true,
            cursiva: true,
            tamano: TAMANO_ABSTRACT,
          }),
          runTexto(doc.palabrasClave.join(", ").concat("."), {
            negrita: true,
            tamano: TAMANO_ABSTRACT,
          }),
        ],
      })
    );
  }

  /* --- Cuerpo en bloques: 2 columnas, con cortes a 1 columna para tablas
     anchas (≥ 5 columnas), como exige el flujo IEEE de secciones continuas --- */
  type Bloque = { ancha: boolean; hijos: (Paragraph | Table)[] };
  const bloques: Bloque[] = [];
  let bloqueActual: Bloque = { ancha: false, hijos: [] };
  const cerrarBloque = () => {
    if (bloqueActual.hijos.length) {
      bloques.push(bloqueActual);
      bloqueActual = { ancha: false, hijos: [] };
    }
  };

  let contadorTablas = 0;
  let contadorFiguras = 0;

  bloqueActual.hijos.push(...resumen);
  for (const seccion of doc.secciones) {
    bloqueActual.hijos.push(tituloSeccion(seccion.titulo));
    for (const parrafo of seccion.parrafos) {
      bloqueActual.hijos.push(parrafoCuerpo(parrafo, { sangria: true }));
    }
    for (const sub of seccion.subsecciones ?? []) {
      bloqueActual.hijos.push(tituloSubseccion(sub.titulo));
      for (const parrafo of sub.parrafos) {
        bloqueActual.hijos.push(parrafoCuerpo(parrafo, { sangria: true }));
      }
    }
    for (const tabla of seccion.tablas ?? []) {
      contadorTablas += 1;
      const ancha = tabla.encabezados.length >= 5;
      if (ancha) {
        cerrarBloque();
        bloques.push({ ancha: true, hijos: tablaIeee(tabla, contadorTablas) });
      } else {
        bloqueActual.hijos.push(...tablaIeee(tabla, contadorTablas));
      }
    }
    for (const figura of seccion.figuras ?? []) {
      contadorFiguras += 1;
      bloqueActual.hijos.push(...(await figuraIeee(figura, contadorFiguras)));
    }
  }
  cerrarBloque();

  const referencias: Paragraph[] = [
    tituloSeccion("Referencias"),
    ...doc.referencias.map((ref, i) => parrafoReferencia(i + 1, ref)),
  ];
  bloques.push({ ancha: false, hijos: referencias });

  const margenes = { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN };
  const seccionesDocx: ISectionOptions[] = [
    {
      properties: { page: { margin: margenes } },
      children: encabezado,
    },
  ];

  bloques.forEach((bloque) => {
    seccionesDocx.push({
      properties: {
        type: SectionType.CONTINUOUS,
        page: { margin: margenes },
        column: bloque.ancha
          ? { count: 1 }
          : { count: 2, space: COLUMNA_ESPACIO, equalWidth: true },
      },
      /* El pie de página se define una vez y las secciones continuas lo heredan. */
      ...(seccionesDocx.length === 1
        ? {
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        children: [PageNumber.CURRENT],
                        font: FUENTE,
                        size: TAMANO_REFERENCIA,
                      }),
                    ],
                  }),
                ],
              }),
            },
          }
        : {}),
      children: bloque.hijos,
    });
  });

  const documento = new Document({
    creator: portada.autor || "AcadIA Studio",
    title: portada.titulo,
    description: "Trabajo académico en formato IEEE generado con AcadIA Studio",
    styles: {
      default: {
        document: {
          run: { font: FUENTE, size: TAMANO_CUERPO },
          paragraph: { spacing: { line: INTERLINEADO_SIMPLE } },
        },
      },
    },
    sections: seccionesDocx,
  });

  return Packer.toBlob(documento);
}
