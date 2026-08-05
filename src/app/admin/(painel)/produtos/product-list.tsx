"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff, Pencil, Trash2 } from "lucide-react";
import { formatBRLPrice } from "@/lib/currency/brl";
import { deleteProduct } from "@/lib/products/actions";

export type ProductListItem = {
  id: string;
  name: string;
  brand: string;
  brand_other: string | null;
  line: string | null;
  price: number;
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
};

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
export function ProductList({ products }: ProductListProps) {
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
      <ul className="flex flex-col gap-3">
        {products.map((product) => {
          const brandLabel = product.brand === "Outra" && product.brand_other ? product.brand_other : product.brand;
          const secondaryLine = [brandLabel, product.line].filter(Boolean).join(" · ");

          return (
            <li
              key={product.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
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

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-display font-medium text-gray-900 dark:text-gray-50">{product.name}</span>
                {secondaryLine && <span className="truncate text-xs text-gray-500 dark:text-gray-400">{secondaryLine}</span>}
                <span
                  className={`flex items-center gap-1 text-xs transition-colors duration-150 ${
                    product.disponivel ? "text-success-fg" : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${product.disponivel ? "bg-success-solid" : "bg-gray-400"}`}
                    aria-hidden="true"
                  />
                  {product.disponivel ? "Disponível" : "Esgotado"}
                </span>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{formatBRLPrice(product.price)}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    product.status === "published" ? "bg-success-bg text-success-fg dark:bg-success-solid/15" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {product.status === "published" ? "Publicado" : "Rascunho"}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/admin/produtos/${product.id}/editar`}
                  aria-label={`Editar ${product.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
                >
                  <Pencil className="h-5 w-5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => openDeleteDialog(product)}
                  aria-label={`Excluir ${product.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-error-solid transition-colors duration-150 hover:bg-error-bg dark:hover:bg-error-solid/15"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* `m-auto`: o navegador centraliza um <dialog> modal via `margin: auto`
          do user-agent stylesheet, e o preflight do Tailwind zera `margin` em
          todos os elementos — sem isso o diálogo encosta no canto superior
          esquerdo da tela.
          `dialog-modal` (globals.css) anima entrada e saída do diálogo e do
          fundo escurecido. */}
      <dialog ref={dialogRef} className="dialog-modal m-auto rounded-lg bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50">
        <div>
          <h2 className="font-display text-xl font-medium text-gray-900 dark:text-gray-50">Excluir {deleteTarget?.name}?</h2>
          <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Isso vai remover o produto e todas as fotos da sua vitrine. Essa ação não pode ser desfeita.
          </p>
          <form method="dialog" className="mt-4 flex gap-3">
            <button
              type="submit"
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="rounded-md bg-error-solid px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-error-solid-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {isDeleting ? "Excluindo…" : "Sim, excluir"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
