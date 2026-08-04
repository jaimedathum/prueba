import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = {
  title: "Fantasy Advisor",
  description: "Asistente de decisión para LaLiga Fantasy Oficial",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="mx-auto max-w-5xl px-4 py-6">
        <nav className="mb-6 flex flex-wrap items-center gap-4 text-sm">
          <Link href="/">Plantilla</Link>
          <Link href="/alineacion">Alineación</Link>
          <Link href="/mercado">Mercado</Link>
          <Link href="/riesgo">Riesgo</Link>
          <Link href="/overrides">Correcciones</Link>
          <SyncButton />
        </nav>
        {children}
      </body>
    </html>
  );
}
