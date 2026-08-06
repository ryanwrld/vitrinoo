"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { changePasswordAction } from "@/lib/account/actions";

/**
 * Troca de senha no lugar, sem email — ver `changePasswordAction`.
 *
 * Os campos vivem num `<dialog>` modal, não expandindo o card: a primeira
 * versão abria o formulário inline e o card "Acesso" CRESCIA, desalinhando
 * a grade de duas colunas (o card "Seus dados" do outro lado ficava com
 * sobra embaixo). Um modal mantém a altura do card constante em qualquer
 * estado — e o foco preso na tarefa, que é o certo pra uma ação rara e
 * sensível. Mesmo padrão do diálogo de exclusão de conta.
 */
export function ChangePasswordPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  // Confirmação NÃO é formalidade aqui: o email de recuperação do plano free
  // do Supabase não é entregue, então um erro de digitação na nova senha
  // trancaria o revendedor fora da conta sem nenhum caminho de volta.
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword === newPassword &&
    !isPending;

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await changePasswordAction(currentPassword, newPassword);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Senha alterada!");
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="block font-medium text-gray-900 dark:text-gray-50">Senha</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Alterar a senha de acesso da sua conta.
            </span>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className="w-full shrink-0 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:w-auto dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
          >
            Alterar
          </button>
        </div>
      </div>

      {/* `onClose` limpa os campos: cobre TODAS as formas de fechar (botão,
          Esc, clique fora), não só o "Cancelar" — senha digitada não pode
          ficar em memória num formulário reaberto depois. */}
      <dialog
        ref={dialogRef}
        onClose={resetFields}
        // `m-auto` + `dialog-modal`: ver delete-account-panel.tsx — o
        // preflight do Tailwind zera a `margin: auto` que centraliza modais,
        // e a classe anima entrada/saída do diálogo e do fundo.
        className="dialog-modal m-auto w-full max-w-sm rounded-lg bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50"
      >
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-xl font-medium text-gray-900 dark:text-gray-50">
              Alterar sua senha
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Você continua conectado aqui depois de salvar.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="currentPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Senha atual
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="newPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Nova senha
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            />
            {/* Mesmo mínimo do cadastro (signUpSchema) — dito antes de tentar
                salvar, não como erro depois. */}
            <span className="text-xs text-gray-500 dark:text-gray-400">Pelo menos 8 caracteres.</span>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Repita a nova senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            />
            {mismatch && <span className="text-xs text-error-fg">As senhas não são iguais.</span>}
          </div>

          <form method="dialog" className="flex justify-end gap-3">
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
            >
              {isPending ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
