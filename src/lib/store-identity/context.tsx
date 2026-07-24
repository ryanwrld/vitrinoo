"use client";

import { createContext, useContext, type ReactNode } from "react";

type StoreIdentity = {
  storeName: string | null;
  storeLogoUrl: string | null;
};

const StoreIdentityContext = createContext<StoreIdentity>({ storeName: null, storeLogoUrl: null });

/**
 * Expõe name/logo_url da loja (buscados uma única vez no layout do painel,
 * src/app/(admin)/(painel)/layout.tsx) pra qualquer página filha via
 * `useStoreIdentity()` — sem isso, cada página que precisa renderizar
 * `HeaderActions` (bell + avatar, agora dentro da própria linha do h1 de
 * cada página, não mais num `<header>` compartilhado) teria que repetir a
 * query de `stores` sozinha.
 */
export function StoreIdentityProvider({
  storeName,
  storeLogoUrl,
  children,
}: StoreIdentity & { children: ReactNode }) {
  return (
    <StoreIdentityContext.Provider value={{ storeName, storeLogoUrl }}>{children}</StoreIdentityContext.Provider>
  );
}

export function useStoreIdentity(): StoreIdentity {
  return useContext(StoreIdentityContext);
}
