"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  GraduationCap,
  Home,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";

const enlaces = [
  { href: "/", etiqueta: "Inicio", detalle: "Panel principal", icono: Home },
  { href: "/tareas", etiqueta: "Generador", detalle: "APA 7 e IEEE", icono: GraduationCap },
  { href: "/estudio", etiqueta: "Estudio", detalle: "Con tus PDFs", icono: BookOpenCheck },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-lg shadow-brand/30">
        <GraduationCap size={22} />
      </span>
      <span className="texto-gradiente text-lg font-bold tracking-tight">
        AcadIA Studio
      </span>
    </Link>
  );
}

function TemaToggle() {
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");

  useEffect(() => {
    const guardado = window.localStorage.getItem("tema");
    const inicial =
      guardado === "oscuro" ||
      (!guardado && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "oscuro"
        : "claro";
    setTema(inicial);
    document.documentElement.classList.toggle("dark", inicial === "oscuro");
  }, []);

  function alternar() {
    const nuevo = tema === "oscuro" ? "claro" : "oscuro";
    setTema(nuevo);
    document.documentElement.classList.toggle("dark", nuevo === "oscuro");
    window.localStorage.setItem("tema", nuevo);
  }

  return (
    <button
      onClick={alternar}
      aria-label="Cambiar tema claro/oscuro"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-foreground/70 transition hover:border-brand/50 hover:text-brand dark:border-slate-800 dark:bg-slate-900/70"
    >
      {tema === "oscuro" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default function Navbar() {
  const ruta = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    setMenuAbierto(false);
  }, [ruta]);

  const activo = (href: string) =>
    href === "/" ? ruta === "/" : ruta.startsWith(href);

  return (
    <>
      {/* ---------- Móvil (< 768px): barra superior compacta ---------- */}
      <header className="glass fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b px-4 py-3 md:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <TemaToggle />
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuAbierto}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-foreground/70 transition hover:text-brand dark:border-slate-800 dark:bg-slate-900/70"
          >
            {menuAbierto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Menú desplegable móvil (única navegación móvil) */}
      {menuAbierto && (
        <>
          <button
            aria-label="Cerrar menú"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMenuAbierto(false)}
          />
          <nav className="animar-aparecer fixed inset-x-4 top-[4.5rem] z-50 space-y-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-3 shadow-2xl md:hidden">
            {enlaces.map(({ href, etiqueta, detalle, icono: Icono }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                  activo(href)
                    ? "bg-brand/15 text-brand shadow-[0_0_0_1px] shadow-brand/40"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icono size={20} className="shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">{etiqueta}</span>
                  <span className="block text-xs text-muted">{detalle}</span>
                </span>
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* ---------- Escritorio (≥ 768px): sidebar fija de 260px ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-slate-200 bg-white/70 p-5 backdrop-blur-xl md:flex dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mb-10">
          <Logo />
        </div>

        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-widest text-muted">
          Navegación
        </p>
        <nav className="flex flex-col gap-2">
          {enlaces.map(({ href, etiqueta, detalle, icono: Icono }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${
                activo(href)
                  ? "bg-gradient-to-r from-brand/20 to-brand-2/10 text-brand shadow-[0_0_0_1px] shadow-brand/30"
                  : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  activo(href)
                    ? "bg-gradient-to-br from-brand to-brand-2 text-white shadow-md"
                    : "bg-foreground/5 text-muted"
                }`}
              >
                <Icono size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{etiqueta}</span>
                <span className="block text-xs text-muted">{detalle}</span>
              </span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-slate-200 bg-foreground/[0.03] p-4 text-xs leading-relaxed text-muted dark:border-slate-800">
            <p className="mb-1 font-semibold text-foreground/80">Impulsado por Gemini</p>
            <p>Trabajos en APA 7 e IEEE y estudio con PDFs ilimitados, todo en tu navegador.</p>
          </div>
          <TemaToggle />
        </div>
      </aside>
    </>
  );
}
