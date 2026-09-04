import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { createClient } from "@/lib/supabase/server";
import { StoreIdentityProvider } from "@/lib/store-identity/context";
import { TimezoneSync } from "@/components/timezone-sync";
import { PrecificacaoPendente } from "./precificacao-pendente";

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
  let storeTimezone: string | null = null;
  /*
    Pacote liberado e ainda não importado — é o que arma a abertura automática do fluxo de
    precificação (migration 0032). São DUAS COLUNAS na consulta que o layout já fazia, e
    não uma consulta nova: a alternativa era contar produtos importados a cada navegação do
    painel, que custaria caro para responder uma pergunta que um booleano responde.
  */
  let precificacaoPendente: "amostra" | "pacote" | null = null;
  if (userData.user) {
    const { data: store } = await supabase
      .from("stores")
      .select(
        "name, slug, logo_url, timezone, marketplace_access, pack_imported_at, sample_pricing_started_at",
      )
      .eq("owner_id", userData.user.id)
      .single();
    storeName = store?.name ?? null;
    storeSlug = store?.slug ?? null;
    storeLogoUrl = store?.logo_url ?? null;
    storeTimezone = store?.timezone ?? null;

    /*
      QUAL precificação está devendo. As duas condições vivem no banco, e é isso que faz o
      fluxo ser irrecusável de verdade: ele reabre depois de recarregar, de sair da conta e
      até em outro aparelho, porque não depende de nada guardado na aba.

      O PACOTE VEM PRIMEIRO. Quem comprou depois de já ter pegado a amostra tem as duas
      pendências abertas, e precificar 990 é a que importa — concluí-la ainda deixa a da
      amostra na fila, que aí aparece em seguida.
    */
    precificacaoPendente =
      store?.marketplace_access && !store?.pack_imported_at
        ? "pacote"
        : store?.sample_pricing_started_at
          ? "amostra"
          : null;
  }

  return (
    <div className="admin-scope flex min-h-dvh flex-col md:flex-row">
      {/* Mantém o fuso da loja igual ao do aparelho em uso (migration 0013).
          Aqui e não no onboarding apenas: aquele só roda na criação, então
          lojas já existentes ficariam presas no default para sempre. Sem
          trava de "uma vez só" — quem viaja quer o painel acompanhando. */}
      {storeTimezone && <TimezoneSync currentTimezone={storeTimezone} />}
      {/* Montado SEMPRE, mesmo sem pendência: quem decide é o cliente. Renderizar por
          condição aqui desmontava o fluxo no meio da conclusão — ver a nota no componente. */}
      <PrecificacaoPendente origem={precificacaoPendente} />
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
