import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { createClient } from "@/lib/supabase/server";
import { StoreIdentityProvider } from "@/lib/store-identity/context";

/**
 * Layout do grupo de rotas aninhado `(painel)` — isola a sidebar às páginas
 * autenticadas (Dashboard/Produtos/Configurações), sem afetar as páginas
 * públicas de auth que continuam vivendo direto sob `(admin)/` (Pitfall 4 de
 * 06-RESEARCH.md). Este é o ÚNICO `<main>` das páginas do painel — cada
 * página movida para dentro de `(painel)/` troca sua raiz `<main>` por
 * `<div>` para evitar landmark duplicado (Pitfall 5).
 *
 * Busca o nome da loja aqui (mesmo padrão de query já usado em
 * dashboard/produtos/configuracoes) só para exibir no rodapé da sidebar
 * (design system: bloco de conta com iniciais + nome da loja) — leitura
 * pura, nenhuma mutação nova.
 */
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let storeName: string | null = null;
  let storeSlug: string | null = null;
  let storeLogoUrl: string | null = null;
  if (userData.user) {
    const { data: store } = await supabase
      .from("stores")
      .select("name, slug, logo_url")
      .eq("owner_id", userData.user.id)
      .single();
    storeName = store?.name ?? null;
    storeSlug = store?.slug ?? null;
    storeLogoUrl = store?.logo_url ?? null;
  }

  return (
    <div className="admin-scope flex min-h-dvh flex-col md:flex-row">
      <AdminSidebar storeName={storeName} storeSlug={storeSlug} storeLogoUrl={storeLogoUrl} />
      {/* justify-center: quando o conteúdo da página é mais curto que a
          viewport (poucos dados no Dashboard, formulários curtos), ele fica
          centralizado no meio do `<main>` em vez de grudado no topo com um
          respiro vazio embaixo. Páginas mais altas que a viewport continuam
          normais — `justify-center` não afeta o scroll do fluxo do documento. */}
      <main className="flex min-h-dvh flex-1 flex-col justify-center bg-gray-50 dark:bg-gray-925">
        <StoreIdentityProvider storeName={storeName} storeLogoUrl={storeLogoUrl}>
          {children}
        </StoreIdentityProvider>
      </main>
    </div>
  );
}
