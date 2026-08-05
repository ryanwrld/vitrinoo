/**
 * Texto que o usuário precisa digitar para confirmar a exclusão da conta.
 *
 * Vive num módulo separado de `actions.ts` porque aquele arquivo é
 * `"use server"`, e um módulo `"use server"` só pode exportar funções async
 * — exportar uma constante de lá quebra o build. Cliente e servidor validam
 * o mesmo valor: a checagem do servidor é a que vale, a do cliente só evita
 * a viagem inútil.
 */
export const DELETE_ACCOUNT_CONFIRMATION = "EXCLUIR";
