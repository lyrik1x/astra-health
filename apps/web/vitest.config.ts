import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// M-17: las pruebas de la web usan el código fuente de los paquetes, nunca un dist viejo.
export default defineConfig({
  resolve: {
    alias: {
      "@astra/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@astra/health-engine": fileURLToPath(new URL("../../packages/health-engine/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
