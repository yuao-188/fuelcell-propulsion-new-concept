import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), {
    name: "source-index-dev",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/") request.url = "/index.source.html";
        next();
      });
    },
  }],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, rolldownOptions: { input: "index.source.html" } },
});
