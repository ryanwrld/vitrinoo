"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { formatBRLPriceInput, parseBRLPrice } from "@/lib/currency/brl";
import { deleteProduct, updateProductPrice, updateProductPromotionalPrice } from "@/lib/products/actions";
import { buildProductUrl } from "@/lib/slug/store-url";
import { ShareVitrineButton } from "@/components/share-vitrine-button";

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
};

/**
 * Edição rápida do preço direto na linha, sem abrir o formulário completo —
 * espelha o padrão do `slug-editor.tsx` (Fase 2): estado local otimista,
 * commit só no blur/Enter, revert pro valor salvo em caso de erro/parse
 * inválido (`parseBRLPrice` retorna `null`). `updateProductPrice` é a
 * Server Action dedicada (só a coluna `price`) — nunca `updateProduct`, que
 * exigiria o FormData inteiro do formulário (tamanhos incluídos).
 */
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
    <div className="flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-800/60 dark:focus-within:ring-blue-400/20">
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
      className={`flex h-9 items-center gap-1 rounded-full border bg-gray-50 px-3 transition-colors duration-150 focus-within:ring-2 dark:bg-gray-800/60 ${
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
export function ProductList({ products, storeSlug, storeName }: ProductListProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  function openDeleteDialog(product: ProductListItem) {
    setDeleteTarget(product);
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
      dialogRef.current?.close();
      setDeleteTarget(null);
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
          <div className="h-0 w-16 shrink-0" aria-hidden="true" />
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
            <div className="absolute left-1/2 flex -translate-x-1/2" style={{ gap: "2.5rem" }}>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Preço</span>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Promocional</span>
            </div>
          </div>
          <span className="w-[72px] shrink-0 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Status</span>
          <span className="w-[132px] shrink-0 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">Ações</span>
        </div>

        <ul className="flex flex-col gap-3">
        {products.map((product, index) => {
          const brandLabel = product.brand === "Outra" && product.brand_other ? product.brand_other : product.brand;
          const secondaryLine = [brandLabel, product.line].filter(Boolean).join(" · ");

          return (
            <li
              key={product.id}
              className={`relative flex flex-wrap items-center gap-3 border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
                index === 0 ? "rounded-[2rem] sm:rounded-b-[2rem] sm:rounded-t-none sm:border-t-0" : "rounded-[2rem]"
              }`}
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
                    nada visível. */}
                <ProductMobileActionsMenu
                  product={product}
                  storeSlug={storeSlug}
                  storeName={storeName}
                  onDelete={openDeleteDialog}
                />
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
                  onClick={() => openDeleteDialog(product)}
                  aria-label={`Excluir ${product.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-50"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
        </ul>
      </div>

      {/* `m-auto`: o navegador centraliza um <dialog> modal via `margin: auto`
          do user-agent stylesheet, e o preflight do Tailwind zera `margin` em
          todos os elementos — sem isso o diálogo encosta no canto superior
          esquerdo da tela.
          `dialog-modal` (globals.css) anima entrada e saída do diálogo e do
          fundo escurecido. */}
      <dialog ref={dialogRef} className="dialog-modal m-auto rounded-[2rem] bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50">
        <div>
          <h2 className="font-display text-xl font-medium text-gray-900 dark:text-gray-50">Excluir {deleteTarget?.name}?</h2>
          <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Isso vai remover o produto e todas as fotos da sua vitrine. Essa ação não pode ser desfeita.
          </p>
          {/* Tranquiliza sem prometer demais: desde a migration 0021 o
              histórico de cliques/visualizações deste produto SOBREVIVE à
              exclusão (ON DELETE SET NULL) e continua contando nos números
              agregados da loja — só o vínculo com este produto específico
              some. Isso é o que faz "Tamanhos mais pedidos" continuar
              confiável mesmo depois de limpar o catálogo. Um revendedor sem
              essa garantia hesita antes de excluir produtos antigos (medo de
              "perder os dados"), o que é fricção desnecessária — dizer isso
              de forma explícita reduz essa hesitação. */}
          <p className="mt-2 max-w-sm text-xs text-gray-400 dark:text-gray-500">
            As visualizações e os cliques já registrados continuam contando nas suas métricas gerais (ex.: tamanhos mais
            pedidos) — só deixam de aparecer vinculados a este produto.
          </p>
          <form method="dialog" className="mt-4 flex gap-3">
            <button
              type="submit"
              onClick={() => setDeleteTarget(null)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="rounded-full bg-error-solid px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-error-solid-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {isDeleting ? "Excluindo…" : "Sim, excluir"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
