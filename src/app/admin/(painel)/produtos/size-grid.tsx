"use client";

import { forwardRef, useTransition, type CSSProperties } from "react";
import { useFieldArray, type Control } from "react-hook-form";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";
import { SIZE_GRID } from "@/lib/products/constants";
import { markProductEsgotado } from "@/lib/products/actions";
import type { ProductInput } from "@/lib/validation/product";

/**
 * Composição condicional de className (clsx + tailwind-merge, instaladas
 * neste plano — 03-RESEARCH.md §Standard Stack). Primeiro componente do
 * projeto com estados visuais suficientes (não-incluído/esgotado/disponível)
 * para justificar isso em vez de concatenação manual de strings.
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type SizeGridProps = {
  control: Control<ProductInput>;
  /**
   * Presente apenas em modo edição (produto já salvo, Plan 03-05). Em modo
   * criação (undefined), "Marcar tudo como esgotado" só mexe no form state;
   * em edição, chama a Server Action `markProductEsgotado` antes de refletir
   * no form state, com toast.
   */
  productId?: string;
  /** Classe extra passada ao div raiz. */
  className?: string;
  /**
   * `minHeight` (px) para esticar a base do card para baixo até coincidir com
   * a base de outro card em outra coluna — ver o `ResizeObserver` em
   * `product-form.tsx` que calcula esse valor a partir da posição real do
   * card "Preço". O card nunca encolhe abaixo do próprio conteúdo, só cresce.
   */
  style?: CSSProperties;
};

/**
 * Grade de tamanhos 36-45 (D-01/D-02/D-03/D-04) integrada ao
 * react-hook-form via `useFieldArray` (name "sizes"). Um tamanho
 * não-incluído simplesmente não existe no array `fields` — nunca é
 * representado como `{ size, available: false, included: false }` — ver
 * 03-RESEARCH.md §Grade de tamanhos e 03-UI-SPEC.md §Size grid.
 *
 * Estados sempre via métodos do próprio `useFieldArray`
 * (append/update/remove/replace) — nunca um array paralelo (Pitfall 5 do
 * 03-RESEARCH.md).
 *
 * O toque na pílula ALTERNA disponível <-> esgotado. Antes isso era um ciclo
 * circular de 3 estados no mesmo botão (não-incluído -> esgotado ->
 * disponível -> não-incluído), o que tornava impossível que "marcar
 * esgotado" e "repor" custassem 1 toque cada: um dos dois sempre caía no
 * "remover" antes. Verificado ao vivo — um toque num tamanho disponível
 * fazia ele SUMIR da grade em vez de virar esgotado, que é a ação mais
 * comum do dia a dia.
 *
 * Consequência aceita (decisão do usuário: nenhum "×" sobre as pílulas):
 * depois de adicionado, um tamanho não sai mais da grade — ele só alterna
 * entre disponível e esgotado. "Esgotado" já cobre o caso "não tenho", e a
 * visibilidade na vitrine é resolvida por `hide_when_sold_out`.
 */
export const SizeGrid = forwardRef<HTMLDivElement, SizeGridProps>(function SizeGrid(
  { control, productId, className, style },
  ref
) {
  const { fields, append, update, replace } = useFieldArray({
    control,
    name: "sizes",
  });
  const [isPending, startTransition] = useTransition();

  function findIndexBySize(size: number): number {
    return fields.findIndex((field) => field.size === size);
  }

  function handleTogglePill(size: number) {
    const index = findIndexBySize(size);

    if (index === -1) {
      // Adicionar um tamanho é um gesto explícito: quem toca num tamanho que
      // não está na grade está dizendo "eu tenho esse". Nasce disponível.
      append({ size, available: true });
      return;
    }

    // Incluído: alterna disponível <-> esgotado. Sempre 1 toque, nos dois
    // sentidos — nunca remove.
    update(index, { size, available: !fields[index].available });
  }


  function handleMarkAllEsgotado() {
    const allEsgotado = fields.map((field) => ({ size: field.size, available: false }));

    if (productId) {
      startTransition(async () => {
        const result = await markProductEsgotado(productId);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        replace(allEsgotado);
        toast.success("Todos os tamanhos marcados como esgotado.");
      });
      return;
    }

    replace(allEsgotado);
  }

  return (
    <div
      ref={ref}
      style={style}
      className={`flex flex-col justify-center gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Tamanhos</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Toque para alternar entre disponível e esgotado.
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAllEsgotado}
          disabled={isPending}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isPending ? "Marcando…" : "Marcar tudo como esgotado"}
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {SIZE_GRID.map((size) => {
          const index = findIndexBySize(size);
          const field = index === -1 ? undefined : fields[index];
          const included = field !== undefined;
          const available = field?.available ?? false;

          return (
              <button
                key={size}
                type="button"
                onClick={() => handleTogglePill(size)}
                aria-pressed={included && available}
                aria-label={
                  !included
                    ? `Adicionar tamanho ${size}`
                    : available
                      ? `Tamanho ${size} disponível. Marcar como esgotado`
                      : `Tamanho ${size} esgotado. Marcar como disponível`
                }
                className={cn(
                  "flex min-h-11 w-full min-w-11 items-center justify-center rounded-lg border text-base transition-colors duration-150",
                  // Não-incluído: ausência de informação — tracejado e apagado.
                  !included &&
                    "border-dashed border-gray-300 bg-white text-gray-400 hover:border-primary hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500 dark:hover:text-gray-50",
                  // Esgotado: informação REAL, precisa ser legível. Antes era
                  // text-gray-400 sobre bg-gray-100 (~2:1) — menos legível que
                  // o estado não-incluído, o que estava invertido.
                  included &&
                    !available &&
                    "border-gray-400 bg-gray-100 text-gray-700 line-through dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300",
                  included && available && "border-primary bg-primary text-white"
                )}
              >
                {size}
              </button>
          );
        })}
      </div>
    </div>
  );
});
