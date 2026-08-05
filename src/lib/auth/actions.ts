"use server";

import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { ensureStoreForUser } from "@/lib/auth/ensure-store";

export type AuthActionResult = { error: string } | void;

/**
 * Cadastro (AUTH-01): cria o usuário no Supabase Auth (D-01 — acesso
 * imediato, sem verificação de email), grava a linha `stores` (slug único
 * auto-gerado, com retry em `ensureStoreForUser` se colidir) e a linha
 * `store_settings` (onboarding_completed_at NULL), e redireciona para o
 * wizard de onboarding (D-04) — nunca direto para o Dashboard.
 */
export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signUpError || !signUpData.user) {
    if (signUpError && isAuthRetryableFetchError(signUpError)) {
      return { error: "Não foi possível conectar. Verifique sua internet e tente novamente." };
    }
    return { error: signUpError?.message ?? "Não foi possível criar a conta. Tente novamente." };
  }

  // Se isto falhar aqui (colisão de slug esgotando os retries, hiccup de
  // rede/DB), o usuário já está autenticado e vai cair em `/admin/onboarding` no
  // próximo login — `ensureStoreForUser` roda de novo lá e se autocura
  // (ver onboarding/page.tsx), nunca mais uma conta presa permanentemente.
  const result = await ensureStoreForUser(supabase, signUpData.user.id, parsed.data.email);

  if ("error" in result) {
    return { error: `Conta criada, mas ${result.error.charAt(0).toLowerCase()}${result.error.slice(1)}` };
  }

  redirect("/admin/onboarding");
}

/**
 * Login (AUTH-02). Mensagem de erro genérica em qualquer falha de
 * credencial — nunca enumerar se o email existe ou não (mitiga Information
 * Disclosure, ver threat_model T-01-08 do plano original e T-01-07-01 do
 * gap-closure). Exceção: falha de rede (`AuthRetryableFetchError`, quando o
 * fetch() interno do Supabase nem chega a sair do servidor) não carrega
 * nenhuma informação sobre a existência da conta, então recebe uma mensagem
 * própria e honesta em vez de ser colapsada na mensagem de credenciais —
 * ver `.planning/debug/login-network-error-message.md`.
 */
export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: 'Email ou senha inválidos' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (isAuthRetryableFetchError(error)) {
      return { error: "Não foi possível conectar. Verifique sua internet e tente novamente." };
    }
    return { error: 'Email ou senha inválidos' };
  }

  redirect("/admin/dashboard"); // guard de onboarding decide se o revendedor realmente chega lá
}

/**
 * Logout (AUTH-03), disponível a partir de qualquer página do painel
 * (botão no dashboard nesta fase; layout compartilhado nas próximas).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
