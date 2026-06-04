import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración de Vite + React.
// No requiere ajustes especiales para desplegar en Vercel.
export default defineConfig({
  plugins: [react()],
});
