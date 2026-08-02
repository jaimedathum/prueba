import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El cliente de la API del juego solo se ejecuta en el servidor: la API no
  // admite llamadas desde el navegador (ver docs/reglas.md) y además el token
  // nunca debe llegar al cliente.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
