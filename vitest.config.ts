import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Garante `.env.local` em process.env para TODO arquivo de teste, não só
    // pros que importam `tests/setup/supabase-test.ts` — ver o comentário em
    // load-env.ts para o bug concreto que isso corrige.
    setupFiles: ["./tests/setup/load-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
