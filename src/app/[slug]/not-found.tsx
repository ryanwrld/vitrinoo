import { EmptyState } from "@/components/empty-state";

/**
 * 404 escopado à rota `/[slug]` — alcançado quando `page.tsx` chama
 * `notFound()` porque a loja não existe pelo slug da URL. Antes deste
 * arquivo, esse caminho caía no 404 padrão (sem estilo) do Next.js, já que
 * só existia um `not-found.tsx` no segmento `[produto]` (nunca alcançado
 * quando é a própria loja que não existe). Mesma copy genérica do design
 * system (`ui_kits/storefront/NotFound.jsx`) — não afirma se é loja ou
 * produto que não existe.
 */
export default function LojaNotFound() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-white px-4">
      <EmptyState
        icon="lost"
        title="Página não encontrada"
        description="Essa loja não existe mais, ou o link está incorreto."
      />
    </main>
  );
}
