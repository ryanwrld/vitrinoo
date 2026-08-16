"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { exportAccountDataAction } from "@/lib/account/actions";

/**
 * Baixa um JSON com loja, configurações e catálogo — ver
 * `exportAccountDataAction` para o porquê do formato.
 *
 * O arquivo é montado aqui (Blob + link temporário) em vez de vir por uma
 * rota de download: assim não existe arquivo gerado no servidor pra
 * expirar, limpar ou proteger com token.
 */
export function ExportDataPanel() {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportAccountDataAction();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      // Sem o revoke o Blob fica retido em memória até a aba fechar.
      URL.revokeObjectURL(url);

      toast.success("Download iniciado!");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-[1.25rem] border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="block font-medium text-gray-900 dark:text-gray-50">
            Baixar uma cópia
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Seus produtos, tamanhos, preços e configurações num arquivo só.
          </span>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isPending}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 sm:w-auto dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isPending ? "Preparando…" : "Baixar dados"}
        </button>
      </div>
    </div>
  );
}
