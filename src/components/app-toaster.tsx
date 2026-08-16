"use client";

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

/**
 * Wrapper client do `<Toaster>` — necessário porque o dark mode deste
 * projeto só tem efeito dentro de `.admin-scope` (ver `@custom-variant dark`
 * em globals.css, só presente em `(painel)/layout.tsx`). O sonner monta seu
 * portal fora dessa árvore (direto no `<body>`, via `layout.tsx` raiz), então
 * qualquer classe `dark:` nas cores do toast fica inerte — precisa decidir a
 * cor em JS (tema resolvido + rota atual), não via variante CSS.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  // Mesmo escopo do dark mode real: só as rotas do painel (dashboard/
  // produtos/configurações, dentro de `(painel)`) — login/cadastro/
  // onboarding e a vitrine pública ficam sempre no visual claro.
  const isPainelRoute = pathname.startsWith("/admin/dashboard") || pathname.startsWith("/admin/produtos") || pathname.startsWith("/admin/configuracoes");
  const isDark = isPainelRoute && resolvedTheme === "dark";

  return (
    <Toaster
      position="top-center"
      toastOptions={{
        classNames: {
          // `!w-max` + `!max-w-[90vw]`: sonner fixa a largura de todo toast
          // em `--width` (356px, inclusive no mobile — a media query própria
          // dele só troca esse valor por `calc(100% - offsets)`, mas nenhuma
          // das duas é `!important`, então `!w-max` vence as duas). O card
          // passa a caber no conteúdo em vez de quebrar linha; `max-w-[90vw]`
          // é só uma rede de segurança pra uma mensagem absurdamente longa
          // não vazar da tela numa viewport bem estreita.
          toast:
            "notification-glow-border !w-max !max-w-[90vw] !rounded-3xl !border-0 !bg-transparent !shadow-[0_25px_50px_-12px_rgba(3,8,33,0.16),0_0_0_1px_rgba(3,8,33,0.06)] backdrop-blur-xl backdrop-saturate-75" +
            (isDark ? " !shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)]" : ""),
          title: (isDark ? "!text-gray-50" : "!text-gray-900") + " !whitespace-nowrap",
          description: (isDark ? "!text-gray-400" : "!text-gray-600") + " !whitespace-nowrap",
          // Cor do ícone por tipo (verde/vermelho/âmbar/azul vívidos, iguais
          // aos badges do resto do app) vem de CSS puro em globals.css — ver
          // comentário lá. Sem `richColors`, o sonner deixaria o ícone na cor
          // neutra (`--normal-text`), sem sinalização nenhuma.
        },
      }}
    />
  );
}
