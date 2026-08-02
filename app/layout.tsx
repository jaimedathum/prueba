import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Advisor",
  description: "Asistente de decisión para LaLiga Fantasy Oficial",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="mx-auto max-w-5xl px-4 py-6">{children}</body>
    </html>
  );
}
