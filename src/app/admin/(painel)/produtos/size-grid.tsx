"use client";

import { useTransition } from "react";
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
};

/**
 * Grade de tamanhos 36-45 (D-01/D-02/D-03/D-04) integrada ao
 * react-hook-form via `useFieldArray` (name "sizes"). Um tamanho
 * não-incluído simplesmente não existe no array `fields` — nunca é
 * representado como `{ size, available: false, included: false }` — ver
 * 03-RESEARCH.md §Grade de tamanhos e 03-UI-SPEC.md §Size grid.
 *
 * Ciclo de 3 estados por toque, sempre via métodos do próprio
 * `useFieldArray` (append/update/remove/replace) — nunca um array paralelo
 * (Pitfall 5 do 03-RESEARCH.md):
 *   não-incluído -> incluído/esgotado -> incluído/disponível -> não-incluído
 */
export function SizeGrid({ control, productId }: SizeGridProps) {
  const { fields, append, update, remove, replace } = useFieldArray({
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
      // não-incluído -> incluído/esgotado (D-03: tamanho novo SEMPRE nasce esgotado)
      append({ size, available: false });
      return;
    }

    const field = fields[index];
    if (!field.available) {
      // incluído/esgotado -> incluído/disponível
      update(index, { size, available: true });
      return;
    }

    // incluído/disponível -> não-incluído (remove do array)
    remove(index);
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
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Tamanhos</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Toque em um tamanho para adicioná-lo. Toque de novo para marcar disponível.
      </p>

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
              aria-pressed={included}
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-base transition-colors duration-150",
                !included && "border-gray-300 bg-white text-gray-900 hover:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50",
                included && !available && "border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-gray-800 dark:bg-gray-800 dark:text-gray-600",
                included && available && "border-primary bg-primary text-white"
              )}
            >
              {size}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleMarkAllEsgotado}
        disabled={isPending}
        className="w-fit rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? "Marcando…" : "Marcar tudo como esgotado"}
      </button>
    </div>
  );
}
