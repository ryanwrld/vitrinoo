"use client";

import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ImageOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { formatBRLPriceInput, parseBRLPrice } from "@/lib/currency/brl";
import {
  deleteProduct,
  deleteProductsEmLote,
  setProductStatusEmLote,
  setProductStatusPorFiltro,
  deleteProductsPorFiltro,
  type FiltroDeProdutos,
  updateProductPrice,
  updateProductPromotionalPrice,
} from "@/lib/products/actions";
import { buildProductUrl } from "@/lib/slug/store-url";
import { ShareVitrineButton } from "@/components/share-vitrine-button";
import { Paginacao } from "./paginacao";

export type ProductListItem = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  price: number;
  /** Preço promocional (gatilho de conversão na vitrine pública, `PriceDisplay`)
   * — `null` quando o produto não tem promoção ativa. */
  promotional_price: number | null;
  status: string;
  /** Disponibilidade derivada (queryProducts, Plan 03-06) — EXISTS sobre
   * product_sizes.available=true. Rollup no nível do produto: mostra
   * "Disponível"/"Esgotado" sem strikethrough (reservado para os pills de
   * tamanho individual, 03-UI-SPEC.md §Product list page). */
  disponivel: boolean;
  /** URL pública da foto de posição 0 (capa, D-11), ou null sem foto ainda. */
  coverUrl: string | null;
};

export type ProductListProps = {
  products: ProductListItem[];
  storeSlug: string;
  storeName: string | null;
  pagina: number;
  totalPaginas: number;
  /** Quantos produtos casam com o filtro atual, somando TODAS as páginas. */
  totalFiltrado: number;
  filtro: FiltroDeProdutos;
};

/**
 * Edição rápida do preço direto na linha, sem abrir o formulário completo —
 * espelha o padrão do `slug-editor.tsx` (Fase 2): estado local otimista,
 * commit só no blur/Enter, revert pro valor salvo em caso de erro/parse
 * inválido (`parseBRLPrice` retorna `null`). `updateProductPrice` é a
 * Server Action dedicada (só a coluna `price`) — nunca `updateProduct`, que
 * exigiria o FormData inteiro do formulário (tamanhos incluídos).
 */
/**
 * Largura ÚNICA da célula de preço — usada tanto pelas pills de input
 * (Preço/Promocional) quanto pelos rótulos da guia de colunas acima delas.
 * Fixar os dois na MESMA medida é o que mantém cada rótulo centrado no seu
 * input: antes o rótulo era do tamanho do próprio texto ("Promocional" tem
 * o dobro da largura de "Preço") e ficava deslocado ~22px do centro da pill.
 */
const PRICE_CELL_WIDTH = "w-[109px]";

function ProductPriceInput({ productId, price }: { productId: string; price: number }) {
  const router = useRouter();
  const [value, setValue] = useState(() => formatBRLPriceInput(price));
  const [isPending, startTransition] = useTransition();

  function commit() {
    const parsed = parseBRLPrice(value);
    if (parsed === null) {
      toast.error("Preço inválido.");
      setValue(formatBRLPriceInput(price));
      return;
    }
    if (parsed === price) {
      setValue(formatBRLPriceInput(price));
      return;
    }

    startTransition(async () => {
      const result = await updateProductPrice(productId, parsed);
      if ("error" in result) {
        toast.error(result.error);
        setValue(formatBRLPriceInput(price));
      } else {
        toast.success("Preço atualizado.");
        router.refresh();
      }
    });
  }

  return (
    <div className={`${PRICE_CELL_WIDTH} flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-800/60 dark:focus-within:ring-blue-400/20`}>
      <span className="text-xs text-gray-500 dark:text-gray-400">R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={isPending}
        aria-label="Preço"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-16 bg-transparent text-sm font-medium text-gray-900 outline-none disabled:opacity-60 dark:text-gray-50"
      />
    </div>
  );
}

/**
 * Input "Promocional" (gatilho de conversão, `PriceDisplay` na vitrine
 * pública) — MESMO padrão de commit de `ProductPriceInput`, com duas
 * diferenças: (1) vazio é um valor válido (remove a promoção, não um erro
 * de parse); (2) a relação "promocional < normal" é reforçada visualmente
 * como pedido pelo usuário — borda vermelha + `.animate-shake` (mesma
 * classe já usada no CTA "Pedir agora" sem tamanho, `product-order-panel.tsx`),
 * igual ao feedback de senha errada, em vez de só um toast. `errorKey`
 * incrementa a cada tentativa inválida pra reiniciar a animação mesmo em
 * erros consecutivos (mesmo truque do `orderShakeKey`).
 */
function ProductPromoPriceInput({
  productId,
  price,
  promotionalPrice,
}: {
  productId: string;
  price: number;
  promotionalPrice: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => (promotionalPrice !== null ? formatBRLPriceInput(promotionalPrice) : ""));
  const [hasError, setHasError] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  function revertTo(nextPrice: number | null) {
    setValue(nextPrice !== null ? formatBRLPriceInput(nextPrice) : "");
  }

  function fail(message: string) {
    toast.error(message);
    setHasError(true);
    setErrorKey((key) => key + 1);
  }

  function commit() {
    setHasError(false);

    if (value.trim() === "") {
      if (promotionalPrice === null) return;
      startTransition(async () => {
        const result = await updateProductPromotionalPrice(productId, null);
        if ("error" in result) {
          fail(result.error);
          revertTo(promotionalPrice);
        } else {
          toast.success("Preço promocional removido.");
          router.refresh();
        }
      });
      return;
    }

    const parsed = parseBRLPrice(value);
    if (parsed === null) {
      fail("Preço promocional inválido.");
      revertTo(promotionalPrice);
      return;
    }
    if (parsed >= price) {
      fail("O promocional deve ser menor que o normal.");
      return;
    }
    if (parsed === promotionalPrice) {
      revertTo(promotionalPrice);
      return;
    }

    startTransition(async () => {
      const result = await updateProductPromotionalPrice(productId, parsed);
      if ("error" in result) {
        fail(result.error);
        revertTo(promotionalPrice);
      } else {
        toast.success("Preço promocional atualizado.");
        router.refresh();
      }
    });
  }

  return (
    <div
      key={errorKey}
      className={`${PRICE_CELL_WIDTH} flex h-9 items-center gap-1 rounded-full border bg-gray-50 px-3 transition-colors duration-150 focus-within:ring-2 dark:bg-gray-800/60 ${
        hasError
          ? "animate-shake border-error-solid focus-within:border-error-solid focus-within:ring-error-bg dark:focus-within:ring-error-solid/20"
          : "border-gray-200 focus-within:border-primary focus-within:ring-primary-subtle dark:border-gray-700 dark:focus-within:ring-blue-400/20"
      }`}
    >
      <span className={`text-xs ${hasError ? "text-error-solid" : "text-gray-500 dark:text-gray-400"}`}>R$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={isPending}
        placeholder="—"
        aria-label="Preço promocional"
        onChange={(event) => {
          setValue(event.target.value);
          if (hasError) setHasError(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-16 bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-gray-50 dark:placeholder:text-gray-600"
      />
    </div>
  );
}

/**
 * Menu "mais ações" exclusivo do mobile (abaixo de `sm:`) — substitui os 3
 * botões circulares (compartilhar/editar/excluir, que no desktop moram na
 * própria coluna "Ações") por um único gatilho de três pontinhos, na MESMA
 * linha dos inputs de preço/promocional (pedido explícito do usuário).
 * Reusa os mesmos handlers/componentes do desktop (`ShareVitrineButton`,
 * link de editar, `onDelete` = `openDeleteDialog` do componente pai) — só
 * a apresentação muda de ícone-em-círculo pra item-de-lista-com-texto.
 */
function ProductMobileActionsMenu({
  product,
  storeSlug,
  storeName,
  onDelete,
}: {
  product: ProductListItem;
  storeSlug: string;
  storeName: string | null;
  onDelete: (product: ProductListItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative shrink-0 sm:hidden" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Mais ações para ${product.name}`}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-50"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div className="animate-slide-in-right absolute right-0 top-full z-10 mt-2 w-[136px] overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {/* Ordem por tamanho do rótulo, menor pra maior: Editar (6) ->
              Excluir (7) -> Compartilhar (12) — pedido explícito do
              usuário. */}
          <Link
            href={`/admin/produtos/${product.id}/editar`}
            className="flex items-center justify-end gap-2 px-3 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            onClick={() => setOpen(false)}
          >
            <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Editar
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete(product);
            }}
            className="flex w-full items-center justify-end gap-2 px-3 py-2.5 text-left text-sm text-error-fg transition-colors duration-150 hover:bg-error-bg dark:hover:bg-error-solid/15"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Excluir
          </button>
          <ShareVitrineButton
            url={buildProductUrl(storeSlug, product.id)}
            storeName={storeName}
            label="Compartilhar"
            className="flex w-full items-center justify-end gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Listagem de produtos (03-UI-SPEC.md §Product list page). Base (Plan 03-02)
 * renderiza nome/marca/linha/preço/status.
 *
 * Plan 03-05 adicionou os botões editar (`Pencil`, link para
 * `/admin/produtos/[id]/editar`) e excluir (`Trash2`, abre o diálogo nativo de
 * confirmação — mesmo padrão `<dialog>` do slug-editor.tsx, Fase 2). Um
 * único `<dialog>` compartilhado no fim da lista (controlado por
 * `deleteTarget`) evita duplicar um `<dialog>` por linha. `deleteProduct` só
 * é chamado a partir do onClick explícito de "Sim, excluir" — nunca do
 * cancelamento/close/escape do dialog (mesma disciplina do slug-editor).
 *
 * Esta fatia (Plan 03-06 Task 3) adiciona a thumbnail de capa (`coverUrl` via
 * `next/image`, com `ImageOff` como fallback quando o produto não tem foto
 * ainda) e o indicador de disponibilidade derivada (`disponivel`, rollup via
 * `queryProducts`) — "Disponível" (dot verde) ou "Esgotado" (dot cinza, sem
 * strikethrough neste nível de rollup — strikethrough é reservado para os
 * pills de tamanho individual no formulário). Os dois empty states (nenhum
 * produto vs. filtro sem resultado) são decididos e renderizados por
 * `page.tsx`, não por este componente.
 */
/**
 * A marca de seleção, usada tanto na linha quanto no controle geral da guia.
 *
 * `<input type="checkbox">` de verdade, com a aparência custom por cima: teclado, leitor de
 * tela e o estado `indeterminate` (parcial) vêm de graça, e nenhum deles sairia igual com um
 * `<button aria-pressed>`. O `indeterminate` só existe via propriedade do DOM — não há
 * atributo — por isso o ref.
 */
function Marca({
  marcado,
  parcial = false,
  onMudar,
  rotulo,
  className = "",
}: {
  marcado: boolean;
  parcial?: boolean;
  onMudar: () => void;
  rotulo: string;
  className?: string;
}) {
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (campo.current) campo.current.indeterminate = parcial;
  }, [parcial]);

  return (
    <span className={`relative inline-flex h-5 w-5 shrink-0 ${className}`}>
      <input
        ref={campo}
        type="checkbox"
        checked={marcado}
        onChange={onMudar}
        aria-label={rotulo}
        /* Tamanho EXPLÍCITO, centrado sobre o quadrado desenhado: um
           <input type="checkbox"> é elemento substituído, então tem largura própria do
           navegador (12px) e nem `inset-0` nem `-inset-2` a esticam — o alvo real ficava
           menor que o quadrado de 20px que se vê. Com 36px o toque no celular passa a
           acertar, sem mudar nada da aparência. */
        className="peer absolute left-1/2 top-1/2 z-10 m-0 h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none flex h-5 w-5 items-center justify-center rounded-[7px] border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-2 ${
          marcado || parcial
            ? "border-primary bg-primary text-white"
            : "border-gray-300 bg-white/90 text-transparent dark:border-gray-600 dark:bg-gray-900/80"
        }`}
      >
        {parcial && !marcado ? (
          <span className="h-0.5 w-2.5 rounded-full bg-current" />
        ) : (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        )}
      </span>
    </span>
  );
}

/**
 * UMA linha da lista.
 *
 * `memo` NÃO é enfeite aqui: sem ele, marcar um produto re-renderizava as 990 linhas do
 * catálogo importado, e o clique levava 676ms até a barra começar a subir (medido). Como
 * cada linha só depende do PRÓPRIO estado de seleção, memoizada ela ignora a mudança das
 * vizinhas — só a que foi clicada re-renderiza.
 *
 * Para o memo valer alguma coisa, todo callback que chega aqui precisa ter identidade
 * estável (`useCallback` sem dependências, no pai) — senão a comparação de props falha
 * em todas as linhas e voltamos ao ponto de partida.
 */
const LinhaProduto = memo(function LinhaProduto({
  product,
  index,
  selecionado,
  ocupado,
  storeSlug,
  storeName,
  onAlternar,
  onExcluir,
}: {
  product: ProductListItem;
  index: number;
  selecionado: boolean;
  ocupado: boolean;
  storeSlug: string;
  storeName: string | null;
  onAlternar: (id: string) => void;
  onExcluir: (product: ProductListItem) => void;
}) {
  const aoAlternar = useCallback(() => onAlternar(product.id), [onAlternar, product.id]);

      const brandLabel = product.brand === "Outra" && product.brand_other ? product.brand_other : product.brand;
      const secondaryLine = [brandLabel, product.line].filter(Boolean).join(" · ");

      return (
        <li
          key={product.id}
          className={`relative flex flex-wrap items-center gap-3 border bg-white p-3 shadow-sm transition-[border-color,opacity] duration-150 dark:bg-gray-900 ${
            index === 0 ? "rounded-[2rem] sm:rounded-b-[2rem] sm:rounded-t-none sm:border-t-0" : "rounded-[2rem]"
          } ${
            selecionado
              ? "border-primary/60 dark:border-primary/60"
              : "border-gray-200 dark:border-gray-800"
          } ${ocupado ? "opacity-50" : ""}`}
        >
          {/* Estrutura FLAT (sem wrapper `contents` — `sm:contents` não
              estava gerando regra CSS neste dev server, mesmo bug de
              cache do `gap-10`/`fill-[...]` mais acima nesta sessão):
              todo mundo é filho DIRETO do `<li>` (`flex flex-wrap`), e
              só o grupo de preço força quebra de linha no mobile via
              `basis-full` — sem espaço sobrando na linha, os grupos
              seguintes (status/ações) são empurrados pro flex-wrap
              automaticamente, sem precisar de `basis-full` neles
              também. */}
          {/* A marca fica ANTES da foto, em coluna própria: sobreposta à miniatura ela
              tapava justamente o par de chuteiras que o lojista precisa reconhecer para
              saber o que está marcando. Ocupa espaço fixo na linha (marcado ou não),
              então nada pula de lugar ao selecionar.
              Só a partir de `sm:` — no celular esta coluna custava 32px da largura do
              nome, que já truncava; lá a marca vive ao lado do menu "⋮" (mais abaixo).
              O `<span>` em volta é que some/aparece: mexer no `display` por dentro do
              componente brigaria com o `inline-flex` que ele já aplica. */}
          <span className="hidden shrink-0 sm:inline-flex">
            <Marca
              marcado={selecionado}
              onMudar={aoAlternar}
              rotulo={`Selecionar ${product.name}`}
            />
          </span>

          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[1.25rem] bg-gray-100 dark:bg-gray-800">
            {product.coverUrl ? (
              <Image
                src={product.coverUrl}
                alt={product.name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-6 w-6 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* `style maxWidth` (não classe `sm:max-w-*` — mesmo bug de
              cache do Tailwind que já apareceu com `gap-10`/`fill-
              [...]`/`sm:contents` nesta sessão dev, a classe não gerava
              regra CSS nenhuma): sem teto, essa coluna cresce até o
              tamanho do próprio texto (o par preço/promocional, ao
              lado, não tem largura de conteúdo real — os inputs são
              absolutos — então "sobra" espaço de mais pro nome, que
              nunca truncava de verdade). Um nome comprido chegava a
              poucos px do preço, quase colado. O teto força o "…" e
              mantém respiro fixo, não importa o tamanho do nome. 320px
              é generoso o bastante pra nunca apertar o mobile (onde a
              coluna já é naturalmente mais estreita que isso). */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5" style={{ maxWidth: "320px" }}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate font-display font-medium text-gray-900 dark:text-gray-50">{product.name}</span>
              {/* Status: versão MOBILE — vive na MESMA linha flex do
                  nome (não da `<li>` inteira, que tem `items-center`
                  contra a foto de 64px e empurrava o selo pro topo da
                  foto em vez de alinhar com o texto). Só aparece
                  abaixo de `sm:`; a versão desktop (coluna própria,
                  mais abaixo) é a exibida a partir daí. */}
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold sm:hidden ${
                  product.status === "published" ? "bg-success-bg text-success-fg dark:bg-success-solid/15" : "bg-warning-bg text-warning-solid dark:bg-warning-solid/15"
                }`}
              >
                {product.status === "published" ? "Publicado" : "Rascunho"}
              </span>
            </div>
            {(secondaryLine || !product.disponivel) && (
              <span className="flex min-w-0 items-center gap-2.5 text-xs">
                {secondaryLine && <span className="truncate text-gray-500 dark:text-gray-400">{secondaryLine}</span>}
                {!product.disponivel && (
                  <span className="flex shrink-0 items-center gap-1 text-error-fg transition-colors duration-150">
                    <span className="h-1.5 w-1.5 rounded-full bg-error-solid" aria-hidden="true" />
                    Esgotado
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Preço + Promocional: `basis-full` força quebra de linha no
              mobile (linha própria, full-width, sem o truque de
              centralização absoluta); a partir de `sm:` volta a ser um
              item de linha normal (`sm:basis-auto sm:flex-1`), com o
              par de inputs centralizado na largura TOTAL do card via
              `absolute` (referência = `<li>` relative, inalterado). */}
          <div className="flex basis-full items-start justify-between gap-2 sm:basis-auto sm:flex-1 sm:items-center sm:justify-center">
            <div className="flex gap-2 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
              {/* Rótulos abaixo do input SÓ no mobile (`sm:hidden`) —
                  lá não existe a guia de colunas (escondida abaixo de
                  `sm:`), então sem isso o par de pills não tinha
                  identificação nenhuma de qual é qual. */}
              <div className="flex flex-col items-center gap-1">
                <ProductPriceInput productId={product.id} price={product.price} />
                <span className="text-[10px] text-gray-500 sm:hidden dark:text-gray-400">Preço</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ProductPromoPriceInput
                  productId={product.id}
                  price={product.price}
                  promotionalPrice={product.promotional_price}
                />
                <span className="text-[10px] text-gray-500 sm:hidden dark:text-gray-400">Promocional</span>
              </div>
            </div>

            {/* Gatilho de "mais ações" — SÓ mobile, mesma linha dos
                inputs (pedido explícito do usuário). No desktop
                (`sm:hidden` dentro do próprio componente) não renderiza
                nada visível.
                A marca de seleção vem colada à esquerda dele: no celular ela sai da
                frente da foto para não roubar largura do nome, e aqui reaproveita um
                canto que já era de controle, não de conteúdo. */}
            <div className="flex shrink-0 items-center gap-2">
              <Marca
                marcado={selecionado}
                onMudar={aoAlternar}
                rotulo={`Selecionar ${product.name}`}
                className="sm:hidden"
              />
              <ProductMobileActionsMenu
                product={product}
                storeSlug={storeSlug}
                storeName={storeName}
                onDelete={onExcluir}
              />
            </div>
          </div>

          {/* Status: versão DESKTOP (coluna própria) — oculta no
              mobile, onde a versão ao lado do nome (acima) já cobre. */}
          <span
            className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline-flex ${
              product.status === "published" ? "bg-success-bg text-success-fg dark:bg-success-solid/15" : "bg-warning-bg text-warning-solid dark:bg-warning-solid/15"
            }`}
          >
            {product.status === "published" ? "Publicado" : "Rascunho"}
          </span>

          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <ShareVitrineButton
              url={buildProductUrl(storeSlug, product.id)}
              storeName={storeName}
              label={null}
              ariaLabel={`Compartilhar ${product.name}`}
              iconClassName="h-4 w-4"
              strokeWidth={2}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-50"
            />
            <Link
              href={`/admin/produtos/${product.id}/editar`}
              aria-label={`Editar ${product.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-50"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => onExcluir(product)}
              aria-label={`Excluir ${product.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </li>
      );
});

export function ProductList({ products, storeSlug, storeName, pagina, totalPaginas, totalFiltrado, filtro }: ProductListProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  /*
    SELEÇÃO POR ID, nunca por posição: a lista é re-renderizada pelo servidor a cada
    `router.refresh()`, e um índice apontaria para outro produto depois de qualquer mudança
    de filtro, ordenação ou exclusão.
  */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [emAndamento, iniciarLote] = useTransition();
  const [excluirLote, setExcluirLote] = useState(false);
  // Qual ação está rodando: o "aguarde" precisa aparecer no botão que o lojista clicou.
  // Sem isso, clicar em "Rascunhar" acendia o rótulo de espera em "Publicar".
  const [acaoEmCurso, setAcaoEmCurso] = useState<"published" | "draft" | null>(null);

  /*
    NADA DE ATUALIZAÇÃO ADIANTADA AQUI.

    A tentação é pintar o novo status no clique. Mas aí o selo já diz "Rascunho" enquanto o
    botão ainda diz "Rascunhando…" — a tela afirma uma coisa que o banco ainda não confirmou.
    O status muda quando a ação RESPONDE, no mesmo instante em que o botão volta ao normal.
    Isso não custa um recarregamento: as actions chamam `revalidatePath`, e a resposta da
    própria Server Action já traz a lista nova.
  */
  const idsVisiveis = products.map((p) => p.id);
  // A seleção pode conter id que saiu da tela (o lojista marcou e trocou o filtro). A conta
  // que a barra mostra e as ações usam é sempre a INTERSEÇÃO com o que está visível — agir
  // sobre o que ele não está mais vendo seria surpresa.
  const marcados = idsVisiveis.filter((id) => selecionados.has(id));
  const todosMarcados = marcados.length > 0 && marcados.length === idsVisiveis.length;
  const parcial = marcados.length > 0 && !todosMarcados;

  /*
    MODO "TODO O FILTRO".

    Com a lista paginada, marcar tudo alcança só os 48 da página. Arrumar um catálogo de 990
    exigiria repetir a ação em 21 páginas — o trabalho que a seleção em lote existe para
    eliminar. Então, com a página inteira marcada, a barra oferece estender para o resultado
    do filtro, e nesse modo as ações vão pelo FILTRO, não por uma lista de ids.

    Cai sozinho quando o filtro muda (`filtro` vira outro objeto a cada navegação, e o
    conjunto que o lojista aceitou deixou de ser aquele) — por isso a chave do `useState`
    não guarda ids, só um sim/não que o efeito abaixo derruba.
  */
  const [modoFiltro, setModoFiltro] = useState(false);
  const assinaturaFiltro = JSON.stringify(filtro);
  const [filtroAnterior, setFiltroAnterior] = useState(assinaturaFiltro);
  if (filtroAnterior !== assinaturaFiltro) {
    setFiltroAnterior(assinaturaFiltro);
    setModoFiltro(false);
  }

  const temSelecao = marcados.length > 0;
  const quantidadeAlvo = modoFiltro ? totalFiltrado : marcados.length;

  /*
    Publicar o que já está publicado não faz nada. Oferecer o botão assim mesmo é prometer
    uma ação que não existe — então cada um só aparece quando há pelo menos um produto
    marcado em que ele muda alguma coisa.
    No modo "todo o filtro" os dois ficam: o conjunto passa das páginas que estão na tela, e
    esconder um por causa dos 48 visíveis esconderia a ação dos outros 942.
  */
  const marcadosNaPagina = products.filter((p) => selecionados.has(p.id));
  const podePublicar = modoFiltro || marcadosNaPagina.some((p) => p.status !== "published");
  const podeRascunhar = modoFiltro || marcadosNaPagina.some((p) => p.status !== "draft");
  // O convite só aparece quando a página inteira está marcada E existe mais coisa fora dela.
  const podeEstender = !modoFiltro && todosMarcados && totalFiltrado > idsVisiveis.length;

  /*
    O QUE A BARRA MOSTRA enquanto DESCE.

    Ela não sai do DOM (é a classe `.on` que a esconde), então, sem isto, no primeiro quadro
    da saída o texto viraria "0 selecionados" e o "Selecionar todos" reapareceria — bem no
    meio da descida. `rotulo` só é atualizado quando existe seleção; quando ela zera, ele
    fica parado no último valor válido, que é justamente o que faz sentido continuar lendo
    enquanto a barra sai de cena.

    Ajuste de estado durante o render (padrão do React para "estado derivado de props"),
    não um efeito: o valor certo precisa estar pronto no MESMO quadro em que a barra sobe.
  */
  const [rotulo, setRotulo] = useState({
    n: 0,
    total: 0,
    todos: false,
    estender: false,
    totalFiltro: 0,
    publicar: true,
    rascunhar: true,
  });
  if (
    temSelecao &&
    (rotulo.n !== quantidadeAlvo ||
      rotulo.total !== idsVisiveis.length ||
      rotulo.todos !== todosMarcados ||
      rotulo.estender !== podeEstender ||
      rotulo.totalFiltro !== totalFiltrado ||
      rotulo.publicar !== podePublicar ||
      rotulo.rascunhar !== podeRascunhar)
  ) {
    setRotulo({
      n: quantidadeAlvo,
      total: idsVisiveis.length,
      todos: todosMarcados,
      estender: podeEstender,
      totalFiltro: totalFiltrado,
      publicar: podePublicar,
      rascunhar: podeRascunhar,
    });
  }

  /* `useCallback` sem dependências nos dois callbacks que descem para a linha: é o que
     mantém a identidade estável entre renders e faz o `memo` de `LinhaProduto` valer.
     Sem isso, cada render do pai criaria funções novas, a comparação de props falharia em
     todas as linhas e as 990 re-renderizariam de novo. O updater funcional do
     `setSelecionados` é o que permite a lista de dependências vazia — ele lê o valor atual
     do próprio React, não do closure. */
  const alternar = useCallback((id: string) => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }, []);

  /** Marca ou desmarca TUDO O QUE ESTÁ VISÍVEL — o resultado do filtro atual, nada além. */
  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(idsVisiveis));
  }

  function limpar() {
    setSelecionados(new Set());
    setModoFiltro(false);
  }

  function mudarStatusEmLote(status: "published" | "draft") {
    const ids = marcados;
    setAcaoEmCurso(status);
    iniciarLote(async () => {
      const r = modoFiltro
        ? await setProductStatusPorFiltro(filtro, status)
        : await setProductStatusEmLote(ids, status);
      if ("error" in r) {
        // A seleção FICA: erro aqui é para tentar de novo, não para remarcar tudo na mão.
        toast.error(r.error);
        setAcaoEmCurso(null);
        return;
      }
      const n = r.afetados;
      toast.success(
        `${n} ${n === 1 ? "produto" : "produtos"} ${status === "published" ? "publicado" : "movido"}${
          n === 1 ? "" : "s"
        }${status === "published" ? "" : " para rascunho"}.`,
      );
      /*
        SINCRONIA — por que uma transição DENTRO da outra.

        `router.refresh()` solto depois de um `await` já saiu do escopo síncrono da
        transição: o React não tem como esperar por ele, o botão voltava ao normal e o selo
        só mudava segundos depois (medido: 1,7s contra 5,2s). Reabrindo a transição aqui,
        de forma síncrona, o React segura o "em andamento" até a lista nova estar pintada —
        e as mudanças de estado feitas aqui dentro (limpar a seleção, apagar o rótulo de
        espera) também só valem nesse momento.

        Resultado: o selo muda, o botão para de dizer "Rascunhando…" e a barra sai de cena
        no MESMO quadro. Nada de status adiantado afirmando o que o banco ainda não confirmou.
        E não é recarregar a página: é rebuscar os dados desta rota.
      */
      iniciarLote(() => {
        router.refresh();
        limpar();
        setAcaoEmCurso(null);
      });
    });
  }

  function confirmarExclusaoEmLote() {
    const ids = marcados;
    iniciarLote(async () => {
      const r = modoFiltro ? await deleteProductsPorFiltro(filtro) : await deleteProductsEmLote(ids);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        toast.success(`${r.afetados} ${r.afetados === 1 ? "produto excluído" : "produtos excluídos"}.`);
        // Mesma amarração da mudança de status: as linhas somem quando a lista nova chega.
        iniciarLote(() => {
          router.refresh();
          limpar();
        });
      }
      // Idem: manter `excluirLote` até a próxima abertura evita o título trocar de texto
      // no meio da saída.
      dialogRef.current?.close();
    });
  }

  const openDeleteDialog = useCallback((product: ProductListItem) => {
    setDeleteTarget(product);
    setExcluirLote(false);
    dialogRef.current?.showModal();
  }, []);

  function abrirExclusaoEmLote() {
    setExcluirLote(true);
    dialogRef.current?.showModal();
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const productId = deleteTarget.id;

    startDeleteTransition(async () => {
      const result = await deleteProduct(productId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Produto excluído.");
        router.refresh();
      }
      // O alvo NÃO é zerado aqui: o aviso ainda está desaparecendo e mostraria o título
      // quebrado. Quem abre define o alvo, então não sobra estado velho para atrapalhar.
      dialogRef.current?.close();
    });
  }

  return (
    <>
      {/* Guia de colunas + lista num ÚNICO wrapper: `page.tsx` renderiza
          `<ProductList>` dentro de um container `flex flex-col gap-6`, e
          como este componente retornava a guia e o `<ul>` como irmãos
          soltos dentro de um Fragment, o React "desembrulhava" os dois pro
          pai — o `gap-6` do pai caía TAMBÉM entre a guia e o `<ul>`,
          abrindo o vão que devia estar colado. Um `<div>` em volta dos
          dois vira o único filho direto do pai, e o `gap-6` passa a atuar
          só onde deveria (antes/depois deste bloco inteiro), nunca dentro
          dele.
          Dentro do wrapper: guia "colada" no topo do primeiro card (sem
          gap, cantos de baixo retos) — o `<li>` de índice 0 perde o
          arredondamento/borda de cima (abaixo) pra virar visualmente uma
          continuação desta guia, enquanto os demais cards mantêm o
          `gap-3` normal entre si. Mesma estrutura de larguras/gaps da
          linha de dado (thumb 64px / nome flex-1 / preço flex-1 centrado /
          status / ações) pra cada rótulo cair exatamente acima da sua
          coluna. */}
      <div>
        {/* Guia só existe a partir de `sm:` — abaixo disso os cards viram
            layout empilhado próprio (ver bloco `sm:hidden` em cada `<li>`),
            sem colunas fixas fazendo sentido nenhum numa tela de 375px. */}
        <div className="relative hidden items-center gap-3 rounded-t-[2rem] border border-b-0 border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/40 sm:flex">
          {/* O controle geral fica onde sempre esteve: centrado na COLUNA DA FOTO. Como as
              linhas ganharam a coluna do seletor antes da foto, o espaçador de 20px vem
              primeiro — sem ele, o controle ficaria sobre a borda esquerda da foto, e não
              no meio dela. Depois, "Produto" cai exatamente sobre o nome do produto. */}
          <div className="h-0 w-5 shrink-0" />
          <div className="flex w-16 shrink-0 justify-center">
            <Marca
              marcado={todosMarcados}
              parcial={parcial}
              onMudar={alternarTodos}
              rotulo={todosMarcados ? "Desmarcar todos os produtos" : "Selecionar todos os produtos"}
            />
          </div>
          <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300">Produto</span>
          <div className="flex flex-1 items-center">
            {/* Mesma técnica de `absolute left-1/2 -translate-x-1/2` do par
                de inputs preço/promocional na linha de dado — centralizado
                na largura TOTAL do card, não no meio deste `flex-1`.
                `style` inline (não classe `gap-*`) porque o dev server
                não estava gerando a regra CSS pra nenhum valor de `gap-*`
                testado neste bloco (cache do Tailwind travado só aqui,
                `gap-2`/`gap-3` de outros blocos da MESMA página seguiam
                funcionando) — "Preço" e "Promocional" liam como uma
                palavra só sem esse respiro (pedido explícito do usuário
                pra separar visualmente). */}
            {/* Espelha EXATAMENTE o par de pills da linha de dado: mesma
                largura por célula (`PRICE_CELL_WIDTH`), mesmo `gap-2` e
                mesma centralização absoluta. Cada rótulo fica centrado no
                seu próprio input, em qualquer largura de tela. */}
            <div className="absolute left-1/2 flex -translate-x-1/2 gap-2">
              <span className={`${PRICE_CELL_WIDTH} text-center text-xs font-semibold text-gray-700 dark:text-gray-300`}>
                Preço
              </span>
              <span className={`${PRICE_CELL_WIDTH} text-center text-xs font-semibold text-gray-700 dark:text-gray-300`}>
                Promocional
              </span>
            </div>
          </div>
          <span className="w-[72px] shrink-0 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Status</span>
          <span className="w-[132px] shrink-0 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Ações</span>
        </div>

        <ul className="flex flex-col gap-3">
        {products.map((product, index) => (
          <LinhaProduto
            key={product.id}
            product={product}
            index={index}
            selecionado={selecionados.has(product.id)}
            ocupado={emAndamento && selecionados.has(product.id)}
            storeSlug={storeSlug}
            storeName={storeName}
            onAlternar={alternar}
            onExcluir={openDeleteDialog}
          />
        ))}
        </ul>

        {/* Depois da lista e ANTES do espaço reservado da barra: sem isso a barra de ações
            cobriria justamente os números, e trocar de página com algo marcado viraria uma
            caçada ao controle escondido. */}
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} />

        {/* Espaço reservado embaixo do último card ENQUANTO a barra está no ar: ela é
            `fixed`, então sai do fluxo e cobriria o último produto justamente quando o
            lojista está marcando o fim da lista.
            Sempre no DOM, só alternando `.on`: montar e desmontar fazia a lista saltar
            96px de uma vez. A classe anima a altura no mesmo ritmo da barra. */}
        <div aria-hidden className={`vt-lote-espaco ${temSelecao ? "on" : ""}`} />
      </div>

      {/*
        BARRA DE AÇÕES — só existe com algo selecionado, e some quando a seleção esvazia.

        Mesma barra da grade do acervo, inclusive o `md:left-sidebar` que a impede de passar
        por baixo da sidebar (o token vale a largura real dela, ver globals.css). Fica fixa embaixo porque a lista é longa: uma barra no topo sairia
        da tela justamente quando o lojista está marcando o que está no fim dela.

        Fundo OPACO, sem `backdrop-blur`: cortar o card que está atrás é inevitável numa
        barra fixa, mas com fundo translúcido esse card APARECIA através dela (contorno
        arredondado e campos de preço borrados dentro da barra) — lia como falha de
        renderização. Sem transparência o blur não teria o que borrar, então saiu junto.
      */}
      <div
        className={`vt-lote ${temSelecao ? "on" : ""} fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-4 py-3 sm:py-4 md:left-sidebar dark:border-gray-800 dark:bg-gray-900`}
      >
        {/* No celular os dois grupos não cabem lado a lado e quebram em duas linhas —
            com `justify-between` cada linha ficava encostada na esquerda, com um vazio
            grande à direita. Centrado, o conteúdo fica no eixo do polegar. A partir de
            `sm:` eles voltam a caber na mesma linha, e aí é `space-between` de novo. */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3 sm:justify-between 2xl:max-w-[96rem]">
          <div className="vt-lote-item flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              {rotulo.n} {rotulo.n === 1 ? "selecionado" : "selecionados"}
            </span>
            {/* No celular a guia de colunas não existe, então é aqui que mora o
                "selecionar todos" — sem ele, marcar 990 seria impossível fora do desktop. */}
            {!rotulo.todos && (
              <button
                type="button"
                onClick={alternarTodos}
                className="rounded-full px-1 text-sm font-medium text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:text-blue-400"
              >
                Selecionar todos ({rotulo.total})
              </button>
            )}
            {/* Só aparece com a página inteira marcada: é o passo que alcança o que está
                nas outras páginas sem precisar visitá-las uma a uma. */}
            {rotulo.estender && (
              <button
                type="button"
                onClick={() => setModoFiltro(true)}
                className="rounded-full px-1 text-sm font-medium text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:text-blue-400"
              >
                Selecionar todos ({rotulo.totalFiltro})
              </button>
            )}
            <button
              type="button"
              onClick={limpar}
              className="rounded-full px-1 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:text-gray-400 dark:hover:text-gray-50"
            >
              Limpar
            </button>
          </div>

          {/* `disabled` durante a ação nos três: é o que impede clique repetido e ação
              conflitante (publicar e apagar ao mesmo tempo). */}
          <div className="vt-lote-item flex flex-wrap items-center gap-2">
            {rotulo.publicar && (
              <button
                type="button"
                disabled={emAndamento}
                onClick={() => mudarStatusEmLote("published")}
                className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {acaoEmCurso === "published" ? "Publicando…" : "Publicar"}
              </button>
            )}
            {rotulo.rascunhar && (
              <button
                type="button"
                disabled={emAndamento}
                onClick={() => mudarStatusEmLote("draft")}
                className="min-h-10 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {acaoEmCurso === "draft" ? "Rascunhando…" : "Rascunhar"}
              </button>
            )}
            <button
              type="button"
              disabled={emAndamento}
              onClick={abrirExclusaoEmLote}
              className="min-h-10 rounded-full border border-error-solid/40 px-4 text-sm font-medium text-error-fg transition-colors duration-150 hover:bg-error-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 disabled:opacity-60 dark:hover:bg-error-solid/15"
            >
              Apagar
            </button>
          </div>
        </div>
      </div>

      {/* `m-auto`: o navegador centraliza um <dialog> modal via `margin: auto`
          do user-agent stylesheet, e o preflight do Tailwind zera `margin` em
          todos os elementos — sem isso o diálogo encosta no canto superior
          esquerdo da tela.
          `dialog-modal` (globals.css) anima entrada e saída do diálogo e do
          fundo escurecido. */}
      <dialog ref={dialogRef} className="dialog-modal m-auto rounded-[2rem] bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50">
        {/* UM diálogo para os dois casos. O texto muda; o aviso sobre métricas e o padrão de
            confirmação são os mesmos, porque a consequência é a mesma. */}
        <div>
          <h2 className="text-center font-display text-xl font-medium text-gray-900 dark:text-gray-50">
            {excluirLote
              ? `Excluir ${quantidadeAlvo} ${quantidadeAlvo === 1 ? "produto" : "produtos"}?`
              : `Excluir ${deleteTarget?.name}?`}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
            {excluirLote
              ? quantidadeAlvo === 1
                ? "Isso vai remover o produto selecionado e todas as fotos dele da sua vitrine. Essa ação não pode ser desfeita."
                : `Isso vai remover os ${quantidadeAlvo} produtos selecionados e todas as fotos deles da sua vitrine. Essa ação não pode ser desfeita.`
              : "Isso vai remover o produto e todas as fotos da sua vitrine. Essa ação não pode ser desfeita."}
          </p>
          <form method="dialog" className="mt-4 flex justify-center gap-3">
            {/* Sem `onClick`: o `<form method="dialog">` já fecha o aviso. Zerar o alvo aqui
                era o que fazia o título virar "Excluir undefined?" — o aviso continua
                visível por ~150ms depois do clique (a saída é animada por CSS), então
                apagar o que ele está mostrando aparece na tela. */}
            <button
              type="submit"
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting || emAndamento}
              onClick={excluirLote ? confirmarExclusaoEmLote : handleConfirmDelete}
              className="rounded-full bg-error-solid px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-error-solid-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {isDeleting || emAndamento ? "Excluindo…" : "Sim, excluir"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
