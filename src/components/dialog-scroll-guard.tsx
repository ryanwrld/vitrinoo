"use client";

import { useEffect } from "react";
import { lockScroll } from "@/lib/ui/scroll-lock";

/**
 * Compensa a barra de rolagem para os diálogos NATIVOS (`<dialog>` aberto com
 * `showModal()`): confirmação de excluir produto, troca de slug, prévia da
 * vitrine, editor de capa, trocar senha, encerrar sessões, excluir conta e a
 * gaveta lateral do painel no celular.
 *
 * Nesses casos quem bloqueia a rolagem é o próprio navegador — mas ele também
 * REMOVE a barra da janela, e é isso que provoca o salto de ~15px no layout.
 * A trava do projeto preserva a barra (ver src/lib/ui/scroll-lock.ts), então
 * aplicá-la aqui resolve o salto; o bloqueio duplicado é inofensivo.
 *
 * POR QUE UM OBSERVADOR GLOBAL E NÃO UMA CHAMADA EM CADA DIÁLOGO
 *
 * Um `<dialog>` fecha por vários caminhos que não passam pelo nosso código:
 * tecla Escape, clique no backdrop, `<form method="dialog">`, além dos
 * `.close()` espalhados. Amarrar a compensação a cada `showModal()`/`close()`
 * deixaria buracos justamente nos caminhos que não controlamos — e uma
 * compensação que não é desfeita gruda 15px de padding no site inteiro.
 * Observar o atributo `open` cobre todos os caminhos por construção, e vale
 * também para qualquer diálogo que venha a ser criado depois.
 */
export function DialogScrollGuard() {
  useEffect(() => {
    let release: (() => void) | null = null;

    function sync() {
      // `:modal` distingue `showModal()` de um `<dialog open>` comum — este
      // último não bloqueia a página nem esconde a barra, então não deve
      // disparar compensação nenhuma. O `try` cobre navegadores sem o seletor.
      let hasModal: boolean;
      try {
        hasModal = document.querySelector("dialog:modal") !== null;
      } catch {
        hasModal = document.querySelector("dialog[open]") !== null;
      }

      if (hasModal && !release) {
        release = lockScroll();
      } else if (!hasModal && release) {
        release();
        release = null;
      }
    }

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["open"],
      subtree: true,
      // Diálogos montados/desmontados pelo React também mudam o estado sem
      // nunca alterar um atributo.
      childList: true,
    });

    sync();

    return () => {
      observer.disconnect();
      release?.();
    };
  }, []);

  return null;
}
