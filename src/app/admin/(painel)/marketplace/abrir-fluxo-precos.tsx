"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  carregarContextoPrecificacao,
  type Origem,
} from "@/lib/marketplace/pricing-actions";
import type { ContextoPrecificacao } from "@/lib/marketplace/precificacao";
import {
  FluxoPrecos,
  tituloDaIntro,
  APOIO_DA_INTRO,
  ROTULO_COMECAR,
} from "./fluxo-precos";
import { TAMANHO_AMOSTRA } from "@/lib/marketplace/amostra";

/**
 * Carrega o contexto e só então monta o fluxo.
 *
 * Existe para que o custo fique no clique, e não no carregamento da página: contar 990
 * fichas por solado e achar o modelo de destaque é caro, e ninguém que passa por
 * `/admin/marketplace` sem abrir o fluxo deveria pagar por isso.
 *
 * Enquanto carrega, o pop-up já aparece com o esqueleto no lugar. Abrir depois da resposta
 * deixaria um vão de silêncio entre o clique e a tela — e "ação do painel sem feedback
 * visual imediato" é bug catalogado neste projeto.
 */
export function AbrirFluxoPrecos({
  origem,
  onFechar,
  onConcluido,
}: {
  origem: Origem;
  /**
   * Só existe para o caso de FALHA de carregamento. Não é uma saída do fluxo: precificar é
   * obrigatório, e quem monta pelo painel (`PrecificacaoPendente`) não passa nada aqui —
   * lá o fluxo só some quando os produtos existirem.
   */
  onFechar?: () => void;
  /** Chamado no "Ver meus produtos" — é o único jeito de o fluxo sair da tela. */
  onConcluido?: () => void;
}) {
  const [dados, setDados] = useState<{
    contexto: ContextoPrecificacao;
    urlDaFoto: string | null;
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarContextoPrecificacao(origem)
      .then((r) => {
        if (!vivo) return;
        if (!r) {
          toast.error("Não foi possível carregar seus modelos. Recarregue a página.");
          onFechar?.();
          return;
        }
        setDados(r);
      })
      .catch(() => {
        if (!vivo) return;
        toast.error("Não foi possível carregar seus modelos. Recarregue a página.");
        onFechar?.();
      });
    return () => {
      vivo = false;
    };
  }, [origem, onFechar]);

  if (!dados) {
    return (
      /*
        A CASCA É EXATAMENTE A DO FLUXO: mesma largura (748px), mesma borda, mesmo raio,
        mesmo piso de altura e a mesma barra no topo. Antes o esqueleto era um card baixo e
        mais largo, e quando os dados chegavam ele SALTAVA para o tamanho real — a espera
        terminava com um solavanco em vez de o conteúdo simplesmente aparecer.

        A barra fica em 0%: carregar não é progresso do fluxo, e enchê-la aqui prometeria um
        avanço que ainda não aconteceu.
      */
      <div
        className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
        role="status"
        aria-label="Carregando seus modelos"
      >
        <div className="animate-scale-in relative flex max-h-[92dvh] w-full max-w-[748px] flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white sm:rounded-3xl dark:border-gray-800 dark:bg-gray-900">
          <div className="vt-trilho shrink-0" aria-hidden="true">
            <div className="vt-barra" style={{ width: "0%" }} />
          </div>
          {/*
            O QUE SE VÊ é só o spinner e a frase, centralizados. O que define a ALTURA é o
            espaçador invisível logo abaixo.

            Por que um espaçador em vez de um número: a altura da introdução muda com a
            largura da tela, porque o título quebra em uma linha no desktop e em duas ou três
            no celular — 480px em 1280, 490px em 390, 507px em 320. Um `min-h` calibrado
            errava nos dois sentidos (29px curto em 320, 69px sobrando em 1280). Renderizando
            a mesma árvore com `visibility:hidden`, o navegador chega sozinho na mesma
            altura, em qualquer tela.
          */}
          <div className="relative flex flex-1 flex-col">
            {/*
              ESPAÇADOR: a árvore da introdução, invisível. Copia dela a proporção do palco,
              os `mt-` de cada bloco e as classes de tipografia — é isso que faz a conta
              bater. Os textos vêm de `fluxo-precos.tsx` como fonte única, então mudar a copy
              de lá não desalinha isto aqui.

              `invisible` e não `hidden`: `display:none` sairia do cálculo de altura, que é
              justamente o que precisamos dele.
            */}
            <div
              aria-hidden="true"
              className="invisible flex flex-col items-center px-5 py-8 text-center sm:px-10 sm:py-10"
            >
              <div className="aspect-[300/176] w-full max-w-[375px]" />
              <div className="mt-3 h-[7px]" />
              <h2 className="mt-6 text-balance font-display text-2xl font-extrabold sm:text-[29px]">
                {tituloDaIntro(origem, TAMANHO_AMOSTRA)}
              </h2>
              <p className="mt-2 text-pretty text-sm">{APOIO_DA_INTRO}</p>
              <span className="mt-6 inline-flex min-h-11 items-center px-16 text-[14.5px] font-semibold">
                {ROTULO_COMECAR}
              </span>
            </div>

            {/* Sobreposto ao espaçador, ocupando o card inteiro. */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200 border-t-primary dark:border-gray-800 dark:border-t-blue-400" />
              <p className="text-[14.5px] text-gray-500 dark:text-gray-400">
                Separando seus modelos…
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FluxoPrecos
      origem={origem}
      contexto={dados.contexto}
      urlDaFoto={dados.urlDaFoto}
      onConcluido={onConcluido}
    />
  );
}
