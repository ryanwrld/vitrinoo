import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normaliza um número de WhatsApp brasileiro para o formato E.164
 * apenas-dígitos (`55DDXXXXXXXXX`), exigido pela construção do link
 * `https://wa.me/<digitos>` (WPP-01).
 *
 * DEVE ser chamado dentro do Server Action de onboarding (Task 3), UMA ÚNICA
 * VEZ, no momento do save — nunca só no client e nunca re-derivado depois
 * (Armadilha 2 do 01-RESEARCH.md: a Fase 5, que monta o link "Pedir agora",
 * apenas LÊ o valor já normalizado e persistido aqui).
 *
 * Entradas malformadas (DDD ausente/errado, poucos dígitos, string vazia)
 * retornam um erro claro em português — nunca um número parcial ou
 * silenciosamente truncado.
 */
export function normalizeWhatsAppBR(
  input: string
): { e164Digits: string } | { error: string } {
  const phone = parsePhoneNumberFromString(input, "BR");

  if (!phone || !phone.isValid()) {
    return { error: "Número de WhatsApp inválido. Confira o DDD." };
  }

  // phone.number vem como "+5511999999999" — remover o "+" para o formato
  // usado no link wa.me (apenas dígitos).
  return { e164Digits: phone.number.replace("+", "") };
}
