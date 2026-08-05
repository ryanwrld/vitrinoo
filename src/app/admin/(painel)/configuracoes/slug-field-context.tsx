"use client";

import { createContext, useContext } from "react";

/**
 * Estado do campo "Slug", compartilhado entre `SettingsForm` (que o possui e
 * o salva) e `SlugEditor` (que o exibe).
 *
 * Existe porque os dois vivem em COLUNAS diferentes da grade: o campo fica no
 * card "Link e QR code da vitrine", à direita, e o botão que o salva é o
 * "Salvar alterações", à esquerda. O slug deixou de ter botão próprio — a
 * troca dele agora faz parte do mesmo save de nome/logo/WhatsApp.
 *
 * O `SlugEditor` é renderizado dentro da árvore React do `SettingsForm`
 * (passado pela prop `aside`), então o contexto atravessa normalmente mesmo
 * com os dois em posições distantes no layout.
 */
export type SlugAvailabilityStatus = "idle" | "checking" | "available" | "taken";

export type SlugFieldState = {
  /** Valor cru digitado — o exibido no input. */
  rawSlug: string;
  setRawSlug: (value: string) => void;
  /** `rawSlug` já normalizado (sem acento, minúsculo, espaços viram hífen). */
  slug: string;
  /** Mensagem de formato inválido, síncrona. `null` quando o formato está ok. */
  formatError: string | null;
  status: SlugAvailabilityStatus;
};

const SlugFieldContext = createContext<SlugFieldState | null>(null);

export const SlugFieldProvider = SlugFieldContext.Provider;

export function useSlugField(): SlugFieldState {
  const context = useContext(SlugFieldContext);
  if (!context) {
    throw new Error("useSlugField precisa ser usado dentro do <SettingsForm>.");
  }
  return context;
}
