import Link from "next/link";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { ProductForm } from "../product-form";

/**
 * Rota `/admin/produtos/novo` — formulário de cadastro (D-08, tela única). Mesmo
 * gate combinado de auth + onboarding que `/admin/dashboard`/`/admin/configuracoes`
 * (`requireCompletedOnboarding` como primeira linha).
 */
export default async function NovoProdutoPage() {
  await requireCompletedOnboarding();

  return (
    // Mesmo respiro do Dashboard e sem `mx-auto` — ver configuracoes/page.tsx.
    <div className="flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div>
        <Link href="/admin/produtos" className="text-sm text-gray-500 transition-colors duration-150 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50">
          ← Voltar
        </Link>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Novo produto</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Preencha os detalhes — o produto aparece na vitrine assim que for publicado.
        </p>
      </div>

      <ProductForm />
    </div>
  );
}
