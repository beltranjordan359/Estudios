import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AcadIA Studio — Trabajos y estudio con IA",
  description:
    "Genera trabajos académicos completos en formato APA 7 e IEEE, y estudia con PDFs ilimitados, resúmenes y cuestionarios generados con IA.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full md:pl-[260px]">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 md:px-8 md:pb-12 md:pt-10">
          {children}
        </main>
      </body>
    </html>
  );
}
