import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fija la raíz explícitamente: evita que Turbopack ambigüe con un
  // package-lock.json que vive fuera de este repo (C:\Users\Maxim).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
