import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/frontend"),
      "react-native-tanstack-query-devtools-core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  root: path.resolve(__dirname, "src/frontend"),
  build: {
    outDir: path.resolve(__dirname, "dist/frontend"),
    emptyOutDir: false,
  },
});
