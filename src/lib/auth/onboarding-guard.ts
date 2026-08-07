import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard de DADOS (D-04) — separado e explícito do gate de auth (Antipadrão
 * do 01-RESEARCH.md: nunca fundir "sessão válida?" com "onboarding
 * completo?" em uma única condição). Usado em toda página protegida que
 * exige onboarding completo (ex.: `/admin/dashboard`), nunca no próprio
 * `/admin/onboarding` nem nas rotas de auth — evita loop de redirect.
 *
 * Também revalida a sessão via `getUser()` como rede de segurança: como
 * `(admin)/layout.tsx` não pode determinar de forma confiável se a rota
 * atual é uma entrada pública do admin (Next.js App Router não expõe o
 * pathname para Server Components de layout sem tocar no middleware, cujo
 * matcher é estritamente `/admin/:path*` — ver 01-03-SUMMARY.md), cada
 * página protegida chama este guard como sua própria fonte de verdade de
 * auth + onboarding, em duas checagens sequenciais e explícitas (nunca uma
 * condição fundida).
 */
export async function requireCompletedOnboarding(): Promise<void> {
  const supabase = await createClient();

  // 1) Gate de auth (nunca `getSession()`).
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/admin/login");
  }

  // 2) Gate de dados — onboarding completo?
  // `.limit(1).maybeSingle()` e NUNCA `.single()`: `.single()` devolve null
  // tanto para ZERO linhas quanto para VÁRIAS. Este é o ponto que DISPARA o
  // redirect para o onboarding, então confundir "tem duas lojas" com "não
  // tem loja" prendia o usuário lá para sempre — e o `ensureStoreForUser`
  // chamado por aquela página, com o mesmo defeito, criava uma loja nova a
  // cada visita (incidente de 2026-08-07: 8 lojas numa conta, a real
  // inalcançável). A migration 0015 tornou o estado duplicado impossível;
  // esta leitura é a segunda camada.
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!store) {
    redirect("/admin/onboarding");
  }

  const { data: settings } = await supabase
    .from("store_settings")
    .select("onboarding_completed_at")
    .eq("store_id", store.id)
    .single();

  if (!settings || !settings.onboarding_completed_at) {
    redirect("/admin/onboarding");
  }
}
