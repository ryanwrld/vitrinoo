import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureStoreForUser } from "@/lib/auth/ensure-store";
import { OnboardingWizard } from "./onboarding-wizard";

/**
 * Guard de auth explícito e direto (`getUser()`), SEM reaproveitar
 * `requireCompletedOnboarding` — chamar esse guard aqui criaria um loop de
 * redirect (`/admin/onboarding` → `/admin/onboarding`), conforme a Deviation #1 do
 * `01-03-SUMMARY.md`, documentada especificamente para esta página: "a
 * página /onboarding que o Plan 05 vai criar também precisa chamar seu
 * próprio guard de auth no topo (ex.: reaproveitando getUser() diretamente)".
 *
 * `(admin)/layout.tsx` monta `<SessionWatcher />` para todo o grupo mas NÃO
 * redireciona globalmente (ver mesma Deviation) — cada página protegida é
 * responsável pelo seu próprio gate.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/admin/login");
  }

  // Self-heal: cobre a conta que ficou sem `stores`/`store_settings` porque
  // `signUpAction` conseguiu criar o usuário mas não a loja (colisão de
  // slug, hiccup de rede/DB) — sem isso, essa conta ficava presa pra
  // sempre, já que `saveOnboarding` só sabe fazer `UPDATE`, nunca `INSERT`.
  const result = await ensureStoreForUser(supabase, data.user.id, data.user.email ?? "");

  if ("error" in result) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="font-display font-bold text-gray-900 dark:text-gray-50">Não foi possível preparar sua loja</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{result.error} Se o problema persistir, entre em contato com o suporte.</span>
      </div>
    );
  }

  return <OnboardingWizard />;
}
