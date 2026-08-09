"use client";

import { X } from "lucide-react";

export type ActiveFilterChip = {
  /** Categoria na URL: "brand" | "sole" | "fulfillment" | "q". */
  category: string;
  value: string;
  label: string;
};

/**
 * Resumo dos filtros ativos, logo abaixo da barra de controles. Com os
 * filtros agora escondidos dentro de dropdowns, esta linha é o ÚNICO lugar
 * onde o cliente vê, de relance, o que está limitando o resultado — sem
 * ela, um filtro esquecido vira "a loja não tem nada" silencioso, que é
 * exatamente o modo de falha que derruba venda.
 *
 * Cada chip remove só a si mesmo; "Limpar filtros" zera tudo (inclusive a
 * busca por texto, que também aparece aqui como chip).
 */
export function ActiveFilters({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: ActiveFilterChip[];
  onRemove: (category: string, value: string) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={`${chip.category}:${chip.value}`}
          type="button"
          onClick={() => onRemove(chip.category, chip.value)}
          aria-label={`Remover filtro ${chip.label}`}
          className="animate-scale-in flex min-h-8 items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          {chip.label}
          <X className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
        </button>
      ))}

      {/* Só aparece com 2+ filtros: com um único chip, o próprio X dele já
          é o gesto de limpar — dois controles para a mesma ação é ruído. */}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-8 rounded-full px-2 text-sm font-medium text-gray-500 underline-offset-2 transition-colors duration-150 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
