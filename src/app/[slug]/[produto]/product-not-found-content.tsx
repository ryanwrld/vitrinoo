import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

/**
 * Conteúdo do 404 de produto (PED-01/PED-02, D-01) — usado por
 * `[slug]/page.tsx` quando `?produto=` aponta pra um id inexistente/
 * oculto (rascunho ou esgotado pela regra de visibilidade). `backHref`
 * volta pra `/${slug}` (a própria vitrine, sem o popup). Sem altura
 * forçada (`<div>`, não `<main min-h-dvh>`): o conteúdo vive dentro do
 * `max-h` do painel do modal (product-modal.tsx), nunca em tela cheia —
 * não existe mais rota de página inteira do produto.
 */
export function ProductNotFoundContent({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center px-4 py-16">
      <EmptyState
        icon="lost"
        title="Produto não encontrado"
        description="Este produto não está mais disponível ou o link mudou."
        action={
          <Link href={backHref} className="text-sm font-medium text-primary hover:text-primary-hover">
            Voltar para a loja
          </Link>
        }
      />
    </div>
  );
}
