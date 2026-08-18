"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RichText } from "@/components/rich-text";
import type { RichTextDoc } from "@/lib/rich-text/document";

/**
 * Descrição do popup com ajuste automático (e discreto) de escala.
 *
 * Problema: no popup em duas colunas a foto tem altura fixa (quadrada) e a
 * coluna de dados cresce com o texto. Quando a descrição passa da base da
 * foto, sobra um vão morto embaixo dela.
 *
 * Solução: medir quanto espaço ainda existe até a base da foto e, só se a
 * descrição não couber, reduzir o tamanho da fonte do bloco inteiro (títulos,
 * subtítulos e listas escalam junto — tudo em `em`, ver RichText). O h2
 * "Descrição" fica FORA deste componente e nunca encolhe: é o rótulo da
 * seção e precisa manter o mesmo peso de "Escolha o tamanho".
 *
 * O ajuste é deliberadamente conservador — nunca força nada:
 * - só reduz quando o texto REALMENTE não cabe (`MIN_GAIN` ignora sobras de
 *   poucos pixels, que não valem uma mudança de tipografia);
 * - nunca passa de `MIN_FONT_SIZE`; se nem assim couber, o vão volta —
 *   encolher mais trocaria um problema estético por um de legibilidade, e a
 *   descrição é lida no momento da decisão de compra;
 * - só em duas colunas (≥ 768px). Empilhado não existe vão possível, então o
 *   texto fica sempre no tamanho cheio;
 * - a largura nunca é tocada: o encaixe é só vertical, então não há como
 *   surgir rolagem horizontal por causa dele;
 * - a medição usa SEMPRE a altura natural (na fonte cheia) como referência,
 *   nunca a altura já reduzida — senão cada passada encolheria de novo em
 *   cima da anterior.
 */
const BASE_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
/** Sobra tolerada (px) antes de valer a pena mexer no tamanho do texto. */
const MIN_GAIN = 8;

export function DescriptionAutoFit({ doc }: { doc: RichTextDoc }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(BASE_FONT_SIZE);

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const row = wrapper.closest<HTMLElement>("[data-panel-row]");
    const gallery = row?.querySelector<HTMLElement>("[data-panel-gallery]");
    const isTwoColumns = window.matchMedia("(min-width: 768px)").matches;

    if (!row || !gallery || !isTwoColumns) {
      setFontSize((current) => (current === BASE_FONT_SIZE ? current : BASE_FONT_SIZE));
      return;
    }

    const applied = Number(wrapper.style.fontSize.replace("px", "")) || BASE_FONT_SIZE;
    const naturalHeight = (wrapper.scrollHeight * BASE_FONT_SIZE) / applied;

    /* Referência = onde o CONTEÚDO da galeria termina (última foto/legenda),
       nunca a caixa da galeria: como as duas colunas esticam para a altura da
       linha, a caixa já vem com a altura do lado mais alto e mediria sempre
       "cabe". O vão que o cliente enxerga é abaixo da legenda da foto. */
    const galleryContent = gallery.lastElementChild ?? gallery;
    const available = galleryContent.getBoundingClientRect().bottom - wrapper.getBoundingClientRect().top;

    if (available <= 0 || naturalHeight - available <= MIN_GAIN) {
      setFontSize((current) => (current === BASE_FONT_SIZE ? current : BASE_FONT_SIZE));
      return;
    }

    // Arredondado em 0,5px: evita ficar recalculando frações e "tremer" a
    // tipografia a cada pixel de diferença.
    const exact = (BASE_FONT_SIZE * available) / naturalHeight;
    const next = Math.max(MIN_FONT_SIZE, Math.floor(exact * 2) / 2);
    setFontSize((current) => (Math.abs(current - next) < 0.25 ? current : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);

    const row = wrapper.closest<HTMLElement>("[data-panel-row]");
    if (row) observer.observe(row);

    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div
      ref={wrapperRef}
      style={{ fontSize: `${fontSize}px` }}
      className="transition-[font-size] duration-150"
    >
      <RichText doc={doc} fontSize={fontSize} className="text-gray-600" />
    </div>
  );
}
