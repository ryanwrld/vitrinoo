"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const noopSubscribe = () => () => {};

/**
 * Mesmo truque de `configuracoes/theme-toggle.tsx` (useSyncExternalStore em
 * vez de setState num efeito) — servidor não conhece a preferência salva,
 * então o snapshot do servidor é `false` até a hidratação confirmar.
 */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * Atalho de tema no header do Dashboard — binário (Claro/Escuro), sem a
 * opção "Automático" do seletor de 3 estados em `/admin/configuracoes` (ali
 * continua existindo pra quem quer seguir o SO; aqui é só um toggle rápido
 * lua/sol). Usa `resolvedTheme` (não `theme`) pra decidir o ícone/próximo
 * estado a partir da aparência REAL da tela no momento, mesmo se a
 * preferência salva for "system".
 */
export function ThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted && resolvedTheme === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-150 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * Mesmo toggle, formato de linha de menu — pro dropdown de conta (abaixo de
 * "Sair da conta"), onde o padrão visual é ícone + rótulo full-width, não um
 * círculo isolado. Mesmo hook/lógica do `ThemeToggleButton` acima, só troca
 * o wrapper visual.
 */
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted && resolvedTheme === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {isDark ? "Tema claro" : "Tema escuro"}
    </button>
  );
}
