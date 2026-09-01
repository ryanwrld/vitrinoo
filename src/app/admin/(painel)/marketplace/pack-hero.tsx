"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package, ShoppingCart, Sparkles, Check, ChevronRight, Gift } from "lucide-react";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/support/whatsapp";
import { SorteioAmostra, type ItemAmostra } from "./sorteio-amostra";

/**
 * Preço "de", riscado ao lado do valor real.
 *
 * Constante, e não coluna no banco: isto não é um preço que existiu — é
 * ancoragem, um recurso visual de conversão. Uma primeira versão criou coluna e
 * migration para guardá-lo, o que era carregar schema para sustentar decoração.
 * Trocar o número aqui é uma linha; o preço de verdade continua vindo do banco.
 */
export const PRECO_ANCORA = 297;

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
  totalImportados,
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
  totalImportados: number;
  nomeLoja: string | null;
  storeId: string;
  amostra: ItemAmostra[];
}) {
  const [abrirAmostra, setAbrirAmostra] = useState(false);

  // Mensagem montada inteira e codificada UMA vez — regra rígida do CLAUDE.md
  // para qualquer link de WhatsApp do projeto.
  const identificacao = nomeLoja ? `Sou da loja ${nomeLoja}` : "Sou um lojista";
  const valor = preco !== null ? ` — ${brl(preco)}` : "";
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
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  Modelos Prontos
                </span>
                {/* Mesmos tokens de sucesso do selo "Teste grátis": o
                    `--color-success-fg` já troca sozinho no escuro pelo escopo
                    `.dark .admin-scope`, sem precisar de variante `dark:` no
                    texto — só o fundo alterna aqui. */}
                <span className="inline-flex items-center rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-fg dark:bg-success-solid/15">
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
              A contagem de chuteiras e álbuns saiu daqui a pedido do dono: a
              descrição já diz "+900", e repetir o número em dois lugares logo
              abaixo do preço competia com ele. O que sobra é só o que muda por
              loja — quantas já foram levadas.
            */}
            {totalImportados > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                {/* Verde inteiro — ícone e texto no mesmo `text-success-fg`, que
                    já alterna sozinho entre os temas. É confirmação de algo
                    concluído, e o mesmo verde dos selos amarra a leitura. */}
                <span className="inline-flex items-center gap-1 font-medium text-success-fg">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                  {totalImportados} modelos já adicionados
                </span>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              {temAcesso ? (
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-subtle px-5 text-sm font-semibold text-primary dark:bg-blue-400/15 dark:text-blue-300">
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

                  <button
                    type="button"
                    onClick={() => setAbrirAmostra(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Gift className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                    Teste grátis
                  </button>
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
      </section>

      {abrirAmostra && (
        <SorteioAmostra
          itens={amostra}
          hrefComprar={hrefComprar}
          storeId={storeId}
          onFechar={() => setAbrirAmostra(false)}
        />
      )}
    </>
  );
}
