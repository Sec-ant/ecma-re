import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { ecmaReDefines } from "../scripts/ecma-re-defines";

export default defineConfig({
  base: "/ecma-re/",
  define: ecmaReDefines(),
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../dist/demo", import.meta.url)),
    emptyOutDir: true,
  },
});
