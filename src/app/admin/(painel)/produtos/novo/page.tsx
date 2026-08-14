import Link from "next/link";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { ProductForm } from "../product-form";

/**
 * Rota `/admin/produtos/novo` — formulário de cadastro (D-08, tela única). Mesmo
 * gate combinado de auth + onboarding que `/admin/dashboard`/`/admin/configuracoes`
 * (`requireCompletedOnboarding` como primeira linha).
 *
 * O cabeçalho (← Voltar + H1) é passado via prop `header` para o ProductLayout,
 * que o renderiza em full-span acima do grid de duas colunas. A page em si não
 * precisa de wrapper — o ProductLayout cuida de todo o padding e largura.
 */
export default async function NovoProdutoPage() {
  await requireCompletedOnboarding();

  const header = (
    <>
      <Link
        href="/admin/produtos"
        className="text-sm text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
      >
        ← Voltar
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">
        Novo produto
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Preencha os detalhes — o produto aparece na vitrine assim que for publicado.
      </p>
    </>
  );

  return <ProductForm header={header} />;
}
