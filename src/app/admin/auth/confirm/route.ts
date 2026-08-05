import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Troca o `token_hash` do link de recuperação de senha por uma sessão real
 * (AUTH-05, D-02; 01-RESEARCH.md Padrão 3). NÃO fazer parsing de fragmento
 * de URL do tipo hash-based token do GoTrue — o fragmento nunca chega ao
 * servidor em SSR (01-RESEARCH.md §Estado da Arte).
 *
 * Precondição manual (não código, ver `user_setup` do 01-04-PLAN.md): o
 * template de email "Reset Password" no painel Supabase precisa usar
 * `{{ .TokenHash }}` apontando para esta rota.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type === "recovery") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash });

    if (!error) {
      redirect("/admin/redefinir-senha");
    }
  }

  redirect("/admin/login?error=link_invalido_ou_expirado");
}
