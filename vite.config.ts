import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: "src/index.ts",
      name: "esre",
      fileName: "esre",
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
  },
});
