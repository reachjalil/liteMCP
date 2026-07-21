import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://litemcpcomposer.com",
  integrations: [react()],
  build: {
    assets: "assets",
  },
  vite: {
    build: {
      sourcemap: true,
    },
  },
});
