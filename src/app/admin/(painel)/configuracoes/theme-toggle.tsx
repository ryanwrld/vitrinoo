"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "dark", label: "Escuro", Icon: Moon },
] as const;

const noopSubscribe = () => () => {};

/**
 * Detecta se já passou da hidratação sem `setState` dentro de efeito (regra
 * react-hooks/set-state-in-effect deste projeto, mesma disciplina de
 * slug-editor.tsx/qr-code-panel.tsx) — snapshot do servidor é `false`,
 * snapshot do cliente é `true`, sem precisar de um efeito só pra isso.
 */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * Seletor de tema (Claro/Auto/Escuro) do painel admin. `useTheme()` só
 * reflete o valor real depois do mount (o servidor não sabe a preferência
 * salva) — até lá, renderiza os 3 botões sem nenhum marcado como ativo em
 * vez de arriscar destacar "Claro" errado por um instante (mesmo padrão de
 * skeleton-antes-de-hydration recomendado pela doc do next-themes).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();

  return (
    <div className="flex w-full rounded-lg border border-gray-200/60 bg-gray-100/80 p-1 shadow-sm sm:w-auto dark:border-gray-800 dark:bg-gray-800/60">
      {OPTIONS.map(({ value, label, Icon }) => {
        const isActive = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={isActive}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 sm:flex-none",
              isActive
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-50"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
