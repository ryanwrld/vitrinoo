"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { signOutAllDevicesAction } from "@/lib/account/actions";

/**
 * "Sair de todos os dispositivos" — derruba a sessão em todo lugar,
 * inclusive aqui.
 *
 * Passa por confirmação (mesmo `<dialog>` do resto do painel) porque o
 * efeito é maior do que o rótulo sugere: quem clica esperando "limpar os
 * outros" também é desconectado deste navegador na hora. Um clique
 * acidental num botão que só diz "sair de todos" custaria um novo login sem
 * aviso.
 */
export function SignOutAllPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await signOutAllDevicesAction();
      // Sucesso termina em `redirect` (exceção no App Router), então só o
      // caminho de erro chega aqui.
      if (result && "error" in result) {
        toast.error(result.error);
        dialogRef.current?.close();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="block font-medium text-gray-900 dark:text-gray-50">
            Sair de todos os dispositivos
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Encerra a sessão em qualquer celular ou computador onde você entrou.
          </span>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:w-auto dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair de todos
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="dialog-modal m-auto rounded-lg bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50"
      >
        <div>
          <h2 className="font-display text-xl font-medium text-gray-900 dark:text-gray-50">
            Sair de todos os dispositivos?
          </h2>
          <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Você também será desconectado aqui e vai precisar entrar de novo. Sua vitrine
            continua no ar normalmente.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleConfirm}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {isPending ? "Encerrando…" : "Sim, sair de todos"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
