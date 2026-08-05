import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Cliente Supabase com a SERVICE ROLE KEY — ignora RLS por completo.
 *
 * Existe por um motivo único: excluir a conta do usuário exige
 * `auth.admin.deleteUser`, que a chave anônima não pode chamar. NUNCA use
 * este cliente para leitura/escrita comum: sem RLS, um `store_id` errado
 * vaza ou destrói dados de outro lojista. Todo caminho normal continua em
 * `@/lib/supabase/server`.
 *
 * Só pode ser importado em código de servidor (Server Actions / Route
 * Handlers). Se a chave vazar para o bundle do cliente, qualquer visitante
 * ganha acesso irrestrito ao banco inteiro.
 *
 * A resolução de credenciais espelha `@/lib/supabase/env`: sob
 * `NODE_ENV === "test"` usa exclusivamente o projeto de teste e falha alto
 * se ele não estiver configurado — nunca cai de volta em produção em
 * silêncio (o mesmo acidente que já gravou centenas de linhas de teste na
 * `stores` de produção; ver o comentário de env.ts).
 */
export function createAdminClient() {
  const isTest = process.env.NODE_ENV === "test";

  const url = isTest ? process.env.TEST_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = isTest
    ? process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      isTest
        ? "NODE_ENV=test mas TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY ausentes — " +
          "o cliente admin NUNCA cai de volta nas credenciais de produção."
        : "SUPABASE_SERVICE_ROLE_KEY ausente — necessária para excluir contas."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
