"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, ShoppingCart, Check, ChevronRight, Gift } from "lucide-react";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/support/whatsapp";
import { SorteioAmostra, type ItemAmostra } from "./sorteio-amostra";
import { iniciarPrecificacaoAmostra } from "@/lib/marketplace/pricing-actions";
import { AbrirFluxoPrecos } from "./abrir-fluxo-precos";

/**
 * Preço "de", riscado ao lado do valor real.
 *
 * Constante, e não coluna no banco: isto não é um preço que existiu — é
 * ancoragem, um recurso visual de conversão. Uma primeira versão criou coluna e
 * migration para guardá-lo, o que era carregar schema para sustentar decoração.
 * Trocar o número aqui é uma linha; o preço de verdade continua vindo do banco.
 */
export const PRECO_ANCORA = 297;

/**
 * Etiqueta de preço com um "%" dentro, para o selo de promoção.
 *
 * Desenhada aqui em vez de vir do lucide-react: a `Tag` da biblioteca é uma
 * etiqueta genérica, que diz "categoria" tanto quanto diz "oferta", e o `Percent`
 * sozinho é um símbolo de matemática. A ideia de promoção precisa das duas coisas
 * na mesma marca — o objeto que carrega preço, e o desconto escrito nele.
 *
 * Desenhada para 14px, que é o tamanho real de uso, e não reduzida a partir de um
 * traço maior: os dois pontos do "%" são círculos cheios em vez de anéis, porque
 * anel de 1px vira borrão nesse tamanho, e a barra é mais inclinada que num "%"
 * de texto para ganhar comprimento dentro da etiqueta.
 */
function IconePromocao({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M1.5 4.2A1.7 1.7 0 0 1 3.2 2.5h6.6c.45 0 .88.18 1.2.5l3.5 3.5a1.7 1.7 0 0 1 0 2.4l-3.5 3.5c-.32.32-.75.5-1.2.5H3.2a1.7 1.7 0 0 1-1.7-1.7z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 5.4 4.9 10.6"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="5.1" cy="5.9" r="0.9" fill="currentColor" />
      <circle cx="9" cy="10.1" r="0.9" fill="currentColor" />
    </svg>
  );
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

/**
 * O card do pack — a capa da pasta, e a peça de venda da tela.
 *
 * O PREÇO VEM ANTES DE TUDO: é um pacote à venda, e esconder o valor atrás de
 * uma conversa só adia a única pergunta que o revendedor realmente tem.
 *
 * A ação principal é COMPRAR, não "adicionar a amostra". A amostra é a isca —
 * importante, mas secundária: promovê-la a botão primário fazia o produto
 * parecer grátis e enterrava a proposta comercial.
 */
export function PackHero({
  nome,
  descricao,
  preco,
  precoAncora,
  capaUrl,
  totalProdutos,
  temAcesso,
  jaResgatouTudo,
  nomeLoja,
  storeId,
  amostra,
}: {
  nome: string;
  descricao: string | null;
  preco: number | null;
  precoAncora: number | null;
  capaUrl: string | null;
  totalProdutos: number;
  temAcesso: boolean;
  /** As 10 do sorteio já foram resgatadas alguma vez, mesmo que depois apagadas. */
  jaResgatouTudo: boolean;
  nomeLoja: string | null;
  storeId: string;
  amostra: ItemAmostra[];
}) {
  /*
    DOIS POP-UPS EM SEQUÊNCIA, e não um só: o sorteio revela as 10, fecha, e a
    precificação abre por cima. Decisão do dono. O sorteio continua dono só da encenação —
    quem cria produto é o "Aplicar tudo" da etapa 3 do fluxo de preços.

    A precificação abre AQUI para responder no clique, e a pendência é gravada no banco
    para o painel reabri-la em qualquer outra sessão. Só o banco seria correto e lento: o
    layout é renderizado no servidor, e esperar o `refresh` deixava ~4s de tela vazia entre
    o sorteio sumir e o fluxo aparecer — medido.

    Não há risco de dois pop-ups: o layout só monta o dele quando a página é renderizada no
    servidor, e nada revalida durante o fluxo. Quando revalida — na conclusão — a pendência
    já foi quitada.
  */
  /*
    UM ESTADO PARA OS DOIS MODOS do pop-up, e não dois booleanos: "sortear" e
    "revisar" são mutuamente exclusivos por definição, e dois booleanos permitiriam
    o estado impossível em que os dois estão ligados.
  */
  const [popupAmostra, setPopupAmostra] = useState<"sorteio" | "revisao" | null>(null);
  const [abrirPrecos, setAbrirPrecos] = useState(false);
  const [aceitando, setAceitando] = useState(false);

  // Mensagem montada inteira e codificada UMA vez — regra rígida do CLAUDE.md
  // para qualquer link de WhatsApp do projeto.
  const identificacao = nomeLoja ? `Sou da loja ${nomeLoja}` : "Sou um lojista";
  const valor = preco !== null ? `, ${brl(preco)}` : "";
  const mensagem = `Olá! ${identificacao} e quero adquirir o ${nome} (${totalProdutos} chuteiras${valor}).\n\nComo faço pra liberar?`;
  const hrefComprar = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(mensagem)}`;

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col sm:flex-row">
          <div
            /*
              A capa encolhe na faixa de tablet. Em 768px a barra lateral já
              ocupa 256px, e uma capa de 224px fixos ficava com quase metade do
              que sobrava — a descrição caía para 7 linhas e o card dobrava de
              altura em relação ao desktop. Medido: 262px de coluna de texto em
              768px contra 486px em 1024px.
            */
            className="relative aspect-[16/10] w-full shrink-0 bg-gray-100 sm:aspect-square sm:w-40 lg:w-56 dark:bg-gray-800"
          >
            {capaUrl ? (
              <Image
              src={capaUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 224px, (min-width: 640px) 160px, 100vw"
              className="object-cover"
              priority
            />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-300 dark:text-gray-600">
                <Package className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-3 p-5">
            <div>
              {/* `flex-wrap` porque no celular estreito os dois selos não cabem
                  lado a lado, e empurrá-los para fora do card seria pior que
                  quebrar a linha. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary dark:bg-blue-400/15 dark:text-blue-300">
                  <IconePromocao className="h-3.5 w-3.5" />
                  Promoção
                </span>
                {/* Mesmas classes do selo ao lado: os dois ficam lado a lado e leem como
                    um par só quando dividem a mesma cor. */}
                <span className="inline-flex items-center rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary dark:bg-blue-400/15 dark:text-blue-300">
                  Novo
                </span>
              </div>
              <h2 className="mt-2 font-display text-xl font-extrabold text-gray-900 sm:text-2xl dark:text-gray-50">
                {nome}
              </h2>
              {descricao && (
                <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                  {descricao}
                </p>
              )}
            </div>

            {/* Preço em destaque, no tamanho de um preço — é a informação que o
                revendedor procura primeiro num pacote à venda. */}
            {preco !== null && (
              // `items-baseline` alinha os dois valores pela linha da fonte, e não
              // pelo topo da caixa — sem isso o preço riscado, menor, flutuaria
              // acima do número grande.
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {/*
                  Só ancora quando o "de" é MAIOR que o "por". Um valor menor não
                  é desconto, é dado inconsistente, e mostrá-lo destruiria a
                  credibilidade da oferta inteira. Mesma checagem que
                  `calculateDiscountPercent` faz na vitrine pública.
                */}
                {precoAncora !== null && precoAncora > preco && (
                  <span className="text-base text-gray-400 line-through dark:text-gray-500">
                    {/* O risco é só visual: leitor de tela não o anuncia. O rótulo
                        oculto é o que faz a ancoragem existir para quem ouve. */}
                    <span className="sr-only">De </span>
                    {brl(precoAncora)}
                  </span>
                )}
                <span className="font-display text-3xl font-extrabold text-gray-900 dark:text-gray-50">
                  {precoAncora !== null && precoAncora > preco && (
                    <span className="sr-only">por </span>
                  )}
                  {brl(preco)}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">à vista</span>
              </div>
            )}

            {/*
              Fica ACIMA da linha dos botões, como irmão dela na coluna do cartão — dentro
              do container de ações ela dividia a linha com o "Comprar" no desktop.
              Só para quem pegou a amostra e ainda não comprou: sem esta linha, abrir o
              Marketplace de novo dá a impressão de que nada aconteceu e o cartão vira uma
              oferta repetida. Com ela, a leitura é "as 10 já são suas, o pacote continua
              disponível" — que é exatamente a decisão que resta.
            */}
            <div className="mt-auto flex flex-col gap-2 pt-1">
            {!temAcesso && jaResgatouTudo && (
              /*
                CLICÁVEL: é a única porta para rever QUAIS eram as 10. Depois do
                resgate elas vão para /admin/produtos e se misturam com o que o
                lojista cadastrou sozinho — sem esta frase não existe lugar nenhum
                onde a amostra volte a aparecer junta.

                `self-start` não é enfeite: o pai é um `flex flex-col`, então o
                filho estica por padrão. Medido antes da mudança — a frase ocupava
                301px, a largura inteira da coluna, com o texto bem mais estreito.
                Como botão, isso deixaria a área clicável muito além do que se lê.

                Sublinhado SEMPRE, e não só no hover: o painel é usado no celular, e
                toque não tem hover — a afordância que só existe no ponteiro não
                existe para a maioria.

                `py-3 -my-3` é ALVO DE TOQUE, não espaçamento. Uma linha de texto tem
                18px de altura, contra os 44px dos outros botões do painel — e 8px
                abaixo dela está o "Comprar", que abre o WhatsApp. No celular, o dedo
                que escorregasse um pouco abria uma conversa de compra em vez da lista.
                O padding leva a caixa a 42px e a margem negativa devolve os mesmos
                24px ao layout, então nada se move na tela: cresce só a área que
                responde ao toque. O "Comprar" não perde nada — ele vem depois no
                documento e ganha a sobreposição de 4px.
              */
              <button
                type="button"
                onClick={() => setPopupAmostra("revisao")}
                className="inline-flex items-center gap-1 self-start rounded-full py-3 -my-3 text-sm font-medium text-success-fg underline underline-offset-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                {amostra.length} Modelos de amostra grátis resgatados
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {/*
                Esta área NUNCA fica vazia: ou diz que o pacote está liberado, ou oferece a
                compra. O que some depois de resgatar as 10 é só o "Teste grátis", porque
                esse já foi usado — a compra continua de pé, que é o caminho de quem gostou
                da amostra.
              */}
              {temAcesso ? (
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-success-solid px-4 text-sm font-semibold text-white sm:px-5">
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                  Pacote liberado
                </span>
              ) : (
                <>
                  {/* Âncora real, nunca window.open — webviews do Instagram e do
                      WhatsApp bloqueiam popup por JS (CLAUDE.md). */}
                  <a
                    href={hrefComprar}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
                  >
                    <ShoppingCart className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    Comprar
                  </a>

                  {!jaResgatouTudo && (
                  <button
                    type="button"
                    onClick={() => setPopupAmostra("sorteio")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Gift className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    Teste grátis
                  </button>
                  )}
                </>
              )}

              <Link
                href="/admin/marketplace/albuns"
                className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary transition-opacity duration-150 hover:opacity-80 dark:text-blue-300"
              >
                Ver chuteiras
                <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              </Link>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sem `onConcluido`: quem abriu aqui sai pela navegação do "Ver meus produtos". */}
      {abrirPrecos && <AbrirFluxoPrecos origem="amostra" />}

      {popupAmostra && (
        <SorteioAmostra
          itens={amostra}
          hrefComprar={hrefComprar}
          storeId={storeId}
          revisao={popupAmostra === "revisao"}
          onFechar={() => setPopupAmostra(null)}
          /*
            GRAVA A PENDÊNCIA ANTES DE ABRIR, e com `await`: se o lojista fechar a aba
            durante a precificação, é este carimbo que traz o fluxo de volta na próxima
            sessão. Abrir primeiro e gravar depois deixaria uma janela em que ele pode
            perder as 10 chuteiras — o sorteio só oferece o botão uma vez.
          */
          aceitando={aceitando}
          onPrecificar={async () => {
            setAceitando(true);
            await iniciarPrecificacaoAmostra();
            setPopupAmostra(null);
            setAbrirPrecos(true);
          }}
        />
      )}


    </>
  );
}
