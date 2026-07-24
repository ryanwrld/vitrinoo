import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { UserCircle, Shield, Paintbrush } from "lucide-react";
import { ProfileForm } from "./profile-form";
import { ThemeToggle } from "./theme-toggle";

/**
 * Rota `/configuracoes` principal.
 * Usada para configurações da conta do usuário e interface do SaaS
 * (tema, preferências, senha, etc).
 * As configurações específicas da loja (nome, cor, slug, WhatsApp)
 * foram movidas para `/configuracoes/loja` e são acessadas clicando
 * no perfil da loja na sidebar.
 */
export default async function ConfiguracoesContaPage() {
  await requireCompletedOnboarding();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:py-10">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Configurações da conta</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Gerencie suas preferências de interface e segurança da sua conta.</p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <UserCircle className="h-5 w-5" />
          <h2 className="font-display font-bold">Seu perfil</h2>
        </div>
        <ProfileForm email={user?.email ?? ""} />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <Paintbrush className="h-5 w-5" />
          <h2 className="font-display font-bold">Interface</h2>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="block font-medium text-gray-900 dark:text-gray-50">Tema</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">Escolha como a plataforma Vitrinoo será exibida.</span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <Shield className="h-5 w-5" />
          <h2 className="font-display font-bold">Segurança</h2>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="block font-medium text-gray-900 dark:text-gray-50">Senha</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">Alterar a senha de acesso da sua conta.</span>
            </div>
            <button disabled className="cursor-not-allowed text-sm font-medium text-gray-400 dark:text-gray-600">
              Alterar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
