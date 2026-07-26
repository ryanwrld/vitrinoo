/**
 * Link do WhatsApp de suporte — compartilhado entre o botão "Falar com
 * suporte" da sidebar (admin-sidebar.tsx) e a busca global (search/registry).
 * Mesma regra do CTA "Pedir agora" da vitrine (CLAUDE.md): monta a string
 * inteira e roda encodeURIComponent uma única vez sobre ela.
 *
 * Mensagem interpolada com o nome da loja pra a conversa já chegar
 * identificada; termina em "..." (não formulário) porque é chat — o lojista
 * complementa com uma segunda mensagem descrevendo o problema.
 */
export const SUPPORT_WHATSAPP_NUMBER = "5595984129576";

export function buildSupportWhatsAppHref(storeName: string | null): string {
  const identification = storeName ? `Sou da loja ${storeName}` : "Sou um lojista";
  const message = `Olá! ${identification} e estou usando o Vitrinoo. Preciso de uma ajuda sua...`;
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
