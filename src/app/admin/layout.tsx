import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { SessionWatcher } from "@/components/session-watcher";

/**
 * Layout compartilhado do grupo `(admin)`. Chama `getUser()` — que revalida
 * a sessão contra o servidor Supabase, nunca a leitura local de cookie sem
 * revalidação — e monta o `<SessionWatcher />` client-side para o grupo
 * inteiro (renovação silenciosa + aviso só em falha, AUTH-04/D-03).
 *
 * Nota de arquitetura (deviation documentada em 01-03-SUMMARY.md): o Next.js
 * App Router não expõe o pathname atual para Server Components de layout
 * sem passar por `middleware.ts` (cujo matcher deste projeto é
 * estritamente `/admin/:path*`, escopo que não cobre as rotas deste grupo
 * de rotas, pois `(admin)` é um Route Group e não adiciona `/admin` à URL —
 * decisão já travada e testada em `tests/middleware/matcher.test.ts`).
 * Por isso este layout NÃO redireciona globalmente com base em `getUser()`
 * (isso criaria um loop de redirecionamento em `/admin/login`/`/admin/cadastro`, que
 * ficariam presas atrás do próprio redirect). Em vez disso, cada página que
 * exige sessão (ex.: `/admin/dashboard`) chama seu próprio guard explícito
 * (`requireCompletedOnboarding`, que checa auth PRIMEIRO e onboarding
 * DEPOIS, como duas checagens sequenciais e separadas) — mantendo o
 * princípio de nunca fundir os dois guards, apenas movendo o ponto de
 * chamada da checagem de auth do layout para a página protegida.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  await supabase.auth.getUser();

  return (
    <>
      <SessionWatcher />
      {children}
    </>
  );
}
