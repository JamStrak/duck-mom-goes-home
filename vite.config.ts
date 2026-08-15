import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    assetsInlineLimit: 100000,
  },
  server: {
    port: 5175,
    strictPort: false,
    host: true,
  },
});
