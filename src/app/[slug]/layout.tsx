import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageviewTracker } from "./pageview-tracker";

/**
 * Layout da vitrine pública — resolve `store_id` a partir do `slug` UMA
 * ÚNICA VEZ e monta `<PageviewTracker>` sobre grid e detalhe. `layout.tsx`
 * recebe só `params` (nunca `searchParams`), então não é remontado quando
 * o visitante troca um filtro/termo de busca na mesma pathname — é
 * exatamente essa propriedade que faz D-02 valer (ver pageview-tracker.tsx).
 *
 * Este layout NUNCA adiciona gate de auth/redirect — `/[slug]` é rota
 * pública sem middleware (constraint do CLAUDE.md/PROJECT.md, T-06-07); ele
 * só resolve o `store_id` e monta o tracker, espelhando a disciplina de
 * `(admin)/layout.tsx` de resolver dado sem redirecionar.
 *
 * NÃO adicionar a diretiva de cache do App Router aqui — renderização
 * totalmente dinâmica (mandato do projeto para refletir estoque/dados com
 * delay de segundos).
 */
export default async function LojaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("id").eq("slug", slug).single();

  return (
    <>
      {store && <PageviewTracker storeId={store.id} />}
      {children}
    </>
  );
}
