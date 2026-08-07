import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { slugify } from "@/lib/slug/slugify";

const MAX_SLUG_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

function generateStoreSlug(email: string): string {
  const base = slugify(email.split("@")[0]) || "loja";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

/**
 * Garante que o usuário autenticado tem `stores`/`store_settings` — chamada
 * tanto no cadastro (caminho feliz) quanto no topo de `/admin/onboarding`
 * (self-heal). Existe porque `auth.signUp()` pode ter sucesso e o insert de
 * `stores` falhar logo depois (colisão do slug aleatório, hiccup
 * transitório de rede/DB), deixando um usuário autenticado sem loja — sem
 * este helper, esse usuário ficava permanentemente preso: `saveOnboarding`
 * só sabia fazer `UPDATE`, nunca `INSERT`, então "tente novamente" nunca
 * resolvia.
 *
 * Retry de slug (até `MAX_SLUG_ATTEMPTS`) só no caso de violação de
 * constraint UNIQUE (23505) — qualquer outro erro de banco propaga
 * imediatamente, nunca mascarado por uma nova tentativa.
 */
export async function ensureStoreForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string
): Promise<{ storeId: string } | { error: string }> {
  // `.order().limit(1).maybeSingle()` e NUNCA `.single()`: `.single()`
  // devolve data=null tanto para ZERO linhas quanto para VÁRIAS, e o erro
  // era descartado aqui. Numa conta que (por uma corrida na criação) ficou
  // com duas lojas, isso lia como "não tem loja" e o código abaixo criava
  // MAIS UMA — a cada visita ao onboarding, num ciclo que se realimentava:
  // o mesmo `.single()` no guard de rota já tinha redirecionado o usuário
  // para cá, e ele nunca mais saía. Aconteceu de verdade em 2026-08-07: uma
  // conta acumulou 8 lojas, 6 delas em 90 segundos, com a loja real (e seus
  // produtos) inalcançável.
  //
  // A migration 0015 tornou o estado duplicado impossível; esta leitura
  // tolerante é a segunda camada — se ainda assim houver mais de uma linha,
  // o comportamento correto é ADOTAR a mais antiga (a real, com o
  // conteúdo), jamais criar outra.
  const { data: existingStore } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let storeId = existingStore?.id ?? null;

  if (!storeId) {
    const storeName = email.split("@")[0];
    let lastError: { code?: string; message: string } | null = null;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !storeId; attempt++) {
      const slug = generateStoreSlug(email);
      const { data, error } = await supabase.from("stores").insert({ owner_id: userId, name: storeName, slug }).select("id").single();

      if (data) {
        storeId = data.id;
        break;
      }

      lastError = error;
      if (error?.code !== UNIQUE_VIOLATION) {
        break;
      }
    }

    if (!storeId) {
      return { error: lastError?.message ?? "Não foi possível preparar sua loja. Tente novamente." };
    }
  }

  // `store_settings` pode faltar mesmo com `stores` já existindo (a falha
  // parcial original também podia acontecer nesse segundo insert) —
  // verifica/repara independentemente de `stores` ter acabado de ser criada.
  const { data: existingSettings } = await supabase
    .from("store_settings")
    .select("store_id")
    .eq("store_id", storeId)
    .single();

  if (!existingSettings) {
    const { error: settingsError } = await supabase
      .from("store_settings")
      .insert({ store_id: storeId, onboarding_completed_at: null });

    if (settingsError) {
      return { error: "Não foi possível concluir a configuração inicial. Tente novamente." };
    }
  }

  return { storeId };
}
