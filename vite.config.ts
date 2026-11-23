import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // the lazy 3D chunk (three.js + postprocessing) is ~1 MB by nature; it
    // loads in the background, so only the main chunk needs to stay small
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        copyright: resolve(__dirname, "copyright.html"),
      },
    },
  },
});
