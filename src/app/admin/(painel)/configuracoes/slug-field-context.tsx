"use client";

import { createContext, useContext } from "react";
import type { SlugAvailabilityStatus, SlugFieldState } from "@/lib/slug/use-slug-field";

/**
 * Contexto do estado do campo "@" — reexporta os tipos de
 * `@/lib/slug/use-slug-field` (fonte única da verdade do shape) para quem
 * já importa daqui (`SlugEditor`).
 *
 * Existe porque, em Configurações, `SettingsForm` (que possui e salva o
 * estado) e `SlugEditor` (que o exibe) vivem em COLUNAS diferentes da
 * grade — o campo fica no card "Link e QR code da vitrine", à direita, e o
 * botão que o salva é o "Salvar alterações", à esquerda. No onboarding, o
 * mesmo contrato é usado com um `SlugFieldProvider` local no wizard.
 */
export type { SlugAvailabilityStatus, SlugFieldState };

const SlugFieldContext = createContext<SlugFieldState | null>(null);

export const SlugFieldProvider = SlugFieldContext.Provider;

export function useSlugField(): SlugFieldState {
  const context = useContext(SlugFieldContext);
  if (!context) {
    throw new Error("useSlugField (contexto) precisa ser usado dentro de um <SlugFieldProvider>.");
  }
  return context;
}
