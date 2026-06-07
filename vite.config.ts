import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";
import { ecmaReDefines } from "./scripts/ecma-re-defines";

export default defineConfig({
  define: ecmaReDefines(),
  build: {
    minify: false,
    lib: {
      entry: "src/index.ts",
      name: "ecmaRe",
      fileName: "ecma-re",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
    },
  },
  plugins: [dts()],
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
