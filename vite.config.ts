import { execSync } from "node:child_process";
import { defineConfig } from "vite";

function gitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base: "./",
  define: {
    __GIT_HASH__: JSON.stringify(gitHash()),
  },
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
