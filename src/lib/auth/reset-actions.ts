"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUpSchema } from "@/lib/validation/auth";

export type ResetPasswordRequestResult = { message: string };
export type UpdatePasswordResult = { error: string } | void;

const RESET_PASSWORD_CALLBACK_PATH = "/admin/auth/confirm";
const GENERIC_RESET_MESSAGE = "Se o email existir, um link de recuperação foi enviado.";

/**
 * Monta a origem absoluta (protocolo + host) a partir do próprio request
 * (via `headers()`), para construir o `redirectTo` do link de recuperação
 * sem depender de uma env var fixa — funciona em dev, preview e produção
 * sem configuração extra.
 */
async function getSiteOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Solicitação de recuperação de senha (AUTH-05, D-02). Sempre retorna a
 * MESMA mensagem genérica, exista ou não a conta — mitiga enumeração de
 * contas (T-01-12; 01-RESEARCH.md §Domínio de Segurança). Nunca inspecionar
 * o resultado de erro do Supabase aqui.
 */
export async function requestPasswordReset(formData: FormData): Promise<ResetPasswordRequestResult> {
  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";

  if (!email) {
    return { message: GENERIC_RESET_MESSAGE };
  }

  const supabase = await createClient();
  const origin = await getSiteOrigin();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}${RESET_PASSWORD_CALLBACK_PATH}`,
  });

  return { message: GENERIC_RESET_MESSAGE };
}

/**
 * Define a nova senha (AUTH-05) após a sessão de recuperação já ter sido
 * estabelecida pelo Route Handler `/admin/auth/confirm` (`verifyOtp`). Senha fraca
 * é rejeitada por Zod (mesmo critério do cadastro) antes de gravar a nova
 * senha no Supabase Auth.
 */
export async function updatePassword(formData: FormData): Promise<UpdatePasswordResult> {
  const parsed = signUpSchema.shape.password.safeParse(formData.get("password"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Senha inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });

  if (error) {
    return { error: "Não foi possível redefinir sua senha. O link pode ter expirado — solicite um novo." };
  }

  redirect("/admin/dashboard");
}
