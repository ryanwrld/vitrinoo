"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseBRLPrice } from "@/lib/currency/brl";
import { precificarEImportar, type Origem } from "@/lib/marketplace/pricing-actions";
import {
  TIPOS_DE_SOLADO,
  colapsarParaTipos,
  passosDoProcessamento,
  tiposComModelo,
  type ContextoPrecificacao,
  type TipoDeSolado,
} from "@/lib/marketplace/precificacao";
import { ilustracoesDoFluxo } from "./fluxo-precos-ilustras";

/**
 * O fluxo que decide o preço ANTES de o produto existir.
 *
 * Até aqui, importar do marketplace gravava `suggested_price` — o preço que a curadoria
 * achou justo — e o lojista ficava com dezenas ou centenas de rascunhos com um número que
 * ele não escolheu. Publicar um deles por engano é dinheiro perdido de verdade. Este fluxo
 * é o único caminho de entrada de produto do marketplace, para as 10 sorteadas e para o
 * pacote de 990.
 *
 * POP-UP POR ESTADO LOCAL, nunca rota interceptada: o projeto tem decisão travada contra
 * parallel/intercepting routes no Next 16 (elas quebraram a navegação client-side do app
 * inteiro). Mesma casca do `SorteioAmostra`, que já vive nesta pasta.
 */

/** Saída de cada frase. Espelha `.vt-frase-sai` em globals.css. */
const MS_FRASE_SAI = 320;

/**
 * Preço sem os centavos quando eles são zero: "R$ 430", mas "R$ 430,50" quando existem.
 *
 * Difere do `formatBRLPrice` do projeto de propósito, e só aqui. Nesta tela o lojista lê
 * CINCO preços empilhados de uma vez, e cinco ",00" em coluna viram ruído sem informação —
 * é a mesma decisão do protótipo aprovado. Onde o preço aparece sozinho (vitrine, ficha do
 * produto) o formatador do projeto continua valendo, com as duas casas sempre.
 *
 * Os centavos NÃO somem quando existem: quem digitar 430,50 vê 430,50.
 */
function brl(valor: number): string {
  const v = Math.round(valor * 100) / 100;
  return `R$ ${v.toLocaleString("pt-BR", {
    minimumFractionDigits: v % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Os textos da introdução, compartilhados com o esqueleto de carregamento.
 *
 * O esqueleto precisa reservar a altura EXATA desta tela, e a altura de um texto depende de
 * em quantas linhas ele quebra — 1, 2 ou 3 conforme a largura. Qualquer placeholder com
 * número fixo de linhas erra: medido, ficava 29px curto em 320px e 69px sobrando em 1280px.
 * Renderizando a mesma frase, invisível, a altura bate por construção em qualquer tela.
 */
export function tituloDaIntro(origem: Origem, total: number): string {
  return origem === "pacote"
    ? "Parabéns, pacote resgatado!"
    : `Parabéns, ${total} chuteiras resgatadas!`;
}
export const APOIO_DA_INTRO = "Vamos fazer uma rápida precificação dos seus modelos.";
export const ROTULO_COMECAR = "Começar";

type Etapa = "intro" | "precos" | "ajuste" | "resumo" | "processando" | "pronto";

/**
 * Quanto a barra do topo mostra em cada etapa.
 *
 * Os saltos são DESIGUAIS de propósito: a barra mede quanto do trabalho já foi feito, não
 * quantas telas passaram. A etapa 1 pede um preço por tipo e a 2 pede um só — dividir 100
 * por cinco telas faria a barra mentir sobre o que ainda falta.
 *
 * DOIS MAPAS porque a etapa de ajustes some quando a leva não tem lançamento. Reaproveitar
 * o mapa de três deixaria a barra parada em 25% durante a tela que faz quase todo o
 * trabalho, e depois saltando 57 pontos de uma vez para um resumo que é só conferência.
 */
const PCT_COM_AJUSTE: Record<Etapa, number> = {
  intro: 0,
  precos: 25,
  ajuste: 58,
  resumo: 82,
  processando: 100,
  pronto: 100,
};

const PCT_SEM_AJUSTE: Record<Etapa, number> = {
  intro: 0,
  precos: 33,
  ajuste: 33, // inalcançável: sem lançamento o fluxo nunca entra aqui.
  resumo: 78,
  processando: 100,
  pronto: 100,
};

/** Duração da saída de uma etapa. Espelha `.vt-etapa-sai` em globals.css. */
const MS_SAIDA = 340;

export function FluxoPrecos({
  origem,
  contexto,
  urlDaFoto,
  onConcluido,
}: {
  origem: Origem;
  contexto: ContextoPrecificacao;
  /** O caminho no bucket já resolvido em URL pública pelo servidor — o cliente não monta. */
  urlDaFoto: string | null;
  /** Avisa quem montou que o lojista terminou e pediu para sair. */
  onConcluido?: () => void;
}) {
  const router = useRouter();
  /*
    DUAS ETAPAS, não uma: a que está PINTADA e a saída em curso. Trocar o conteúdo no mesmo
    quadro fazia o fluxo parecer cinco telas soltas; agora a anterior sai por cima e a
    próxima entra por baixo, e `irPara` é o único caminho entre elas.
  */
  const [etapa, setEtapa] = useState<Etapa>("intro");
  const [saindo, setSaindo] = useState(false);
  const [pendente, iniciar] = useTransition();

  /*
    SEM LANÇAMENTO NA LEVA, A ETAPA DE AJUSTES NÃO EXISTE.

    O adicional só faz efeito em par lançamento, e as dez sorteadas podem não trazer
    nenhum — a tela pedia então um número aplicado a "0 pares lançamento", que é decisão
    sem consequência. Nada se perde ao pular: quando ele comprar o pacote (990 pares,
    sempre com lançamentos) a etapa volta e pergunta.

    Vale para os RÓTULOS, a barra de progresso e as frases do processamento: com a etapa
    fora, tudo que a citava passaria a contar uma tela que ele nunca viu.
  */
  const temLancamento = contexto.totalLancamentos > 0;
  const pctPorEtapa = temLancamento ? PCT_COM_AJUSTE : PCT_SEM_AJUSTE;

  // Percentual aplicado UM QUADRO depois de montar. Com a largura final já no primeiro
  // render não existe valor de origem e a transição de `width` não roda — a barra apareceria
  // pronta em vez de encher.
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPct(pctPorEtapa[etapa]), 60);
    return () => clearTimeout(t);
  }, [etapa, pctPorEtapa]);

  /** Sai da etapa atual e entra na próxima. Devolve quando a nova já está na tela. */
  const irPara = useCallback((proxima: Etapa) => {
    setSaindo(true);
    return new Promise<void>((pronto) => {
      setTimeout(() => {
        setEtapa(proxima);
        setSaindo(false);
        pronto();
      }, MS_SAIDA);
    });
  }, []);

  /*
    Pré-preenchido com a regra que a loja já salvou. Quem pegou as 10 sorteadas e depois
    comprou o pacote passa por aqui duas vezes — preço muda em seis meses, e obrigá-lo a
    redigitar do zero é pior do que mostrar o anterior para ele confirmar ou corrigir.
  */
  const [precos, setPrecos] = useState<Record<string, string>>(() => {
    const salvos = contexto.regraSalva
      ? colapsarParaTipos(contexto.regraSalva.precosPorSolado)
      : {};
    return Object.fromEntries(
      TIPOS_DE_SOLADO.map((t) => [t.id, salvos[t.id] ? String(salvos[t.id]) : ""]),
    );
  });
  const [adicional, setAdicional] = useState(() => {
    const v = contexto.regraSalva?.adicionalLancamento ?? 0;
    return v > 0 ? String(v) : "";
  });

  /** Para onde o "Continuar" da etapa 1 deve focar quando se volta pelo resumo. */
  const [focar, setFocar] = useState<string | null>(null);

  /*
    SÓ OS TIPOS QUE ESTA LEVA TEM. Perguntar "quanto custa Society?" para quem tirou dez
    chuteiras sem nenhuma society é pedir um número que não vai a lugar nenhum — e, pior,
    travava o "Continuar" até ele inventar um. O tipo reaparece sozinho quando ele comprar o
    pacote, aí com os 119 pares que justificam a pergunta.
  */
  const tipos = useMemo(() => tiposComModelo(contexto.contagens), [contexto.contagens]);

  const faltam = tipos.filter((t) => parseBRLPrice(precos[t.id] ?? "") === null).length;

  function aplicar() {
    iniciar(async () => {
      // O piso de teatro conta a partir de quando a tela de processamento ENTRA, não do
      // clique: somando os 340ms da saída ao piso, a primeira frase apareceria com o card
      // ainda se movendo.
      await irPara("processando");
      const comecou = Date.now();

      const r = await precificarEImportar({
        origem,
        precosPorTipo: precos,
        adicionalLancamento: adicional,
      });

      /*
        O teatro tem PISO, não teto. A espera existe para dar sentido às três decisões que o
        lojista acabou de tomar, mas cortá-la quando o servidor demora seria pior: a tela
        pularia para "pronto" antes de a última frase aparecer. Então espera o que faltar do
        piso — e nunca prende ninguém além disso.
      */
      const resta = passosDoProcessamento(temLancamento).msTeatro - (Date.now() - comecou);
      if (resta > 0) await new Promise((ok) => setTimeout(ok, resta));

      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível aplicar seus preços.");
        // Volta para o resumo, e não fecha: os preços digitados continuam em estado e ele
        // tenta de novo sem redigitar nada.
        await irPara("resumo");
        return;
      }

      /*
        SEM `router.refresh()` AQUI. A importação acabou de quitar a pendência no banco, e
        um refresh neste ponto faria o layout reavaliar, concluir que não há mais nada a
        precificar e DESMONTAR o fluxo — apagando a tela de sucesso e o confete no instante
        em que eles deveriam aparecer. O painel é atualizado no clique de "Ver meus
        produtos"; até lá, a comemoração fica na tela.
      */
      await irPara("pronto");
    });
  }

  return (
    <div
      /*
        SEM SAÍDA, por decisão do dono: nem X, nem Esc, nem clique no fundo.
        Precificar é obrigatório — o lojista escolhe QUANDO, nunca SE. Enquanto existia o X,
        ele podia aceitar as 10 chuteiras e fechar; o sorteio só oferece o botão uma vez,
        então ficava sem elas e sem caminho de volta.
        A pendência vive no banco (`stores.sample_pricing_started_at` /
        `pack_imported_at`), então recarregar, sair da conta ou abrir em outro aparelho traz
        o fluxo de volta. Só concluir faz ele sumir.
      */
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Definir preços"
    >
      <div
        /*
          `dvh` e não `vh`: no celular a barra de endereço entra e sai, e com `vh` o rodapé
          com o botão principal ficava embaixo dela — inalcançável exatamente na tela que
          precisa ser concluída.
        */
        /*
          `relative` é o que ancora o X no CARD. Sem ele, o `absolute` do botão resolvia
          contra o overlay `fixed inset-0` e o X ia parar no canto da PÁGINA, por cima do
          menu da conta no cabeçalho do painel.
        */
        className="animate-scale-in relative flex max-h-[92dvh] w-full max-w-[748px] flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white sm:rounded-3xl dark:border-gray-800 dark:bg-gray-900"
      >
        {/* Barra de progresso. Primeiro filho do card, colada na borda de cima — é o
            `overflow-hidden` do card que faz ela respeitar os cantos arredondados. */}
        <div className="vt-trilho shrink-0" aria-hidden="true">
          <div className="vt-barra" style={{ width: `${pct}%` }} />
        </div>

        {/*
          Uma chave por etapa: sem `key` o React reaproveita a árvore anterior e a animação
          de entrada não reinicia — a segunda troca em diante ficaria sem movimento.
        */}
        <div
          key={etapa}
          /*
            O PISO DE ALTURA É DAQUI, não do miolo. No protótipo os 472px são do `.corpo`,
            que engloba miolo E rodapé (o rodapé vive lá dentro, empurrado por
            `margin-top:auto`). Colocar o piso só no miolo somava a altura do rodapé por
            fora: medido, o card ficava 94px mais alto que a referência na etapa 2.
          */
          className={`flex min-h-0 flex-1 flex-col sm:min-h-[472px] ${saindo ? "vt-etapa-sai" : "vt-etapa-entra"}`}
        >
        {etapa === "intro" && (
          <Intro
            origem={origem}
            total={contexto.total}
            onComecar={() => irPara("precos")}
          />
        )}

        {etapa === "precos" && (
          <Precos
            contexto={contexto}
            tipos={tipos}
            temLancamento={temLancamento}
            precos={precos}
            focar={focar}
            faltam={faltam}
            onMudar={(id, v) => setPrecos((p) => ({ ...p, [id]: v }))}
            onFocado={() => setFocar(null)}
            onContinuar={() => irPara(temLancamento ? "ajuste" : "resumo")}
          />
        )}

        {etapa === "ajuste" && (
          <Ajuste
            contexto={contexto}
            urlDaFoto={urlDaFoto}
            adicional={adicional}
            precos={precos}
            onMudar={setAdicional}
            onVoltar={() => irPara("precos")}
            onContinuar={() => irPara("resumo")}
          />
        )}

        {etapa === "resumo" && (
          <Resumo
            contexto={contexto}
            tipos={tipos}
            temLancamento={temLancamento}
            precos={precos}
            adicional={adicional}
            pendente={pendente}
            onCorrigir={(id) => {
              setFocar(id);
              irPara("precos");
            }}
            onVoltar={() => irPara(temLancamento ? "ajuste" : "precos")}
            onAplicar={aplicar}
          />
        )}

        {etapa === "processando" && <Processando temLancamento={temLancamento} />}

        {etapa === "pronto" && (
          <Pronto
            origem={origem}
            total={contexto.total}
            // `refresh` antes de navegar: é ele que faz o layout reler a pendência (agora
            // quitada) e parar de montar o fluxo. Sem isso o pop-up seguiria na tela de
            // produtos, porque nada mais o desliga.
            onVerProdutos={() => {
              onConcluido?.();
              router.refresh();
              router.push("/admin/produtos");
            }}
          />
        )}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Etapa 0 — intro                                                             */
/* ========================================================================== */

const MS_SLIDE = 3400;

function Intro({
  origem,
  total,
  onComecar,
}: {
  origem: Origem;
  total: number;
  onComecar: () => void;
}) {
  const ilustras = ilustracoesDoFluxo(total);
  const [slide, setSlide] = useState(0);
  const [automatico, setAutomatico] = useState(true);

  useEffect(() => {
    if (!automatico) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setSlide((k) => (k + 1) % ilustras.length), MS_SLIDE);
    return () => clearInterval(t);
  }, [automatico, ilustras.length]);

  return (
    <div className="flex flex-col items-center px-5 py-8 text-center sm:px-10 sm:py-10">
      {/* O palco encolhe no celular mantendo a proporção do desenho (300:176): sem
          `aspect-ratio` ele viraria uma faixa achatada e as ilustrações ganhariam tarja
          nas laterais. */}
      {/* `#171927` literal: é o fundo de palco do protótipo, e fica entre gray-900 e
          gray-850. Um uso só no produto inteiro — virar token seria criar uma entrada na
          paleta que ninguém mais chama. `gray-950` (preto puro) estava aqui e lia como
          buraco ao lado do card. */}
      <div className="relative aspect-[300/176] w-full max-w-[375px] overflow-hidden rounded-[18px] border border-gray-200 bg-gray-50 dark:border-gray-850 dark:bg-[#171927]">
        {ilustras.map((il, k) => (
          <div
            key={k}
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
              k === slide ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={k !== slide}
          >
            {il.desenho}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {ilustras.map((il, k) => (
          <button
            key={k}
            type="button"
            // Clicar é intenção explícita: para o automático em vez de brigar com o usuário.
            onClick={() => {
              setAutomatico(false);
              setSlide(k);
            }}
            aria-label={il.titulo}
            aria-current={k === slide}
            className={`h-[7px] rounded-full transition-all duration-300 ${
              k === slide
                ? "w-5 bg-primary dark:bg-blue-400"
                : "w-[7px] bg-gray-300 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>

      <h2 className="mt-6 text-balance font-display text-2xl font-extrabold text-gray-900 sm:text-[29px] dark:text-gray-50">
        {tituloDaIntro(origem, total)}
      </h2>
      {/* Mesmo subtítulo nas duas origens, por decisão do dono: o que muda entre comprar o
          pacote e sortear a amostra é o que ele ganhou, não o que vem a seguir. */}
      <p className="mt-2 text-pretty text-sm text-gray-500 dark:text-gray-400">
        {APOIO_DA_INTRO}
      </p>

      <button
        type="button"
        onClick={onComecar}
        // Largura total no celular (alvo de toque generoso) e só o padding do protótipo no
        // desktop, onde um botão de 320px para uma palavra pesa mais que a decisão que ele
        // representa.
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-16 text-[14.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 sm:w-auto"
      >
        {ROTULO_COMECAR}
      </button>
    </div>
  );
}

/* ========================================================================== */
/* Etapa 1 — preço por tipo                                                    */
/* ========================================================================== */

function Precos({
  contexto,
  tipos,
  temLancamento,
  precos,
  focar,
  faltam,
  onMudar,
  onFocado,
  onContinuar,
}: {
  contexto: ContextoPrecificacao;
  tipos: TipoDeSolado[];
  /** Sem lançamento na leva a etapa de ajustes some, e o fluxo passa a ter DUAS telas. */
  temLancamento: boolean;
  precos: Record<string, string>;
  focar: string | null;
  faltam: number;
  onMudar: (id: string, valor: string) => void;
  onFocado: () => void;
  onContinuar: () => void;
}) {
  return (
    <Moldura
      rotulo={`Etapa 1 de ${temLancamento ? 3 : 2} · Preços`}
      titulo="Quanto custa cada tipo na sua loja?"
      rodape={
        <>
          <span className="text-xs text-gray-500 sm:text-sm dark:text-gray-400">
            {faltam > 0
              ? `${faltam === 1 ? "Falta 1 preço" : `Faltam ${faltam} preços`}`
              : "Tudo definido"}
          </span>
          <button
            type="button"
            onClick={onContinuar}
            disabled={faltam > 0}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-[26px] text-[14.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-default disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-850 dark:disabled:text-[#454b66]"
          >
            Continuar
          </button>
        </>
      }
    >
      <div className="overflow-hidden rounded-[14px] border border-gray-200 dark:border-gray-850">
        <div className="hidden items-center gap-3 bg-gray-50 px-[15px] py-[9px] text-[11.5px] font-bold uppercase tracking-[0.5px] text-gray-500 sm:flex dark:bg-[#10111a] dark:text-gray-600">
          <span className="flex-1">Tipo de chuteira</span>
          <span>Seu preço</span>
        </div>
        {tipos.map((tipo, i) => {
          const contagem = contexto.contagens.find((c) => c.id === tipo.id);
          return (
            <div
              key={tipo.id}
              className={`flex items-center gap-3 px-[15px] py-[9px] ${
                i > 0 ? "border-t border-gray-200 dark:border-gray-850" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-50">
                  {tipo.rotulo}{" "}
                  <span className="font-medium text-gray-400 dark:text-gray-500">
                    ({tipo.sigla})
                  </span>
                </p>
                <p className="text-[12.5px] text-gray-500 dark:text-gray-600">
                  {contagem?.total ?? 0}{" "}
                  {contagem?.total === 1 ? "modelo" : "modelos"}
                  {contagem && contagem.lancamentos > 0 && (
                    <span className="text-gray-400 dark:text-gray-500">
                      {" "}
                      · {contagem.lancamentos} lançamento
                      {contagem.lancamentos === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </div>
              <CampoReal
                id={tipo.id}
                valor={precos[tipo.id] ?? ""}
                onMudar={(v) => onMudar(tipo.id, v)}
                autoFoco={focar === tipo.id || (focar === null && i === 0)}
                onFocado={onFocado}
                rotulo={`Preço de ${tipo.rotulo}`}
              />
            </div>
          );
        })}
      </div>
    </Moldura>
  );
}

/* ========================================================================== */
/* Etapa 2 — adicional de lançamento                                           */
/* ========================================================================== */

function Ajuste({
  contexto,
  urlDaFoto,
  adicional,
  precos,
  onMudar,
  onVoltar,
  onContinuar,
}: {
  contexto: ContextoPrecificacao;
  urlDaFoto: string | null;
  adicional: string;
  precos: Record<string, string>;
  onMudar: (v: string) => void;
  onVoltar: () => void;
  onContinuar: () => void;
}) {
  const add = parseBRLPrice(adicional) ?? 0;
  const destaque = contexto.destaque;
  // A prévia usa o preço QUE ELE ACABOU DE DIGITAR para aquele tipo, não o sugerido: é o
  // efeito da decisão dele que a tela precisa mostrar.
  const base = destaque?.tipo
    ? (parseBRLPrice(precos[destaque.tipo] ?? "") ?? destaque.precoSugerido)
    : (destaque?.precoSugerido ?? 0);
  const pct = base > 0 && add > 0 ? Math.round((add / base) * 100) : 0;

  return (
    <Moldura
      rotulo="Etapa 2 de 3 · Ajustes"
      titulo="Lançamento vale quanto a mais?"
      apoio={`Defina o adicional aplicado aos ${contexto.totalLancamentos} ${
        contexto.totalLancamentos === 1 ? "par lançamento" : "pares lançamento"
      } da sua loja.`}
      rodape={
        <>
          <button
            type="button"
            onClick={onVoltar}
            className="min-h-11 text-[14.5px] font-semibold text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          >
            {/*
              SÓ "VOLTAR" NO CELULAR. Em 360px o rótulo inteiro (142px) mais o "Concluir
              valores" (166px) não cabem na linha, e o rodapé quebrava em dois andares —
              fora do padrão das outras etapas, onde os dois botões ficam lado a lado. A
              etapa 3 continua com o texto completo: lá o botão principal é mais curto
              ("Aplicar tudo") e os dois cabem — medido.
            */}
            ← Voltar<span className="hidden sm:inline"> aos preços</span>
          </button>
          <button
            type="button"
            onClick={onContinuar}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-[26px] text-[14.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
          >
            Concluir valores
          </button>
        </>
      }
    >
      {/*
        EMPILHA NO CELULAR. No protótipo isto era campo à esquerda e prévia à direita, com
        o campo deslizando lateralmente quando o valor aparecia. Em 360px as duas colunas
        não cabem — e cortar a prévia esvazia a etapa, porque a prévia É o argumento.
        Coluna única no celular, duas a partir de `sm`.
      */}
      <div className={`vt-duas flex flex-col sm:flex-row sm:items-stretch ${add > 0 ? "on" : ""}`}>
        <div className="vt-decisao flex shrink-0 flex-col items-center justify-center gap-2 sm:w-[38%] sm:px-5">
          <CampoReal
            id="lanc"
            valor={adicional}
            onMudar={onMudar}
            autoFoco
            prefixo="+ R$"
            largo
            rotulo="Adicional por par de lançamento"
          />
          <span className="text-[11.5px] font-bold uppercase tracking-[0.5px] text-gray-500 dark:text-gray-600">
            Adicional por par
          </span>
        </div>

        {destaque && (
          <>
            <div className="vt-divisa hidden w-px bg-gray-200 sm:block dark:bg-[#1c1e2c]" />
            {/*
              O INVÓLUCRO QUE COLAPSA. No celular ele é a grade de uma linha só que anima de
              0fr a 1fr: a linha mede o conteúdo real, então a altura sai animada sem
              `min-height`, sem placeholder e sem número chutado. Antes disso o bloco do
              produto ficava no fluxo o tempo todo (só os filhos eram apagados com opacity),
              e reservava 174px de buraco embaixo do campo antes de o lojista digitar.

              O `mt-5` é o `gap-5` que saiu do flex: o gap sobrevive a um filho de altura zero
              e deixaria 20px de sobra justamente onde não pode ter nada. MARGEM, e não
              padding: o padding fica do lado de DENTRO da borda de cima, então dobrar o
              `pt` empurrava o conteúdo para baixo e deixava a linha colada na frase
              "Adicional por par". A margem devolve os 20px para cima da linha, que é onde
              eles sempre estiveram. Aberto, o espaçamento é idêntico ao desenho aprovado:
              20px acima da linha, 20px abaixo.

              A margem fica DENTRO do cortador, que tem `overflow: hidden` e por isso é um
              contexto de formatação próprio — ela não escapa para fora nem impede a linha
              da grade de chegar a zero.

              SÃO DOIS DIVS, e não um. O padding e a borda de cima do bloco fazem parte da
              caixa dele: numa caixa `border-box` a altura não desce abaixo de padding +
              borda, então a grade fechava em 41px em vez de zero — medido. O cortador do
              meio não tem padding nenhum, então ele pode ser zero de verdade e recorta o
              bloco inteiro por dentro.

              No desktop nenhum dos dois existe para o layout (`display: contents`) — lá são
              duas colunas lado a lado, sem buraco nenhum para resolver.
            */}
            <div className="vt-colapso">
            <div className="vt-colapso-corte">
            <div className="vt-efeito mt-5 flex flex-1 flex-col justify-center gap-3 border-t border-gray-200 pt-5 sm:mt-0 sm:border-t-0 sm:pl-6 sm:pt-0 dark:border-gray-850">
              <div className="flex items-center gap-3">
                <div className="relative h-[54px] w-[54px] shrink-0 overflow-hidden rounded-[12px] bg-gray-100 dark:bg-gray-800">
                  {urlDaFoto && (
                    <Image src={urlDaFoto} alt="" fill sizes="54px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13.5px] font-semibold leading-[1.35] text-gray-900 dark:text-gray-50">
                    {destaque.nome}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    (o modelo mais novo do seu lote)
                  </p>
                </div>
              </div>

              {/* `items-baseline` alinha os dois valores pela linha da fonte: sem isso o
                  preço riscado, menor, flutuaria acima do número grande. */}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {add > 0 && (
                  <>
                    <span className="text-[14.5px] text-gray-500 line-through tabular-nums dark:text-gray-600">
                      <span className="sr-only">De </span>
                      {brl(base)}
                    </span>
                    <span className="text-[14.5px] text-gray-500 dark:text-gray-600" aria-hidden="true">
                      →
                    </span>
                  </>
                )}
                <span className="font-display text-[26px] font-extrabold tracking-[-0.6px] tabular-nums text-gray-900 dark:text-gray-50">
                  {add > 0 && <span className="sr-only">por </span>}
                  {brl(base + add)}
                </span>
              </div>

              <p className="text-[12.5px] text-gray-500 dark:text-gray-600">
                {pct > 0
                  ? `${pct}% a mais que o preço comum do mesmo tipo.`
                  : "Sem adicional, o lançamento sai pelo mesmo preço do tipo."}
              </p>
            </div>
            </div>
            </div>
          </>
        )}
      </div>
    </Moldura>
  );
}

/* ========================================================================== */
/* Etapa 3 — resumo                                                            */
/* ========================================================================== */

function Resumo({
  contexto,
  tipos,
  temLancamento,
  precos,
  adicional,
  pendente,
  onCorrigir,
  onVoltar,
  onAplicar,
}: {
  contexto: ContextoPrecificacao;
  tipos: TipoDeSolado[];
  /**
   * Sem lançamento na leva não existe segundo preço: a coluna "Preço lançamento" repetiria
   * o mesmo número, e a etapa anterior é a de preços, não a de ajustes.
   */
  temLancamento: boolean;
  precos: Record<string, string>;
  adicional: string;
  pendente: boolean;
  onCorrigir: (id: string) => void;
  onVoltar: () => void;
  onAplicar: () => void;
}) {
  const add = parseBRLPrice(adicional) ?? 0;
  // Sempre a ÚLTIMA etapa — o número dela é o total, com ou sem a de ajustes no meio.
  const etapas = temLancamento ? 3 : 2;

  return (
    <Moldura
      rotulo={`Etapa ${etapas} de ${etapas} · Resumo final`}
      /*
        TÍTULO CURTO NO CELULAR. "Preços definidos para seu estoque:" quebra em duas linhas
        em 360px e empurra a lista para baixo numa tela que já é a mais alta das três — e o
        complemento não conta nada que a própria lista de preços não diga.
      */
      titulo={
        <>
          Preços definidos<span className="hidden sm:inline"> para seu estoque:</span>
        </>
      }
      tituloMenor
      rodape={
        <>
          <button
            type="button"
            onClick={onVoltar}
            className="min-h-11 text-[14.5px] font-semibold text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          >
            {temLancamento ? "← Voltar aos ajustes" : "← Voltar aos preços"}
          </button>
          <button
            type="button"
            onClick={onAplicar}
            disabled={pendente}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-[26px] text-[14.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
          >
            Aplicar tudo
          </button>
        </>
      }
    >
      <div className="overflow-hidden rounded-[14px] border border-gray-200 dark:border-gray-850">
        <div className="hidden items-center gap-3 bg-gray-50 px-[15px] py-[9px] text-[11.5px] font-bold uppercase tracking-[0.5px] text-gray-500 sm:flex dark:bg-[#10111a] dark:text-gray-600">
          <span className="flex-1">Tipo de chuteira</span>
          {/* "Comum" só existe em oposição a "lançamento". Sem a segunda coluna, o
              qualificador viraria uma distinção que a tela não faz. */}
          <span className="w-[104px] text-right">{temLancamento ? "Preço comum" : "Preço"}</span>
          {temLancamento && <span className="w-[160px] text-right">Preço lançamento</span>}
        </div>

        {tipos.map((tipo, i) => {
          const contagem = contexto.contagens.find((c) => c.id === tipo.id);
          const valor = parseBRLPrice(precos[tipo.id] ?? "") ?? 0;
          return (
            /*
              Cada linha é clicável e volta para a etapa 1 já com aquele campo focado: o
              resumo é onde o lojista DESCOBRE que um preço está errado, e sem isto a única
              saída era voltar duas telas e reencontrar o campo na mão.
            */
            <button
              key={tipo.id}
              type="button"
              onClick={() => onCorrigir(tipo.id)}
              title={`Corrigir o preço de ${tipo.rotulo}`}
              className={`flex w-full items-start gap-3 px-[15px] py-[9px] text-left transition-colors duration-150 hover:bg-gray-50 sm:items-center dark:hover:bg-gray-800/60 ${
                i > 0 ? "border-t border-gray-200 dark:border-gray-850" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold leading-[1.2] text-gray-900 dark:text-gray-50">
                  {tipo.rotulo}
                </p>
                <p className="text-[12.5px] text-gray-500 dark:text-gray-600">
                  {contagem?.total ?? 0} {contagem?.total === 1 ? "modelo" : "modelos"}
                </p>

                {/*
                  NO CELULAR os dois preços descem para dentro do próprio cartão, rotulados.
                  Três colunas numéricas não cabem em 360px, e rolagem horizontal esconderia
                  justamente a coluna de lançamento — na tela cuja função é conferir preço.

                  ESTE BLOCO É O ÚNICO LUGAR onde o preço aparece no celular: a coluna da
                  direita é `hidden sm:block`. Sem lançamento ele não some — vira um valor
                  só, e sem o rótulo "Comum", que só existiria para separar de um segundo
                  preço que não está mais lá.
                */}
                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 sm:hidden">
                  <div className="flex items-baseline gap-1.5">
                    {temLancamento && (
                      <dt className="text-xs text-gray-500 dark:text-gray-400">Comum</dt>
                    )}
                    <dd className="font-display text-base font-extrabold tabular-nums text-gray-900 dark:text-gray-50">
                      {brl(valor)}
                    </dd>
                  </div>
                  {temLancamento && (
                    <div className="flex items-baseline gap-1.5">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">Lançamento</dt>
                      <dd className="text-base font-semibold tabular-nums text-gray-600 dark:text-gray-300">
                        {brl(valor + add)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <span className="hidden w-[104px] text-right font-display text-[17px] font-extrabold tracking-[-0.3px] tabular-nums text-gray-900 sm:block dark:text-gray-50">
                {brl(valor)}
              </span>
              {temLancamento && (
                <span className="hidden w-[160px] text-right text-[14px] tabular-nums text-gray-500 sm:block dark:text-gray-400">
                  {brl(valor + add)}
                </span>
              )}
            </button>
          );
        })}

        <p className="border-t border-gray-200 bg-gray-50 px-[15px] py-[10px] text-center text-[12.5px] leading-[1.2] text-gray-500 dark:border-gray-850 dark:bg-[#10111a] dark:text-gray-600">
          +{contexto.total} {contexto.total === 1 ? "par será enviado" : "pares serão enviados"}{" "}
          para o seu estoque
        </p>
      </div>

    </Moldura>
  );
}

/* ========================================================================== */
/* Etapa 4 — processando                                                       */
/* ========================================================================== */

function Processando({ temLancamento }: { temLancamento: boolean }) {
  // TRÊS FRASES OU DUAS, conforme o que ele decidiu de verdade. `aplicar()` calcula o piso
  // da espera pelo MESMO roteiro, então a última frase nunca fica parada esperando um piso
  // que sobrou de uma etapa que não existiu.
  //
  // `useMemo` porque as listas entram na dependência dos efeitos abaixo: recriadas a cada
  // render, o cronômetro da frase seria zerado toda vez que qualquer estado mudasse, e a
  // frase da vez ficaria esticada até a próxima troca.
  const { passos, passoMs } = useMemo(
    () => passosDoProcessamento(temLancamento),
    [temLancamento],
  );

  const [passo, setPasso] = useState(0);
  // A frase SAI antes de a próxima entrar. Trocar o texto no corte tira a leitura — cada
  // uma devolve ao lojista uma das decisões que ele acabou de tomar.
  const [saindoFrase, setSaindoFrase] = useState(false);

  useEffect(() => {
    // Um `setTimeout` encadeado, e não um `setInterval`: as durações são desiguais de
    // propósito, e intervalo fixo não sabe disso.
    if (passo >= passos.length - 1) return;
    const t = setTimeout(() => setSaindoFrase(true), passoMs[passo] - MS_FRASE_SAI);
    return () => clearTimeout(t);
  }, [passo, passos, passoMs]);

  useEffect(() => {
    if (!saindoFrase) return;
    const t = setTimeout(() => {
      setPasso((p) => Math.min(p + 1, passos.length - 1));
      setSaindoFrase(false);
    }, MS_FRASE_SAI);
    return () => clearTimeout(t);
  }, [saindoFrase, passos]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-5 py-16 text-center sm:py-20">
      {/* SVG e não borda CSS: aqui o comprimento do arco e a ponta arredondada ficam sob
          controle — borda só entrega um quarto de círculo de canto reto. Gira em `linear`:
          uma curva com aceleração faria o anel parecer que engasga a cada volta. */}
      <svg
        viewBox="0 0 72 72"
        fill="none"
        className="h-[58px] w-[58px] animate-spin [animation-duration:1.6s]"
        aria-hidden="true"
      >
        <circle cx="36" cy="36" r="31" strokeWidth="4.5" className="stroke-gray-200 dark:stroke-gray-800" />
        <circle
          cx="36"
          cy="36"
          r="31"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="53 260"
          className="stroke-primary dark:stroke-blue-400"
        />
      </svg>

      {/* As frases devolvem ao lojista as decisões que ele acabou de tomar, na ordem em que
          as tomou. É o que dá sentido à espera em vez de só ocupá-la — e é honesto: não
          promete porcentagem, porque não há progresso real para medir. */}
      {/* Altura travada: as três frases têm larguras diferentes e uma quebra em duas
          linhas. Sem piso, o bloco pularia a cada troca. */}
      <p
        key={`${passo}-${saindoFrase}`}
        className={`min-h-[3rem] text-pretty text-sm text-gray-600 dark:text-gray-300 ${
          saindoFrase ? "vt-frase-sai" : "vt-frase-entra"
        }`}
        aria-live="polite"
      >
        {passos[passo]}
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Etapa 5 — pronto                                                            */
/* ========================================================================== */

function Pronto({
  origem,
  total,
  onVerProdutos,
}: {
  origem: Origem;
  total: number;
  onVerProdutos: () => void;
}) {
  const tique = useRef<SVGPathElement>(null);

  useEffect(() => {
    /*
      O confete NÃO sai de um relógio paralelo: ele é disparado PELA animação do traço.
      Com dois `setTimeout` independentes a deriva medida foi de 31ms — o pop-up já tem
      transição própria no caminho e o traço só começa no primeiro quadro depois da
      montagem, então as duas cadeias somam jitter em pontos diferentes. Pendurando no
      `finished` do próprio traço, o estouro cai no mesmo quadro em que o check fecha.
    */
    const alvo = tique.current;
    if (!alvo) return;

    let cancelado = false;
    const soltar = () => {
      if (!cancelado) confete();
    };

    const animacao = alvo.getAnimations()[0];
    // Sem animação = movimento reduzido (o @media de globals.css zera tudo): o check já
    // está desenhado, então o confete estoura agora em vez de esperar para sempre.
    if (animacao) animacao.finished.then(soltar).catch(() => {});
    else soltar();

    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-14 text-center sm:py-16">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="vt-check h-[68px] w-[68px] text-success-fg"
      >
        <path className="vt-check-arco" d="M21.801 10A10 10 0 1 1 17 3.335" />
        <path ref={tique} className="vt-check-tique" d="m9 11 3 3L22 4" />
      </svg>

      <h2 className="mt-4 text-balance font-display text-xl font-extrabold text-gray-900 sm:text-[27px] dark:text-gray-50">
        Tudo pronto, pares cadastrados!
      </h2>
      <p className="mt-2 max-w-[26rem] text-pretty text-sm text-gray-500 dark:text-gray-400">
        {origem === "pacote"
          ? `Mais de ${total} modelos foram adicionados na sua lista de produtos, comece a compartilhar e vendê-los agora.`
          : `Seus ${total} modelos entraram na lista de produtos, comece a compartilhar e vendê-los agora.`}
      </p>

      <button
        type="button"
        onClick={onVerProdutos}
        className="mt-6 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-full bg-primary px-8 text-[14.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
      >
        Ver meus produtos
      </button>
    </div>
  );
}

/** Cores das fitas: as da marca mais o verde de sucesso e o branco do texto. */
const CONFETE_CORES = ["#3140C4", "#5C6BDA", "#1FA860", "#E0A94B", "#F7F8FB"];

/**
 * Dispara uma vez e remove a camada do DOM. É comemoração de evento, não decoração de
 * fundo — um confete que fica caindo para sempre vira ruído na segunda olhada.
 *
 * As peças nascem DENTRO da borda de cima do pop-up e saem dele: sobem abrindo para os
 * lados, passam do limite, e só então a gravidade puxa.
 */
function confete() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cartao = document.querySelector('[role="dialog"] > div');
  if (!cartao) return;
  const r = cartao.getBoundingClientRect();

  const camada = document.createElement("div");
  camada.className = "vt-confete";
  const ale = (a: number, b: number) => a + Math.random() * (b - a);
  let maisLonga = 0;

  for (let k = 0; k < 110; k++) {
    const larg = ale(3, 9);
    const peca = document.createElement("i");
    peca.style.width = `${larg}px`;
    peca.style.height = `${larg * 0.4}px`; // proporção de fita
    peca.style.background = CONFETE_CORES[(Math.random() * CONFETE_CORES.length) | 0];
    // Faixa de largada, não linha: um `top` único para as 110 peças desenharia uma régua
    // reta atravessando o card. Sorteado numa banda de 24px, elas nascem espalhadas.
    peca.style.left = `${r.left + ale(-14, r.width + 14)}px`;
    peca.style.top = `${r.top + ale(2, 26)}px`;
    camada.appendChild(peca);

    const lados = ale(-260, 260);
    const sobe = ale(120, 320);
    const giro = ale(360, 1080) * (Math.random() < 0.5 ? -1 : 1);
    const giro0 = ale(0, 360); // nenhuma peça nasce perfeitamente horizontal
    const vida = ale(2600, 3600);
    const atraso = ale(0, 450);
    maisLonga = Math.max(maisLonga, vida + atraso);

    peca.animate(
      [
        {
          transform: `translate(0px,0px) rotate(${giro0}deg)`,
          opacity: ale(0.75, 1),
          easing: "cubic-bezier(.15,.6,.4,1)", // sobe desacelerando
        },
        {
          transform: `translate(${lados * 0.55}px,${-sobe}px) rotate(${giro0 + giro * 0.35}deg)`,
          opacity: 1,
          offset: 0.28,
          easing: "cubic-bezier(.5,0,.75,1)", // cai acelerando
        },
        {
          transform: `translate(${lados}px,${window.innerHeight - r.top + 80}px) rotate(${giro0 + giro}deg)`,
          opacity: 0,
        },
      ],
      { duration: vida, delay: atraso, fill: "forwards" },
    );
  }

  document.body.appendChild(camada);
  setTimeout(() => camada.remove(), maisLonga + 250);
}

/* ========================================================================== */
/* Peças compartilhadas                                                        */
/* ========================================================================== */

/**
 * Cabeçalho + miolo rolável + rodapé colado embaixo.
 *
 * O rodapé NUNCA rola junto: é onde vive o botão que conclui a etapa, e no celular um
 * botão que exige rolar até o fim da lista de tipos (até cinco campos) é um botão que não
 * se acha.
 */
function Moldura({
  rotulo,
  titulo,
  tituloMenor = false,
  apoio,
  children,
  rodape,
}: {
  rotulo: string;
  /** ReactNode, e não string, por causa do resumo: lá o título encurta no celular. */
  titulo: React.ReactNode;
  /** O resumo usa um título menor que as outras etapas, como no protótipo. */
  tituloMenor?: boolean;
  apoio?: string;
  children: React.ReactNode;
  rodape: React.ReactNode;
}) {
  return (
    <>
      {/*
        `min-h` no desktop mantém a ALTURA DO CARD ESTÁVEL entre as etapas. Sem isso o card
        pulava de 602px na etapa 1 para 380px na 2 e voltava a crescer na 3 — medido. O
        protótipo resolve com `min-height:472px` no corpo, e o efeito é o mesmo: o conteúdo
        de cada etapa flutua no meio de uma caixa que não muda de tamanho.

        Só a partir de `sm`: no celular travar 472px de miolo forçaria rolagem em telas
        curtas para mostrar espaço vazio.
      */}
      <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-5 pt-7 sm:px-[44px] sm:pb-0 sm:pt-[26px]">
        {/*
          `m-auto` no FILHO, e nunca `justify-center` no pai que rola. São visualmente
          equivalentes quando o conteúdo cabe, mas `justify-content: center` corta as duas
          pontas quando ele não cabe — e a ponta de cima fica INALCANÇÁVEL pela rolagem.
          Em 320px a lista de tipos passa da tela e o título sumia para sempre.
          `margin: auto` resolve para 0 quando falta espaço, então o topo continua lá.
        */}
        <div className="m-auto w-full">
        <div className="text-center">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.5px] text-gray-500 dark:text-gray-600">
            {rotulo}
          </p>
          {/* 26px (24px no resumo) é o tamanho do protótipo. `text-2xl` do projeto rende
              30px e deixava o título competindo com o conteúdo da etapa. */}
          <h2
            className={`mt-1.5 text-balance font-display font-extrabold leading-[1.18] tracking-[-0.6px] text-gray-900 dark:text-gray-50 ${
              tituloMenor ? "text-lg sm:text-2xl" : "text-xl sm:text-[26px]"
            }`}
          >
            {titulo}
          </h2>
          {apoio && (
            <p className="mx-auto mt-2 max-w-md text-pretty text-[14.5px] leading-[1.55] text-gray-500 dark:text-gray-400">
              {apoio}
            </p>
          )}
        </div>
        <div className="mt-6">{children}</div>
        </div>
      </div>

      {/*
        SEM BORDA, em tamanho nenhum. No desktop nunca houve — no protótipo o rodapé é só o
        fim do card, e a linha virava um traço que o desenho não tem.

        No celular ela existiu e foi REMOVIDA por decisão do dono, com o custo assumido: nas
        etapas 1 e 3 o miolo rola de verdade em aparelho baixo (a lista de cinco passa da
        tela em 667px de altura), e era a linha que marcava onde o conteúdo continuava por
        baixo do botão. Sem ela esse corte deixa de ser sinalizado. Não reintroduzir sem
        pedido — o traço foi visto e recusado.

        Padding do protótipo: 22px acima, 28px abaixo, 44px nas laterais — os mesmos do
        `.corpo`, que lá engloba miolo e rodapé num container só.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-[44px] sm:pb-[28px] sm:pt-[22px]">
        {rodape}
      </div>
    </>
  );
}

/**
 * Campo de dinheiro.
 *
 * A máscara aceita dígitos e UMA vírgula com até duas casas — nada de `type="number"`, que
 * no Brasil brigaria com a vírgula decimal e ainda traz setas de incremento que não fazem
 * sentido num preço. A validação de verdade acontece na Server Action, com `parseBRLPrice`.
 */
function CampoReal({
  id,
  valor,
  onMudar,
  autoFoco,
  onFocado,
  prefixo = "R$",
  largo = false,
  rotulo,
}: {
  id: string;
  valor: string;
  onMudar: (v: string) => void;
  autoFoco?: boolean;
  onFocado?: () => void;
  prefixo?: string;
  largo?: boolean;
  rotulo: string;
}) {
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFoco) return;
    // Espera a animação de entrada do pop-up: focar durante o `scale-in` faz o teclado do
    // celular subir com o card ainda se movendo, e a tela treme.
    const t = setTimeout(() => {
      campo.current?.focus();
      onFocado?.();
    }, 420);
    return () => clearTimeout(t);
  }, [autoFoco, onFocado]);

  const mascarar = useCallback((cru: string) => {
    let v = cru.replace(/[^\d,]/g, "");
    const i = v.indexOf(",");
    if (i > -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, "").slice(0, 2);
    if (v.startsWith(",")) v = v.slice(1);
    return v;
  }, []);

  return (
    <label
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-gray-300 px-3 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-800 dark:focus-within:ring-blue-400/20 ${
        largo ? "w-40" : "w-28 sm:w-[132px]"
      }`}
    >
      <span className="sr-only">{rotulo}</span>
      <span className="shrink-0 text-[13.5px] font-semibold text-gray-500 dark:text-gray-600">
        {prefixo}
      </span>
      <input
        ref={campo}
        data-id={id}
        value={valor}
        onChange={(e) => onMudar(mascarar(e.target.value))}
        // `decimal` e não `numeric`: é o teclado que traz a vírgula no iOS.
        inputMode="decimal"
        placeholder="0"
        /*
          16px no celular e 15.5px (o valor do protótipo) a partir de `sm`. Abaixo de 16px o
          Safari do iPhone DÁ ZOOM ao focar o campo, e o lojista preenche cinco destes
          seguidos — a tela saltaria a cada um. Fidelidade onde ela não custa nada.
        */
        className="w-full min-w-0 bg-transparent text-base font-semibold tabular-nums text-gray-900 outline-none placeholder:text-gray-300 sm:text-[15.5px] dark:text-gray-50 dark:placeholder:text-gray-600"
      />
    </label>
  );
}
