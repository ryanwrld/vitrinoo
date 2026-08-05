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
      {/* justify-center APENAS abaixo de lg. No mobile, onde as páginas são
          uma coluna só e frequentemente curtas, centralizar evita o conteúdo
          grudado no topo com um vazio grande embaixo.
          No desktop (`lg:justify-start`) isso é um problema, não uma melhoria:
          a altura do conteúdo varia por rota E por estado dentro da mesma rota
          (ex.: as abas "Conta"/"Loja" de /configuracoes, ou o Dashboard com
          mais/menos dados), então o cabeçalho — título + abas — mudava de
          altura ao navegar, o que lê como defeito. Ancorando no topo, o topo
          fica idêntico em todas as telas e a sobra vai toda para o rodapé.
          Páginas mais altas que a viewport nunca foram afetadas por nenhum
          dos dois casos: `justify-center` não altera o fluxo com scroll. */}
      <main className="flex min-h-dvh flex-1 flex-col justify-center bg-gray-50 lg:justify-start dark:bg-gray-925">
        <StoreIdentityProvider storeName={storeName} storeLogoUrl={storeLogoUrl}>
          {children}
        </StoreIdentityProvider>
      </main>
    </div>
  );
}
