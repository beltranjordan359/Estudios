import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  BookOpenCheck,
  Brain,
  Download,
  FileText,
  GraduationCap,
  Infinity as InfinityIcon,
  ListChecks,
  Sparkles,
} from "lucide-react";

const modulos = [
  {
    href: "/tareas",
    badge: "Redacción y Formato",
    badgeIcono: FileText,
    titulo: "Generador de Trabajos",
    subtitulo: "APA 7 e IEEE",
    descripcion:
      "La IA redacta el trabajo completo con la norma que elijas y lo descargas como un documento Word con formato académico real.",
    beneficios: [
      "Portada automática",
      "Citas y referencias",
      "Descarga directa en .docx",
    ],
    iconoBeneficio: BookMarked,
    icono: GraduationCap,
    gradiente: "from-indigo-500 to-violet-500",
  },
  {
    href: "/estudio",
    badge: "IA Interactiva",
    badgeIcono: Brain,
    titulo: "Centro de Estudio",
    subtitulo: "Con tus PDFs",
    descripcion:
      "Sube tus apuntes y libros en PDF y prepara tu examen con cuestionarios calificados y resúmenes generados por IA.",
    beneficios: [
      "PDFs ilimitados",
      "Cuestionarios personalizados",
      "Resúmenes inteligentes",
    ],
    iconoBeneficio: ListChecks,
    icono: BookOpenCheck,
    gradiente: "from-blue-500 to-cyan-500",
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-10">
      {/* ---------- Hero ---------- */}
      <section className="animar-aparecer mx-auto max-w-3xl text-center">
        <span className="chip mx-auto">
          <Sparkles size={13} />
          Tu asistente académico con IA
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Estudia y entrega a tiempo con{" "}
          <span className="texto-gradiente">AcadIA Studio</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-lg">
          Dos herramientas, un mismo objetivo: que tus trabajos luzcan
          profesionales y tus exámenes salgan como esperas.
        </p>
      </section>

      {/* ---------- Tarjetas de módulos ---------- */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {modulos.map((modulo) => (
          <article
            key={modulo.href}
            className="tarjeta tarjeta-brillante animar-aparecer flex flex-col p-6 sm:p-8"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${modulo.gradiente} text-white shadow-lg`}
              >
                <modulo.icono size={28} />
              </span>
              <span className="chip">
                <modulo.badgeIcono size={12} />
                {modulo.badge}
              </span>
            </div>

            <h2 className="text-xl font-bold sm:text-2xl">{modulo.titulo}</h2>
            <p className="texto-gradiente mt-0.5 text-sm font-bold">
              {modulo.subtitulo}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {modulo.descripcion}
            </p>

            <ul className="mt-5 space-y-2.5">
              {modulo.beneficios.map((beneficio) => (
                <li
                  key={beneficio}
                  className="flex items-center gap-2.5 text-sm font-medium"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <modulo.iconoBeneficio size={13} />
                  </span>
                  {beneficio}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex-1" />

            <Link
              href={modulo.href}
              className="btn-primario w-full text-base"
            >
              {modulo.href === "/tareas"
                ? "Abrir Generador de Tareas"
                : "Ir a Zona de Estudio"}
              <ArrowRight size={18} />
            </Link>
          </article>
        ))}
      </section>

      {/* ---------- Compromiso de privacidad ---------- */}
      <section className="tarjeta flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <InfinityIcon size={20} />
          </span>
          <div>
            <h3 className="text-sm font-bold">
              Sin límites de subida, sin exponer tus archivos
            </h3>
            <p className="text-xs text-muted sm:text-sm">
              Los PDFs se leen directamente en tu navegador: nada se envía como
              binario al servidor.
            </p>
          </div>
        </div>
        <Link
          href="/estudio"
          className="btn-secundario shrink-0"
        >
          <Download size={15} />
          Probar el estudio con PDFs
        </Link>
      </section>
    </div>
  );
}
