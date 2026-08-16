"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAccountAction } from "@/lib/account/actions";
import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/account/constants";

/**
 * Zona de perigo — exclusão definitiva da conta.
 *
 * Confirmação por digitação (não um "tem certeza?" de um clique) porque a
 * ação é irreversível E destrói dados de terceiros na prática: a vitrine
 * sai do ar e todo link já compartilhado com clientes quebra. O mesmo
 * `<dialog>` nativo usado na troca de slug (slug-editor.tsx) — mesma
 * gramática de confirmação em todo o painel.
 *
 * `deleteAccountAction` termina em `redirect("/admin/login")`, que no App Router
 * é lançado como exceção: em caso de sucesso o código depois do `await`
 * nunca roda. Por isso só há tratamento do caminho de erro — não existe
 * "sucesso" a exibir aqui.
 */
export function DeleteAccountPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, startDeleteTransition] = useTransition();

  const canDelete = confirmation.trim().toUpperCase() === DELETE_ACCOUNT_CONFIRMATION && !isDeleting;

  function handleDelete() {
    if (!canDelete) return;
    startDeleteTransition(async () => {
      const result = await deleteAccountAction(confirmation);
      if (result && "error" in result) {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {/* `lg:flex-1`: quando a coluna da direita é a mais curta, é esta caixa
          que cresce para as duas colunas terminarem alinhadas — a mesma cadeia
          aplicada ao card "Interface" do outro lado (ver configuracoes/page.tsx).
          `sm:items-center` já mantém texto e botão centralizados na sobra. */}
      <div className="flex flex-col items-start gap-3 rounded-[1.25rem] border border-error-bg bg-error-bg/30 p-4 sm:flex-row sm:items-center sm:justify-between lg:flex-1 dark:border-error-solid/25 dark:bg-error-solid/10">
        <div>
          <span className="block font-medium text-gray-900 dark:text-gray-50">Excluir conta</span>
          {/* A enumeração antiga ("a conta, a vitrine, os produtos, as fotos
              e as métricas") misturava níveis — a conta contém a vitrine, que
              contém os produtos, que contêm as fotos — e lia como uma rajada.
              O detalhamento completo fica no diálogo de confirmação; aqui
              basta a consequência. */}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Sua conta e sua vitrine são apagadas. Nada pode ser recuperado depois.
          </span>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="w-full shrink-0 rounded-full border border-error-solid px-4 py-2 text-sm font-semibold text-error-solid transition-all duration-150 hover:bg-error-solid hover:text-white active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 sm:w-auto"
        >
          Excluir conta
        </button>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setConfirmation("")}
        // `m-auto` + `dialog-modal`: ver settings-form.tsx — o preflight do
        // Tailwind zera a `margin: auto` que centraliza modais, e a classe
        // anima entrada/saída do diálogo e do fundo.
        className="dialog-modal m-auto rounded-[2rem] bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50"
      >
        <div className="flex max-w-sm flex-col gap-4">
          <div>
            <h2 className="font-display text-xl font-medium text-gray-900 dark:text-gray-50">
              Excluir sua conta para sempre?
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Sua vitrine sai do ar na hora e todo link que você já mandou para clientes deixa de
              funcionar. Produtos, fotos e métricas são apagados junto. Não é possível desfazer nem
              recuperar depois.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="deleteConfirmation" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Digite {DELETE_ACCOUNT_CONFIRMATION} para confirmar
            </label>
            <input
              id="deleteConfirmation"
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className="rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-error-solid focus:ring-2 focus:ring-error-bg placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600"
            />
          </div>

          <form method="dialog" className="flex gap-3">
            <button
              type="submit"
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canDelete}
              onClick={handleDelete}
              className="rounded-full bg-error-solid px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-error-solid-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
            >
              {isDeleting ? "Excluindo…" : "Excluir para sempre"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
