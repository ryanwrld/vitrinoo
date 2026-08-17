import { z } from "zod";

/**
 * Descrição do produto em texto formatado (negrito, itálico, listas,
 * alinhamento) — usada no editor do painel e na vitrine pública.
 *
 * DECISÃO: o conteúdo é persistido como o JSON do TipTap (string), NÃO como
 * HTML. Motivo: o valor é escrito pelo revendedor e renderizado numa página
 * pública sem autenticação. Guardar HTML obrigaria a sanitizar
 * (dependência extra) e a usar `dangerouslySetInnerHTML` no render — um
 * único furo na sanitização vira XSS na vitrine. Com JSON validado por este
 * schema e renderizado por `<RichText>` como elementos React, não existe
 * caminho de injeção: qualquer nó/marca fora da allowlist abaixo é
 * descartado no parse, e nada nunca vira HTML cru.
 *
 * A allowlist é deliberadamente curta e espelha exatamente a barra do editor
 * (`description-editor.tsx`). Não há cor de texto: a descrição herda a cor do
 * tema da vitrine, o que garante legibilidade no claro e no escuro.
 *
 * Compatibilidade: a coluna `products.description` já tem descrições em texto
 * puro salvas antes desta feature. `parseRichText` detecta esse caso e
 * converte para um documento equivalente (um parágrafo por linha), então
 * nenhum dado antigo se perde e nenhuma migração de banco é necessária.
 */

const ALIGNMENTS = ["left", "center", "right", "justify"] as const;

/**
 * Teto de caracteres da descrição (texto puro, sem contar formatação).
 * Existe por dois motivos: uma descrição gigante empurra as pílulas de
 * tamanho e o CTA do WhatsApp para longe no popup da vitrine, e o cliente
 * final não lê parede de texto no celular. Aplicado nos DOIS lados — o
 * editor bloqueia a digitação além do limite e o servidor revalida.
 */
export const DESCRIPTION_MAX_CHARS = 300;

const markSchema = z.object({
  type: z.enum(["bold", "italic"]),
});

const textNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(markSchema).optional(),
});

const paragraphSchema = z.object({
  type: z.literal("paragraph"),
  attrs: z.object({ textAlign: z.enum(ALIGNMENTS).nullable().optional() }).optional(),
  content: z.array(textNodeSchema).optional(),
});

const headingSchema = z.object({
  type: z.literal("heading"),
  attrs: z.object({
    level: z.union([z.literal(2), z.literal(3)]),
    textAlign: z.enum(ALIGNMENTS).nullable().optional(),
  }),
  content: z.array(textNodeSchema).optional(),
});

const listItemSchema = z.object({
  type: z.literal("listItem"),
  content: z.array(paragraphSchema).optional(),
});

const bulletListSchema = z.object({
  type: z.literal("bulletList"),
  content: z.array(listItemSchema).optional(),
});

const orderedListSchema = z.object({
  type: z.literal("orderedList"),
  content: z.array(listItemSchema).optional(),
});

/* Discriminada por `type` (não `z.union`): é o que dá narrowing correto no
   TypeScript ao percorrer os blocos no renderer. */
const blockSchema = z.discriminatedUnion("type", [
  paragraphSchema,
  headingSchema,
  bulletListSchema,
  orderedListSchema,
]);

export const richTextDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(blockSchema).optional(),
});

export type RichTextDoc = z.infer<typeof richTextDocSchema>;
export type RichTextBlock = z.infer<typeof blockSchema>;
export type RichTextText = z.infer<typeof textNodeSchema>;

/** Documento vazio — o que o editor produz quando o revendedor apaga tudo. */
export function emptyRichTextDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Texto puro (formato legado) → documento, um parágrafo por linha. */
function legacyTextToDoc(text: string): RichTextDoc {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map<RichTextBlock>((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }));

  return paragraphs.length > 0 ? { type: "doc", content: paragraphs } : emptyRichTextDoc();
}

/**
 * Lê o valor cru da coluna `description` e devolve um documento válido.
 * Retorna `null` quando não há descrição utilizável — inclusive para JSON
 * corrompido/fora da allowlist, que NUNCA é renderizado parcialmente.
 */
export function parseRichText(value: string | null | undefined): RichTextDoc | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (!trimmed.startsWith("{")) {
    const doc = legacyTextToDoc(trimmed);
    return isRichTextEmpty(doc) ? null : doc;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const parsed = richTextDocSchema.safeParse(raw);
  if (!parsed.success) return null;

  return isRichTextEmpty(parsed.data) ? null : parsed.data;
}

/** `true` quando o documento não tem nenhum texto visível. */
export function isRichTextEmpty(doc: RichTextDoc): boolean {
  return richTextToPlainText(doc).trim().length === 0;
}

/** Versão em texto puro — usada para checar vazio e para limites de tamanho. */
export function richTextToPlainText(doc: RichTextDoc): string {
  const lines: string[] = [];

  for (const block of doc.content ?? []) {
    if (block.type === "bulletList" || block.type === "orderedList") {
      for (const item of block.content ?? []) {
        for (const paragraph of item.content ?? []) {
          lines.push((paragraph.content ?? []).map((node) => node.text).join(""));
        }
      }
      continue;
    }
    lines.push((block.content ?? []).map((node) => node.text).join(""));
  }

  return lines.join("\n");
}

/**
 * Normaliza o que veio do formulário para o que vai ao banco. Chamada no
 * Server Action — o cliente nunca é a última palavra sobre o formato.
 *
 * Texto puro continua texto puro (só aparado): quem escreve pelo editor já
 * manda JSON, e reescrever uma descrição simples como JSON mudaria o formato
 * de dados sem ganho nenhum — a leitura (`parseRichText`) aceita os dois.
 * Quando é JSON, volta canonicalizado pela allowlist: nó ou marca fora dela
 * é descartado aqui, no servidor, antes de chegar ao banco.
 */
export function normalizeRichTextForStorage(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;

  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  const doc = parseRichText(trimmed);
  return doc ? JSON.stringify(doc) : null;
}
