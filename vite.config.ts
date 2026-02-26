import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "content/pageBridge": resolve(__dirname, "src/content/pageBridge.ts"),
        "content/core": resolve(__dirname, "src/content/core.ts"),
        "background/serviceWorker": resolve(__dirname, "src/background/serviceWorker.ts"),
        popup: resolve(__dirname, "popup/index.html")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        banner: "(() => {",
        footer: "})();"
      }
    }
  },
  publicDir: "public"
});
