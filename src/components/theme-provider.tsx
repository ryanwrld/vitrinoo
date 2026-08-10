"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Escopo do dark mode: só o painel admin (dashboard/produtos/configurações)
 * — a vitrine pública mantém paleta de marca fixa por design. O provider
 * fica montado na raiz (padrão next-themes, evita FOUC via script bloqueante
 * no <head>), mas a classe "dark" só tem efeito visual dentro de
 * `.admin-scope` (ver @custom-variant em globals.css) — nenhuma página
 * pública referencia essa classe, então o toggle nunca vaza pra lá mesmo
 * que o usuário abra a vitrine na mesma sessão com o tema escuro ativo.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    // `enableColorScheme={false}` é o que impede o tema do painel de vazar
    // para a vitrine pública.
    //
    // Ligado (padrão da biblioteca), o next-themes escreve
    // `style="color-scheme: dark"` DIRETO no `<html>` — fora de qualquer
    // escopo, e com prioridade de estilo inline, ou seja, por cima do
    // `:root { color-scheme: light }` do globals.css. `color-scheme` é o que
    // decide a cor dos elementos pintados pelo NAVEGADOR, e a barra de
    // rolagem da janela é um deles: quem escolhia o modo escuro no painel
    // continuava vendo barra escura na vitrine, que é clara por design.
    //
    // A classe `dark` continua sendo aplicada normalmente — ela é escopada ao
    // `.admin-scope` (ver @custom-variant em globals.css) e nunca vazou. Quem
    // passa a declarar `color-scheme` é o CSS, também escopado ao painel.
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme={false}>
      {children}
    </NextThemesProvider>
  );
}
