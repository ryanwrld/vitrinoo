import { z } from "zod";
import { DESCRIPTION_MAX_CHARS, parseRichText, richTextToPlainText } from "@/lib/rich-text/document";

/**
 * Schema de validação do cadastro/edição de produto (PROD-01/PROD-02,
 * D-05..D-09). Revalidado SEMPRE dentro do Server Action `saveProduct`
 * (nunca confiar só no client) — ver 03-PATTERNS.md §Validation convention,
 * mesmo espírito de `onboardingSchema`.
 *
 * `price` fica como string bruta (min 1) — o parsing decimal acontece no
 * servidor via `parseBRLPrice` (03-RESEARCH.md Pitfall 3), nunca
 * `z.number()` sobre um input com vírgula decimal.
 */
export const productSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do modelo"),
  brand: z.string().trim().min(1, "Selecione a marca"),
  brandOther: z.string().trim().optional(),
  line: z.string().trim().optional(),
  sole: z.string().trim().optional(),
  category: z.string().trim().optional(),
  fulfillment: z.enum(["sob_encomenda", "pronta_entrega", "ambos"]).optional(),
  price: z.string().trim().min(1, "Informe o preço"),
  /**
   * Descrição formatada — JSON do editor (ou texto puro legado). O limite é
   * medido sobre o TEXTO PURO, nunca sobre a string bruta: o JSON de
   * formatação pesa muito mais que o texto e faria o teto variar conforme a
   * formatação usada.
   */
  description: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => {
        const doc = parseRichText(value);
        return !doc || richTextToPlainText(doc).length <= DESCRIPTION_MAX_CHARS;
      },
      { message: `A descrição pode ter no máximo ${DESCRIPTION_MAX_CHARS} caracteres` }
    ),
  /**
   * Tamanhos escolhidos (D-01), grid 36-45 (03-RESEARCH.md §Code Examples).
   * Adicionado no Plan 03-03 — necessário para tipar `useFieldArray` (name
   * "sizes") em size-grid.tsx/product-form.tsx; a mesma forma é reusada no
   * servidor (`productSchema.shape.sizes.safeParse`) para revalidar o JSON
   * recebido em `saveProduct` antes de inserir em `product_sizes`.
   */
  sizes: z.array(z.object({ size: z.number().int().min(36).max(45), available: z.boolean() })).optional(),
  /**
   * Visibilidade de esgotado por produto (D-09/D-10, Plan 04-05). Três
   * estados via select: "" (herdar o padrão global da loja — D-10, mapeia
   * para `null` no parse), "false" (sempre mostrar esmaecido), "true"
   * (ocultar da vitrine pública quando esgotado). NUNCA `z.boolean()` — o
   * terceiro estado ("sem exceção configurada") não existe em boolean puro.
   */
  hideWhenSoldOut: z.enum(["", "true", "false"]).optional(),
});

export type ProductInput = z.infer<typeof productSchema>;
