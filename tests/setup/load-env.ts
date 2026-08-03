import fs from "node:fs";
import path from "node:path";

/**
 * Carrega variáveis de `.env.local` (raiz do projeto) para `process.env` caso
 * ainda não estejam definidas. O Next.js faz isso automaticamente para
 * `next dev`/`next build`, mas o Vitest roda fora desse pipeline — sem isso,
 * `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` ficariam vazias ao rodar
 * `npx vitest run` diretamente.
 *
 * Vive num arquivo PRÓPRIO e é registrado em `setupFiles` do vitest.config
 * (não só chamado por `supabase-test.ts`) por causa de um bug real: enquanto
 * o carregamento morava apenas dentro de `supabase-test.ts`, qualquer teste
 * que precisasse do env sem importar aquele módulo — `tests/supabase/
 * server-cookies.test.ts`, que exercita `@/lib/supabase/server` diretamente —
 * rodava com `process.env` vazio e falhava com "TEST_SUPABASE_URL ausentes",
 * dando a impressão de credencial faltando quando ela estava configurada.
 * Depender de importar um módulo pelo seu efeito colateral é frágil; como
 * setupFile, o env é garantido pra TODO arquivo de teste.
 */
export function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();
