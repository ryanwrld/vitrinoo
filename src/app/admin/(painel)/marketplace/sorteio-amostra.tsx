"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, X } from "lucide-react";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export type ItemAmostra = {
  id: string;
  name: string;
  suggestedPrice: number;
  sizeMin: number;
  sizeMax: number;
  fotoUrl: string | null;
  jaImportado: boolean;
};

/**
 * Chuteira em traço, para o verso das cartas.
 *
 * Desenhada aqui em vez de vir do lucide-react — a biblioteca não tem chuteira,
 * e as alternativas (tênis, bota) descaracterizavam a peça inteira. O perfil é
 * assimétrico de propósito: bico baixo à esquerda, calcanhar alto à direita.
 * Uma primeira tentativa saiu simétrica demais e lia como uma cúpula com pernas.
 */
function IconeChuteira({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 16.5c-.4-2 .6-3.4 3-4.1l11.8-3.4c1.6-.5 2.8-1.2 3.8-2.2l1.8-1.8c1.6-1.6 4-1.7 5.7-.3 1.9 1.6 3 3.9 3 6.4v3.9c0 .9-.7 1.6-1.6 1.6H4.1c-.8 0-1.5-.5-1.6-1.3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 12.2l1.6 2.6M16.4 11l1.6 2.6M20.3 9.6l1.7 2.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity=".7"
      />
      <path
        d="M27.6 6.4c1.4 1.3 2.2 3 2.2 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity=".6"
      />
      <path
        d="M6 18v2.5M12.5 18v2.5M19.5 18v2.5M26.5 18v2.5M32 18v2.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Duração do embaralhamento antes da revelação. Longo de propósito: a versão de
 * 1,5s não dava tempo nem de ler o que estava escrito na tela, e a espera virava
 * um flash sem função. Aqui ela sustenta três mensagens em sequência.
 */
const MS_SORTEIO = 4200;
/**
 * Intervalo entre a revelação de uma chuteira e a próxima.
 *
 * ZERO, por decisão do dono: as 10 aparecem JUNTAS. O escalonamento dava um
 * efeito de cascata bonito no papel, mas na prática as últimas chegavam quase
 * 1,2 s depois das primeiras — e o que se lia não era ritmo, era atraso. Com
 * tudo sincronizado, a duração de cada card carrega sozinha a sensação de
 * velocidade.
 */
const MS_ENTRE_CARTAS = 0;

/**
 * Quanto o baralho pode se estender além do tempo normal, esperando as fotos.
 * Sem esse teto, uma conexão ruim prenderia o usuário embaralhando para sempre.
 */
const MS_ESPERA_MAXIMA_FOTOS = 2500;

/**
 * Mensagens que se sucedem durante o embaralhamento.
 *
 * NEUTRAS de propósito: descrevem só o que está acontecendo. O argumento de
 * venda — exclusividade, facilidade, rapidez — fica inteiro no resultado, por
 * decisão do dono do produto. Antecipá-lo aqui gastaria a mensagem antes de o
 * usuário ter visto o que ganhou, e a revelação chegaria já sabida.
 */
const MENSAGENS = ["Verificando disponibilidade…", "Sorteando os modelos…", "Quase lá…"];

/**
 * Pop-up do teste grátis, com o sorteio encenado.
 *
 * O RESULTADO JÁ ESTÁ DECIDIDO quando este componente monta: a seleção é
 * determinística a partir do id da loja (`lib/marketplace/amostra.ts`), então a
 * mesma loja vê sempre as mesmas 10 e recarregar a página não muda nada. A
 * animação não sorteia — ela apresenta.
 *
 * Isso é deliberado e importante: um sorteio de verdade a cada abertura deixaria
 * o lojista girando a roleta até gostar do resultado, e transformaria a amostra
 * numa forma de garimpar o acervo de graça.
 *
 * Modal por estado local, nunca por rota interceptada — o projeto tem decisão
 * travada contra parallel/intercepting routes no Next 16.
 */
/**
 * Chave que marca que esta loja JÁ viu o sorteio.
 *
 * Em localStorage, e não no banco: o que se guarda aqui é se a encenação já foi
 * assistida — informação de interface, sem valor de negócio. O resultado em si
 * nunca dependeu disso, porque é derivado do id da loja e é o mesmo sempre.
 *
 * O custo é conhecido e aceito: em outro aparelho ou outro navegador a animação
 * roda uma vez de novo. Levar isso ao banco custaria uma migration e uma escrita
 * a cada abertura de pop-up para resolver um incômodo que dura 4 segundos.
 */
const CHAVE_SORTEADO = "vitrinoo:amostra-sorteada:";

export function SorteioAmostra({
  itens,
  hrefComprar,
  storeId,
  onFechar,
  onPrecificar,
  aceitando,
  revisao = false,
}: {
  itens: ItemAmostra[];
  hrefComprar: string;
  storeId: string;
  onFechar: () => void;
  /**
   * Fecha o sorteio e abre a precificação.
   *
   * O botão NÃO importa mais nada: desde o fluxo de preços, quem cria produto é o
   * "Aplicar tudo" da etapa 3, com o preço que o lojista definiu. Importar aqui deixaria
   * as 10 entrando com `suggested_price` — o preço da curadoria — e o fluxo seguinte
   * teria que reescrever produto recém-criado, que é o desenho que decidimos não ter.
   */
  onPrecificar: () => void;
  /** Enquanto a pendência é gravada no banco e o painel assume o fluxo. */
  aceitando: boolean;
  /**
   * MODO REVISÃO: quem já resgatou abriu isto para VER as 10, não para ganhá-las.
   *
   * Entra direto na revelação e o rodapé não oferece ação. As 10 estão espalhadas
   * em /admin/produtos no meio do que o lojista cadastrou sozinho — esta tela é o
   * único lugar onde elas voltam a aparecer juntas.
   */
  revisao?: boolean;
}) {

  /**
   * Entrada direta no resultado, decidida no PRIMEIRO RENDER — não num efeito:
   * começar em "sorteando" e corrigir depois faz a animação piscar antes de
   * sumir. Dois caminhos levam aqui:
   *
   *   - já assistiu ao sorteio antes (localStorage);
   *   - pediu menos movimento no sistema.
   *
   * Nos dois, a revelação aparece estática. Não é só estética: a animação
   * depende de as fotos já estarem decodificadas, e quem entra direto pula o
   * pré-carregamento que acontece durante o baralho — animar aqui
   * reintroduziria o travamento de ~900 ms que o pré-carregamento resolveu.
   */
  const [entrarDireto] = useState(() => {
    // Na revisão o baralho não é opção: quem clicou pediu a lista, não a encenação.
    // Sem isto, abrir em outro aparelho — onde a marca do localStorage não existe —
    // devolveria 4,2 s de animação para uma pessoa que só quer conferir o que pegou.
    if (revisao) return true;
    if (typeof window === "undefined") return false;
    let jaViu = false;
    try {
      jaViu = Boolean(window.localStorage.getItem(CHAVE_SORTEADO + storeId));
    } catch {
      // localStorage bloqueado (janela anônima, cookies restritos): a animação
      // roda de novo, que é degradação aceitável.
    }
    return jaViu || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [passouTempoMinimo, setPassouTempoMinimo] = useState(false);
  /**
   * O teto de espera pelas fotos ESTOUROU.
   *
   * Estado próprio, e não o mesmo `passouTempoMinimo` de antes. Os dois timers abaixo
   * chamavam `setPassouTempoMinimo(true)` — o segundo escrevia um valor que o primeiro já
   * tinha escrito, então o teto não fazia nada e a fase continuava exigindo
   * `carregadas >= totalComFoto`. Bastava UMA foto não carregar para o pop-up ficar preso
   * em "Sorteando suas chuteiras…" para sempre, com o X como única saída — exatamente o
   * que o comentário do teto dizia estar prevenindo.
   *
   * Reproduzido em 2026-09-01: 6 de 10 fotos pintaram, as outras 4 nunca chegaram, e o
   * baralho girou indefinidamente.
   */
  const [estourouTeto, setEstourouTeto] = useState(false);
  /**
   * Quantas fotos já pintaram. O CONTADOR VEM DO onLoad DAS IMAGENS REAIS, e
   * não de um pré-carregamento manual. A versão anterior chamava `new Image()`
   * com a URL do Supabase — só que o `next/image` não requisita essa URL: ele
   * pede a do otimizador (`/_next/image?url=…&w=…`). O pré-carregamento aquecia
   * um cache que nunca era consultado, e as fotos continuavam chegando depois
   * da animação. Montar as imagens de verdade durante o baralho resolve sem
   * adivinhar URL: quem carrega é o mesmo componente que vai aparecer.
   */
  const [carregadas, setCarregadas] = useState(0);

  const restantes = itens.filter((i) => !i.jaImportado);
  const totalComFoto = itens.filter((i) => i.fotoUrl).length;

  /**
   * `fase` é DERIVADA, não guardada em estado.
   *
   * Ela é função de coisas que já estão no estado — se entrou direto, se o
   * baralho cumpriu o tempo mínimo e se as fotos já pintaram. Guardá-la exigia
   * um efeito que chamava `setFase` depois que essas peças mudavam, e efeito
   * que seta estado em cadeia é um render a mais por transição (é o que a regra
   * react-hooks/set-state-in-effect acusa). Calculando no render, a fase já sai
   * certa de primeira e não existe estado para dessincronizar.
   *
   * O que terminar por último manda: o tempo mínimo do baralho ou as fotos — mas o teto
   * de espera vence os dois. Uma foto que nunca chega não pode prender ninguém: revelar com
   * o quadro cinza no lugar dela é ruim, ficar embaralhando para sempre é pior.
   */
  const fase: "sorteando" | "revelando" =
    entrarDireto || estourouTeto || (passouTempoMinimo && carregadas >= totalComFoto)
      ? "revelando"
      : "sorteando";

  useEffect(() => {
    if (fase === "revelando") return;

    // Tempo mínimo do baralho. A revelação também espera as fotos — quem
    // terminar por último manda (ver o cálculo de `fase` acima).
    const t = setTimeout(() => setPassouTempoMinimo(true), MS_SORTEIO);
    // Teto: numa conexão ruim, prender o usuário embaralhando para sempre seria
    // pior que revelar com as fotos ainda chegando.
    const limite = setTimeout(() => setEstourouTeto(true), MS_SORTEIO + MS_ESPERA_MAXIMA_FOTOS);
    return () => {
      clearTimeout(t);
      clearTimeout(limite);
    };
  }, [fase]);

  // Marca como visto assim que a revelação acontece — inclusive quando o
  // usuário fecha o pop-up sem importar nada. O sorteio já foi assistido.
  useEffect(() => {
    if (fase !== "revelando") return;
    try {
      window.localStorage.setItem(CHAVE_SORTEADO + storeId, "1");
    } catch {
      /* sem localStorage: nada a fazer, apenas repete a animação depois */
    }
  }, [fase, storeId]);

  // Esc fecha — um modal que só fecha no X é uma armadilha de teclado.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Amostra grátis"
      onClick={onFechar}
    >
      <div
        className="animate-scale-in flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/*
          CABEÇALHO CENTRADO, com o X FORA DO FLUXO.

          Antes era `flex justify-between` com dois filhos: o texto e o X. Centralizar
          o texto nesse arranjo o centraliza no espaço que sobra AO LADO do X — o
          título nascia ~18px à esquerda do centro real do cartão. Com o X em
          `absolute`, o bloco de texto ocupa a largura inteira e o centro é o centro.

          Não colidem: o selo fica centrado, longe da borda direita, e o título vem
          na linha de baixo — o X ocupa de 12px a 48px na vertical, o título começa
          em ~52px.

          A borda inferior fica só na tela do resultado, onde o grid das 10 chuteiras
          rola por baixo do cabeçalho e a linha marca onde essa área começa. Na tela
          da espera não há nada rolando, e ela só cortava o pop-up ao meio.
        */}
        <div
          className={`relative p-5 text-center ${
            fase === "sorteando" ? "" : "border-b border-gray-200 dark:border-gray-800"
          }`}
        >
          <div>
            {/*
              Verde de sucesso do próprio design system, e não um tom novo:
              `--color-success-bg` e `--color-success-fg` já são calibrados para
              contraste nos dois temas, e o escopo `.dark .admin-scope` troca o
              `-fg` sozinho (globals.css). Escrever um verde à mão aqui criaria
              um quinto tom de verde no produto e exigiria variante `dark:` em
              cada uso — que é justamente o que esses tokens existem para evitar.
            */}
            <span className="inline-flex items-center rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-fg dark:bg-success-solid/15">
              Amostra grátis
            </span>
            <h3 className="mt-2 font-display text-lg font-extrabold text-gray-900 dark:text-gray-50">
              {fase === "sorteando" ? "Sorteando suas chuteiras…" : "Modelos para sua loja"}
            </h3>
            <p
              // `text-pretty` distribui as linhas evitando sobra grande no fim
              // de uma e órfã na última. Sem ele, o navegador quebra de forma
              // gulosa: enche cada linha até não caber mais a próxima palavra,
              // e no celular isso deixava um vão visível depois de "Chegam".
              className="mx-auto mt-0.5 max-w-md text-pretty text-sm text-gray-500 dark:text-gray-400"
              aria-live="polite"
            >
              {fase === "sorteando"
                ? "Isso leva só alguns segundos."
                : "Uma primeira seleção para conhecer nosso pacote:"}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-50"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto p-5">
          {fase === "sorteando" && <Embaralhando />}

          {/*
            O GRID É MONTADO DESDE O INÍCIO, invisível durante o baralho.
            É isso que faz as fotos carregarem ANTES da revelação: são os mesmos
            componentes <Image> que vão aparecer, então a URL que carrega é
            exatamente a que será usada — sem precisar adivinhar o formato do
            otimizador do Next.

            `opacity-0` + `absolute`, e nunca `display:none` ou `hidden`: o
            navegador não baixa imagem de elemento sem caixa, e era justamente
            o download que queríamos adiantar.
          */}
          <div
            className={
              fase === "sorteando"
                ? "pointer-events-none absolute inset-0 -z-10 overflow-hidden p-5 opacity-0"
                : ""
            }
            aria-hidden={fase === "sorteando"}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {itens.map((item, i) => (
                <article
                  key={item.id}
                  className={`flex flex-col ${
                    fase === "revelando" && !entrarDireto ? "vt-reveal" : ""
                  }`}
                  style={{ ["--atraso" as string]: `${i * MS_ENTRE_CARTAS}ms` }}
                >
                  <div
                    className={`relative aspect-square overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 ${
                      fase === "revelando" && !entrarDireto ? "vt-shine" : ""
                    }`}
                    style={{ ["--atraso" as string]: `${i * MS_ENTRE_CARTAS}ms` }}
                  >
                    {item.fotoUrl && (
                      <Image
                        src={item.fotoUrl}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 20vw, 50vw"
                        className="object-cover"
                        onLoad={() => setCarregadas((n) => n + 1)}
                        // Conta o erro como "resolvido": uma foto quebrada não
                        // pode prender o usuário embaralhando para sempre.
                        onError={() => setCarregadas((n) => n + 1)}
                      />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-snug text-gray-900 dark:text-gray-50">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {brl(item.suggestedPrice)} · {item.sizeMin}-{item.sizeMax}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>

        {fase === "revelando" && (
          /* SEM `flex-wrap`: era ele que empilhava os dois no celular. Medido a 375px,
             com o rótulo curto: 158px do link + 12px de gap + 100px do botão, em 335px
             úteis. Sobram 65px, e o link fica em uma linha.

             O `min-w-0` no link existe pelo OUTRO ramo: quando as 10 já foram
             importadas, o botão vira a pílula "Já estão no seu estoque" (217px) e a
             soma bate exatamente nos 335px. Sem poder encolher, a linha quebraria;
             com `min-w-0` quem cede é o link, que vai a 106px e duas linhas. O
             `shrink-0` na ação garante que quem cede seja sempre o link. */
          <div className="animate-slide-up flex items-center justify-between gap-3 border-t border-gray-200 p-5 dark:border-gray-800">
            <a
              href={hrefComprar}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 text-sm font-semibold text-primary transition-opacity duration-150 hover:opacity-80 dark:text-blue-300"
            >
              Quero o pacote completo
            </a>
            {/*
              O MESMO RODAPÉ NOS DOIS MODOS, inclusive na revisão.

              A pílula é agora o ÚNICO lugar que diz onde as 10 estão — os selos "na
              loja" por card foram removidos por decisão do dono, porque repetiam dez
              vezes o que o rodapé já resume.

              Imprecisão conhecida e aceita: "Já estão no seu estoque" continua sendo
              afirmado para quem apagou uma das 10, porque o registro de importação
              sobrevive à exclusão de propósito (migration 0021, explicada em page.tsx).
              Uma versão anterior escondia a pílula na revisão por causa disso, e o que
              sobrava era um rodapé mudo sobre o estado — pior troca.

              Sem risco de resgatar duas vezes: quem chega na revisão resgatou tudo, e
              `jaResgatouTudo` e `jaImportado` leem os mesmos registros — então
              `restantes` está sempre vazio aqui e o "Adicionar" nunca aparece.
            */}
            {restantes.length === 0 ? (
              <span /*
                  MESMO VERDE DO "Pacote liberado" (`bg-success-solid` + branco), e não
                  um tom novo: os dois dizem "isto já é seu", em telas diferentes do
                  mesmo fluxo, e ler igual é o que os liga. O token já é calibrado para
                  os dois temas, então não precisa de variante `dark:`.

                  A cor vale nas duas larguras. O que muda com a largura é o rótulo, que
                  encurta por falta de espaço — cor é significado, não é espaço.
                */
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-success-solid px-5 text-sm font-semibold text-white">
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                {/*
                  DOIS RÓTULOS, trocados por CSS. No celular a pílula divide 335px com
                  o "Quero o pacote completo", e a frase inteira empurrava o link a
                  encolher até quebrar em três linhas. "Já resgatado" diz o mesmo no
                  espaço que existe.

                  `display:none` tira o texto escondido da árvore de acessibilidade,
                  então leitor de tela ouve um rótulo só, nunca os dois.
                */}
                <span className="sm:hidden">Já resgatado</span>
                <span className="hidden sm:inline">Já estão no seu estoque</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={onPrecificar}
                disabled={aceitando}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
              >
                {aceitando ? "Preparando…" : "Adicionar"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O baralho embaralhando.
 *
 * VERSO DE CARTA, e não as fotos reais: mostrar as chuteiras aqui entregava o
 * resultado antes da revelação e matava o único momento de surpresa que a tela
 * tem. O verso também é o que faz o conjunto ler como um baralho — cinco fotos
 * diferentes girando parecem cinco coisas soltas, cinco versos iguais parecem um
 * maço.
 */
function Embaralhando() {
  const [passo, setPasso] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPasso((p) => Math.min(p + 1, MENSAGENS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);

  // Cada carta sai para um lado alternado, com atraso próprio: é o que produz a
  // sensação de riffle em vez de um bloco só se mexendo.
  const cartas = [0, 1, 2, 3, 4, 5];

  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-8 py-8">
      <div className="vt-baralho relative h-44 w-32">
        <div
          className="vt-halo absolute -inset-8 rounded-full bg-primary/20 blur-3xl dark:bg-blue-400/20"
          aria-hidden="true"
        />

        {cartas.map((i) => (
          <div
            key={i}
            className="vt-carta absolute inset-0 overflow-hidden rounded-xl border border-white/25 shadow-2xl"
            style={{
              ["--i" as string]: String(i),
              ["--sx" as string]: String(i % 2 === 0 ? -1 : 1),
              animationDelay: `${i * 230}ms`,
            }}
            aria-hidden="true"
          >
            {/* Verso: gradiente da marca + trama diagonal, como carta de baralho */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-blue-900" />
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 2px, transparent 2px 9px)",
              }}
            />
            <div className="absolute inset-[6px] rounded-lg border border-white/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <IconeChuteira className="w-14 text-white/85" />
            </div>
          </div>
        ))}
      </div>

      <p
        key={passo}
        className="animate-fade-in text-center text-sm font-semibold text-gray-600 dark:text-gray-300"
        aria-live="polite"
      >
        {MENSAGENS[passo]}
      </p>
    </div>
  );
}
