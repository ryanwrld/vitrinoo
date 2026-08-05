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
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user.id)
    .single();

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
