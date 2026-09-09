import type { LucideIcon } from "lucide-react";
import { Home, Bell, List, PackagePlus, Settings, Store, LayoutGrid, ExternalLink, Headset } from "lucide-react";
import { buildSupportWhatsAppHref } from "@/lib/support/whatsapp";
import { normalizeSearch } from "@/lib/search/ilike";

/**
 * Registro estático de destinos pesquisáveis do painel — rotas internas,
 * links externos (vitrine pública) e ações (suporte). É a fonte "de
 * navegação" da busca global; produtos são a fonte dinâmica separada
 * (search/actions.ts). Manter este array como única fonte de verdade:
 * adicionar um destino novo à busca = adicionar uma linha aqui.
 *
 * `keywords` existe pra tolerar como o usuário chama cada coisa ("ajustes"
 * → Configurações, "cadastrar" → Novo produto) — o filtro casa contra
 * label + keywords, tudo normalizado (minúsculo, sem acento).
 */
export type SearchEntryKind = "route" | "external" | "action";

export type SearchEntry = {
  id: string;
  label: string;
  keywords: string[];
  Icon: LucideIcon;
  kind: SearchEntryKind;
  href: string;
  /** true = abre em nova aba (links externos / ação de suporte) */
  external?: boolean;
  /**
   * Texto de busca já normalizado (minúsculo, sem acento) = label + keywords.
   * Precomputado no build do registro pra o filtro não re-normalizar as
   * mesmas strings estáticas a cada tecla digitada.
   */
  searchText: string;
};

/** IDs mostrados como acesso rápido quando a busca está vazia. */
export const PRIMARY_NAV_IDS = ["dashboard", "produtos", "novo-produto", "configuracoes"] as const;

// Reexportado: a definição vive em search/ilike.ts, que o servidor também usa.
export { normalizeSearch };

type RegistryContext = {
  storeName: string | null;
  storeSlug?: string | null;
};

export function buildSearchRegistry({ storeName, storeSlug }: RegistryContext): SearchEntry[] {
  const base: Omit<SearchEntry, "searchText">[] = [
    { id: "dashboard", label: "Dashboard", keywords: ["inicio", "home", "painel", "visao geral"], Icon: Home, kind: "route", href: "/admin/dashboard" },
    { id: "notificacoes", label: "Notificações", keywords: ["atividade", "avisos", "sino", "alertas"], Icon: Bell, kind: "route", href: "/admin/dashboard/notificacoes" },
    { id: "produtos", label: "Produtos", keywords: ["catalogo", "chuteiras", "itens", "estoque"], Icon: List, kind: "route", href: "/admin/produtos" },
    { id: "novo-produto", label: "Novo produto", keywords: ["cadastrar", "adicionar", "criar", "novo"], Icon: PackagePlus, kind: "route", href: "/admin/produtos/novo" },
    /*
      As palavras de identidade da loja vivem AQUI, e não numa entrada própria.

      Existia uma segunda entrada, "Configurações da loja", apontando para
      /admin/configuracoes/loja — rota que NÃO EXISTE e responde 404. Quem
      buscava "whatsapp", "slug" ou "logo" era mandado para uma página quebrada.
      Essas coisas são editadas dentro de /admin/configuracoes mesmo, então as
      palavras vieram para cá em vez de sumir junto com a entrada morta.
    */
    { id: "configuracoes", label: "Configurações", keywords: ["ajustes", "preferencias", "conta", "tema", "senha", "identidade", "whatsapp", "link", "slug", "logo", "vitrine", "loja"], Icon: Settings, kind: "route", href: "/admin/configuracoes" },

    /*
      MARKETPLACE — as três rotas existiam desde antes desta busca ser escrita e
      nunca entraram aqui: buscar "marketplace" não podia achar nada, por
      construção. As palavras cobrem como o lojista chama a coisa ("pacote",
      "pack") e o que ele procura lá dentro (marcas), porque é assim que ele
      digita, não pelo nome da rota.
    */
    { id: "marketplace", label: "Marketplace", keywords: ["pacote", "pack", "comprar", "chuteiras prontas", "recursos", "oferta", "promocao"], Icon: Store, kind: "route", href: "/admin/marketplace" },
    { id: "marketplace-albuns", label: "Álbuns", keywords: ["marcas", "nike", "adidas", "puma", "mizuno", "joma", "new balance", "asics", "retro", "estilo", "colecoes", "pacote"], Icon: LayoutGrid, kind: "route", href: "/admin/marketplace/albuns" },
    { id: "marketplace-tudo", label: "Todas as chuteiras", keywords: ["pacote", "pack", "catalogo", "modelos", "procurar chuteira", "importar"], Icon: List, kind: "route", href: "/admin/marketplace/tudo" },
  ];

  // "Ver minha vitrine" só faz sentido quando já existe slug configurado.
  if (storeSlug) {
    base.push({
      id: "ver-vitrine",
      label: "Ver minha vitrine",
      keywords: ["publica", "link", "compartilhar", "loja"],
      Icon: ExternalLink,
      kind: "external",
      href: `/${storeSlug}`,
      external: true,
    });
  }

  base.push({
    id: "suporte",
    label: "Falar com suporte",
    keywords: ["ajuda", "contato", "whatsapp", "suporte"],
    Icon: Headset,
    kind: "action",
    href: buildSupportWhatsAppHref(storeName),
    external: true,
  });

  // Normaliza o texto de busca UMA vez aqui (não a cada tecla no filtro).
  return base.map((entry) => ({
    ...entry,
    searchText: normalizeSearch([entry.label, ...entry.keywords].join(" ")),
  }));
}

export function filterRegistry(entries: SearchEntry[], query: string): SearchEntry[] {
  const q = normalizeSearch(query.trim());
  if (!q) return entries;
  return entries.filter((entry) => entry.searchText.includes(q));
}
