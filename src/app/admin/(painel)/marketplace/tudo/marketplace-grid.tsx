"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Star, Archive, ChevronLeft, ChevronRight, Pencil, Check, Lock, RotateCcw } from "lucide-react";
import { trazerDeVolta } from "@/lib/marketplace/pricing-actions";
import { SOLE_LABELS, type SOLES } from "@/lib/products/constants";
import {
  setMarketplaceStatus,
  setMarketplacePreview,
  updateMarketplaceProduct,
  setMarketplaceStatusEmLote,
} from "@/lib/marketplace/actions";

type Item = {
  id: string;
  name: string;
  brand: string;
  brandOther: string | null;
  sole: string;
  suggestedPrice: number;
  sizeMin: number;
  sizeMax: number;
  status: string;
  preview: boolean;
  sourceAlbumId: string;
  jaImportado: boolean;
  /**
   * Já foi desta loja e foi APAGADA — o único caso em que o card oferece ação.
   *
   * Vem de um rastro de importação com `product_id` nulo (migration 0021). Nunca é
   * verdadeiro para uma chuteira que a loja jamais teve.
   */
  podeTrazerDeVolta: boolean;
  photoUrls: string[];
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

/**
 * Grid do marketplace. As fotos do fornecedor são todas 1:1 (recon §5), então o
 * card é quadrado e a imagem entra com `object-cover` sem risco de corte
 * estranho — nenhum tratamento de proporção é necessário.
 *
 * SELEÇÃO EM LOTE existe porque o acervo tem centenas de itens: curar clicando
 * card a card não é viável nessa escala, e foi o que motivou a barra flutuante.
 *
 * ESCOLHER É PRIVILÉGIO DE QUEM TEM ACESSO. Para o lojista que ainda está na
 * amostra grátis o grid é LEITURA PURA — sem checkbox, sem barra de seleção e
 * sem botão de adicionar no card. A amostra dele é sorteada (migration 0029), e
 * deixar a tela oferecer escolha era o que permitia levar as 10 melhores do
 * preview e nunca comprar o pacote. Ele continua vendo tudo: a lista completa é
 * a prova do tamanho do acervo, e é ela que vende.
 */
export function MarketplaceGrid({
  items,
  ehAdmin,
  pagina,
  totalPaginas,
}: {
  items: Item[];
  ehAdmin: boolean;
  pagina: number;
  totalPaginas: number;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [pendente, iniciar] = useTransition();

  // Só o admin. Ver a nota em `podeEscolher` acima: escolher a dedo deixou de existir
  // para o revendedor — ou o pacote inteiro, ou as 10 sorteadas.
  /*
    SÓ O ADMIN ESCOLHE A DEDO. O revendedor não seleciona mais nada aqui: ou ele compra o
    pacote (e as 990 entram pelo fluxo de precificação), ou ele sorteia as 10 da amostra.
    Deixar a grade importar item a item devolvia justamente o que a amostra sorteada
    (migration 0029) existe para impedir — garimpar o acervo escolhendo os melhores de
    graça. Decisão do dono, 2026-09-01.

    Para o admin a seleção continua igual: aqui ela é CURADORIA (publicar, despublicar,
    arquivar), não compra.
  */
  const podeEscolher = ehAdmin;

  function alternar(id: string) {
    if (!podeEscolher) return;
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function emLote(status: "published" | "draft" | "archived", rotulo: string) {
    const ids = [...selecionados];
    iniciar(async () => {
      const r = await setMarketplaceStatusEmLote(ids, status);
      if (r.ok) {
        toast.success(`${r.afetados ?? 0} ${r.afetados === 1 ? "item" : "itens"} ${rotulo}.`);
        setSelecionados(new Set());
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {items.map((item) => (
          <Card
            key={item.id}
            item={item}
            ehAdmin={ehAdmin}
            podeEscolher={podeEscolher}
            selecionado={selecionados.has(item.id)}
            onSelecionar={() => alternar(item.id)}
          />
        ))}
      </div>

      <Paginacao pagina={pagina} totalPaginas={totalPaginas} />

      {/* A barra de seleção não existe para quem não pode escolher — o estado
          `selecionados` fica sempre vazio nesse caso, mas a guarda é explícita
          para a intenção não depender de um efeito colateral.
          Fundo OPACO, sem `backdrop-blur`: a lista rola por baixo, e com a barra
          translúcida o card que passava atrás aparecia borrado dentro dela — lia
          como falha de renderização, não como vidro. */}
      {podeEscolher && selecionados.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-4 py-3 md:left-sidebar dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              {selecionados.size} {selecionados.size === 1 ? "selecionada" : "selecionadas"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <>
              <button
                type="button"
                disabled={pendente}
                onClick={() => emLote("published", "publicados")}
                className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
              >
                Publicar
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => emLote("draft", "despublicados")}
                className="min-h-10 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Despublicar
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => emLote("archived", "arquivados")}
                className="min-h-10 rounded-full border border-gray-300 px-4 text-sm font-medium text-error-fg transition-colors duration-150 hover:bg-error-bg disabled:opacity-60 dark:border-gray-700 dark:hover:bg-error-solid/15"
              >
                Arquivar
              </button>
              </>
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="min-h-10 px-3 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Card({
  item,
  ehAdmin,
  podeEscolher,
  selecionado,
  onSelecionar,
}: {
  item: Item;
  ehAdmin: boolean;
  podeEscolher: boolean;
  selecionado: boolean;
  onSelecionar: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(item.name);
  const [preco, setPreco] = useState(String(item.suggestedPrice));

  const publicado = item.status === "published";
  const marca = item.brand === "Outra" ? (item.brandOther ?? "Outra") : item.brand;

  function salvar() {
    iniciar(async () => {
      const r = await updateMarketplaceProduct(item.id, {
        name: nome,
        suggestedPrice: Number(preco.replace(",", ".")),
      });
      if (r.ok) {
        toast.success("Alterações salvas.");
        setEditando(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition-colors duration-150 dark:bg-gray-900 ${
        selecionado
          ? "border-primary ring-2 ring-primary-subtle dark:ring-blue-400/20"
          : "border-gray-200 dark:border-gray-800"
      } ${item.status === "archived" ? "opacity-50" : ""}`}
    >
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
        {item.photoUrls[0] ? (
          <Image
            src={item.photoUrls[0]}
            alt=""
            fill
            sizes="(min-width: 1536px) 16vw, (min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            sem foto
          </div>
        )}

        {podeEscolher && (ehAdmin || !item.jaImportado) && (
          <button
            type="button"
            onClick={onSelecionar}
            aria-label={selecionado ? "Desmarcar" : "Selecionar"}
            aria-pressed={selecionado}
            className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-150 ${
              selecionado
                ? "border-primary bg-primary text-white"
                : "border-white/70 bg-black/35 text-transparent hover:text-white/80"
            }`}
          >
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          </button>
        )}

        {/* Marcador de CURADORIA (`preview`), não da amostra do lojista. Chamava-se
            "amostra" e colidia com o nome da amostra sorteada, fazendo parecer
            que aqueles itens eram os que ele tinha ganhado. */}
        {ehAdmin && item.preview && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            destaque
          </span>
        )}
        {ehAdmin && !publicado && (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
            {item.status === "draft" ? "rascunho" : "arquivada"}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
          {item.photoUrls.length} fotos
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {editando ? (
          <>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              aria-label="Nome"
              className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50"
            />
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">R$</span>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                inputMode="decimal"
                aria-label="Preço sugerido"
                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50"
              />
              <button
                type="button"
                onClick={salvar}
                disabled={pendente}
                className="ml-auto rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setNome(item.name);
                  setPreco(String(item.suggestedPrice));
                  setEditando(false);
                }}
                className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
              {item.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {brl(item.suggestedPrice)}
              </span>
              {" · "}
              {item.sizeMin}-{item.sizeMax}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {marca} · {SOLE_LABELS[item.sole as (typeof SOLES)[number]] ?? item.sole}
            </p>
          </>
        )}

        {!editando && (
          <div className="mt-auto pt-2">
            {item.jaImportado ? (
              /* Azul cheio, texto branco: é o único estado POSITIVO do rodapé, e
                 no cinza ele empatava visualmente com "Bloqueado" — numa página
                 de dezenas de cards, o que o lojista quer achar de relance é o
                 que já é dele. */
              <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                Na sua loja
              </span>
            ) : item.podeTrazerDeVolta ? (
              /* A ÚNICA AÇÃO DESTE RODAPÉ, e ela não contradiz a regra abaixo.

                 "Não se escolhe uma a uma" é sobre ADQUIRIR. Esta chuteira já foi
                 desta loja e saiu: trazer de volta é desfazer um acidente, não montar
                 carrinho. É a mesma distinção que o trigger de quota do banco faz —
                 reimportar o que a loja já conheceu não consome vaga nova.

                 Sem isto, apagar um produto era irreversível: quem apagava uma das 10
                 da amostra só recuperava comprando o pacote, e quem tinha comprado as
                 990 teria que comprar tudo de novo por causa de um item. */
              <button
                type="button"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await trazerDeVolta(item.id);
                    if (r.ok) toast.success("De volta na sua loja.");
                    else toast.error(r.erro);
                  })
                }
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border border-primary px-3 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-primary-subtle disabled:opacity-60 dark:border-blue-400/40 dark:text-blue-300 dark:hover:bg-blue-400/10"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                {pendente ? "Trazendo…" : "Trazer de volta"}
              </button>
            ) : (
              /* ESTADO, NÃO AÇÃO — `span`, nunca `button`. Não existe nada para clicar
                 aqui: a chuteira entra na loja pelo pacote (as 990 de uma vez) ou pela
                 amostra sorteada, nunca escolhida uma a uma nesta grade. O rótulo diz o
                 que é verdade — "essa não é sua ainda" —, não "acabaram suas vagas".

                 Some do card quando não há nada aqui? Não: o rodapé de altura fixa é o
                 que mantém as linhas da grade alinhadas. */
              <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-gray-100 px-3 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <Lock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                No pacote
              </span>
            )}
          </div>
        )}

        {ehAdmin && !editando && (
          <div className="flex items-center gap-1 pt-2">
            <AcaoIcone
              titulo={publicado ? "Despublicar" : "Publicar"}
              ativo={publicado}
              pendente={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await setMarketplaceStatus(item.id, publicado ? "draft" : "published");
                  if (!r.ok) toast.error(r.error);
                })
              }
            >
              {publicado ? (
                <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
            </AcaoIcone>

            <AcaoIcone
              titulo={item.preview ? "Tirar da amostra" : "Colocar na amostra"}
              ativo={item.preview}
              pendente={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await setMarketplacePreview(item.id, !item.preview);
                  if (!r.ok) toast.error(r.error);
                })
              }
            >
              <Star
                className="h-4 w-4"
                strokeWidth={2}
                fill={item.preview ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </AcaoIcone>

            <AcaoIcone titulo="Editar" pendente={pendente} onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </AcaoIcone>

            <AcaoIcone
              titulo="Arquivar"
              perigo
              pendente={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await setMarketplaceStatus(item.id, "archived");
                  if (!r.ok) toast.error(r.error);
                })
              }
            >
              <Archive className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </AcaoIcone>
          </div>
        )}
      </div>
    </article>
  );
}

function AcaoIcone({
  titulo,
  ativo,
  perigo,
  pendente,
  onClick,
  children,
}: {
  titulo: string;
  ativo?: boolean;
  perigo?: boolean;
  pendente: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={pendente}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50 ${
        perigo
          ? "text-gray-400 hover:bg-error-bg hover:text-error-fg dark:hover:bg-error-solid/15"
          : ativo
            ? "bg-primary-subtle text-primary dark:bg-blue-400/15 dark:text-blue-300"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function Paginacao({ pagina, totalPaginas }: { pagina: number; totalPaginas: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  if (totalPaginas <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  };

  const estilo =
    "flex min-h-11 items-center gap-1.5 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

  return (
    <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Paginação">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} className={estilo}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Anterior
        </Link>
      ) : (
        <span className={`${estilo} pointer-events-none opacity-40`}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Anterior
        </span>
      )}

      <span className="text-sm text-gray-500 dark:text-gray-400">
        {pagina} de {totalPaginas}
      </span>

      {pagina < totalPaginas ? (
        <Link href={href(pagina + 1)} className={estilo}>
          Próxima
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
      ) : (
        <span className={`${estilo} pointer-events-none opacity-40`}>
          Próxima
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
