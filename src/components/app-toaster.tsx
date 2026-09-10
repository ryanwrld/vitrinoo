"use client";

import { Toaster } from "sonner";

/**
 * Wrapper client do `<Toaster>`. Cuida só de LAYOUT — cor nenhuma se decide aqui.
 *
 * Uma versão anterior escolhia a cor do texto em JavaScript, comparando a rota
 * atual contra uma lista de caminhos do painel. O Marketplace nasceu depois e
 * nunca entrou nessa lista: lá o componente concluía "não é painel", assumia
 * visual claro e pintava o título de escuro sobre uma página escura, com o card
 * em `bg-transparent`. O texto sumia — e qualquer rota criada no futuro herdaria
 * o mesmo bug.
 *
 * Agora as cores vivem em `globals.css`, decididas por `.dark:has(.admin-scope)`
 * — a condição real do tema, não uma lista que envelhece. Ver o bloco
 * `[data-sonner-toast]` lá, ao lado das cores de ícone que já moravam ali.
 *
 * O motivo de a cor não ser Tailwind continua valendo: o sonner portaliza o toast
 * direto no `<body>`, fora de `.admin-scope`, então as variantes `dark:` deste
 * projeto — que exigem esse ancestral — ficam inertes no toast.
 */
export function AppToaster() {
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
          //
          // `left-0 right-0 mx-auto` (sem `!`): sem isso o toast ficava
          // visualmente fora do centro. O `<li>` do sonner é
          // `position: absolute` sem `left` próprio — ele só "parece"
          // centralizado porque, por padrão, tem `width: var(--width)`
          // (356px) IGUAL ao `<ol>` pai já centralizado, preenchendo-o por
          // inteiro. Ao encolher a largura com `!w-max`, o `<li>` passou a
          // ocupar só ~155px colado na borda ESQUERDA desses 356px —
          // sobrando ~200px de vão vazio à direita, um desalinhamento de
          // ~100px em relação ao centro real da tela.
          // `left:0` + `right:0` + `margin-inline:auto` centraliza um
          // elemento absoluto de largura desconhecida dentro do pai, sem
          // tocar `transform` (que o sonner usa, via JS, para a animação de
          // entrada/saída e para empilhar toasts simultâneos verticalmente —
          // sobrescrever `transform` aqui quebraria isso). SEM `!`: o sonner
          // não define `left`/`right`/margem nenhuma para a posição
          // "center" (só para os gatilhos `left`/`right`), então não há
          // nada pra vencer — `!important` aqui seria só ruído.
          toast:
            "notification-glow-border !w-max !max-w-[90vw] left-0 right-0 mx-auto !rounded-3xl !border-0 !bg-transparent !shadow-[0_25px_50px_-12px_rgba(3,8,33,0.16),0_0_0_1px_rgba(3,8,33,0.06)] backdrop-blur-xl backdrop-saturate-75",
          title: "!whitespace-nowrap",
          description: "!whitespace-nowrap",
        },
      }}
    />
  );
}
