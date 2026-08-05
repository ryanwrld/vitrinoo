import { z } from "zod";

/**
 * Schema de validação de formato de slug (D-02, LOJA-02). Segue a convenção
 * de `src/lib/validation/onboarding.ts`: regex nomeada + `.trim()` + mensagem
 * em português + tipo inferido exportado. Revalidado sempre no servidor
 * (Server Action), nunca só no client — mesma disciplina do restante do
 * projeto.
 *
 * O texto de erro de charset ("Use apenas letras, números e hífens (3 a 30
 * caracteres).") é o contrato de copy exato do 02-UI-SPEC.md — não parafrasear.
 */
const SLUG_CHARSET_REGEX = /^[a-z0-9-]+$/;

/**
 * Nomes que NÃO podem virar slug de loja, porque a vitrine pública mora na
 * raiz (`vitrinoo.app/<slug>`) e disputaria o caminho com uma rota real do
 * app. O Next.js dá prioridade à rota estática, então uma loja com um destes
 * slugs ficaria permanentemente inacessível — e o revendedor não teria como
 * descobrir por quê.
 *
 * A lista é curta de propósito: mover o painel inteiro para `/admin/*`
 * resolveu a colisão por construção, em vez de exigir uma denylist que
 * cresce a cada rota nova. `admin` está aqui porque é justamente o segmento
 * que sobrou na raiz; `api` e `_next`/`static` são reservas do próprio
 * framework/hospedagem que nunca devem ser vendíveis como link de loja.
 */
const RESERVED_SLUGS = new Set(["admin", "api", "static", "public", "www"]);

export const slugSchema = z
  .string()
  .trim()
  .min(3, "O link precisa ter entre 3 e 30 caracteres")
  .max(30, "O link precisa ter entre 3 e 30 caracteres")
  .regex(SLUG_CHARSET_REGEX, "Use apenas letras, números e hífens (3 a 30 caracteres).")
  .refine(
    (value) => !value.startsWith("-") && !value.endsWith("-"),
    "O link não pode começar ou terminar com hífen"
  )
  .refine((value) => !RESERVED_SLUGS.has(value), "Esse link é reservado — escolha outro.");

export type SlugInput = z.infer<typeof slugSchema>;
