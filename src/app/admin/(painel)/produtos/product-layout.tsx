import type { ReactNode } from "react";

/**
 * Layout estrutural das rotas /admin/produtos/novo e /admin/produtos/[id]/editar.
 *
 * Desktop (≥ lg): grid 50/50 (1fr 1fr).
 *   - Coluna esquerda: Identificação → Solado & Cat. → Visibilidade → Preço → Descrição
 *   - Coluna direita:  Fotos (preview grande + grade) → Tamanhos
 *
 * Mobile (< lg): coluna única, mas a direita (Fotos → Tamanhos) vem PRIMEIRO,
 * acima da esquerda — via `order`, não reordenando o DOM. Sem isso, Fotos
 * (primeiro item da coluna direita) só aparecia depois de TODA a coluna
 * esquerda, inclusive depois dos botões "Salvar"/"Rascunho" — o usuário
 * precisava rolar a tela inteira pra achar o upload de foto. `lg:order-none`
 * desfaz a inversão no desktop, onde a ordem já é a correta (grid 2 col).
 *
 * Sem sticky, sem scroll interno nas colunas — o scroll é sempre o da página.
 */
export type ProductLayoutProps = {
  header: ReactNode;
  left: ReactNode;
  right: ReactNode;
};

export function ProductLayout({ header, left, right }: ProductLayoutProps) {
  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Cabeçalho full-span: ← Voltar + H1 + Badge de status */}
      <div className="mb-6">{header}</div>

      {/*
        Grid 50/50 no lg+, stack no mobile.
        `items-start`: as colunas crescem pela altura do próprio conteúdo,
        sem esticar artificialmente para igualar alturas entre si.
        Nenhuma coluna tem overflow nem sticky — o scroll é só o da página.
      */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {/* Coluna esquerda — 2ª no mobile (Fotos vem primeiro), 1ª no desktop */}
        <div className="order-2 flex flex-col gap-4 lg:order-none">{left}</div>

        {/* Coluna direita — 1ª no mobile, 2ª (à direita) no desktop */}
        <div className="order-1 flex flex-col gap-4 lg:order-none">{right}</div>
      </div>
    </div>
  );
}
