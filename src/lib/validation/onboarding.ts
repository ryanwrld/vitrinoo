import { z } from "zod";

/**
 * Template padrão de mensagem WhatsApp (copy definida em PROJECT.md).
 * Pré-preenche o campo de template no wizard (Pergunta em Aberto #2 do
 * 01-RESEARCH.md: pré-popular, editável — reduz fricção para o revendedor
 * não-técnico, conforme a diretriz "poucos campos obrigatórios, percebido
 * como rápido" do 01-CONTEXT.md).
 */
export const DEFAULT_MESSAGE_TEMPLATE = `Olá! Vi sua vitrine e tenho interesse no seguinte produto:

Modelo: {modelo}
Solado: {solado}
Tamanho: {tamanho}
Preço: R$ {preço}

Poderia confirmar a disponibilidade?`;

/** Placeholders obrigatórios no template de mensagem (WPP-02). */
export const REQUIRED_TEMPLATE_PLACEHOLDERS = [
  "{modelo}",
  "{solado}",
  "{tamanho}",
  "{preço}",
] as const;

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Schema de validação do onboarding (LOJA-01, WPP-01, WPP-02). Revalidado
 * SEMPRE dentro do Server Action `saveOnboarding` (nunca confiar só no
 * client) — ver 01-PATTERNS.md §Validation convention.
 *
 * O campo `whatsapp` aceita a string bruta digitada pelo revendedor — a
 * normalização E.164 acontece no servidor via `normalizeWhatsAppBR`
 * (Task 2), nunca aqui, mantendo a separação entre "formato aceitável de
 * entrada" (Zod) e "normalização de domínio" (função pura dedicada).
 */
export const onboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da loja"),
  accentColor: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, "Cor inválida (use o formato #RRGGBB)")
    .optional()
    .or(z.literal("")),
  tagline: z
    .string()
    .trim()
    .max(100, "A frase deve ter no máximo 100 caracteres")
    .optional()
    .or(z.literal("")),
  whatsapp: z
    .string()
    .trim()
    .min(1, "Informe o número de WhatsApp"),
  messageTemplate: z
    .string()
    .trim()
    .min(1, "O template de mensagem não pode ficar vazio")
    .refine(
      (value) => REQUIRED_TEMPLATE_PLACEHOLDERS.every((placeholder) => value.includes(placeholder)),
      `O template precisa conter os placeholders ${REQUIRED_TEMPLATE_PLACEHOLDERS.join(", ")}`
    ),
  /**
   * Preferência global de visibilidade de esgotado (D-09, Plan 04-05).
   * Optional: o wizard de onboarding (Fase 1) não define este campo — a
   * coluna `stores.hide_sold_out_default` já nasce com `true` via default
   * do banco (migration 0011). Só `settings-form.tsx` (/configuracoes)
   * define este valor explicitamente.
   */
  hideSoldOutDefault: z.enum(["true", "false"]).optional(),
  /**
   * Instagram da loja (opcional) — exibido como linha de link no cartão de
   * perfil da vitrine.
   *
   * A validação AQUI é só de comprimento: quem decide se o valor é um handle
   * válido é `normalizeInstagramHandle` (src/lib/social/instagram.ts), que
   * aceita as várias formas que o revendedor cola na prática
   * (`@nome`, `instagram.com/nome`, URL completa com query string) e reduz
   * todas ao handle canônico. Repetir aquele regex aqui criaria duas
   * verdades sobre o que é aceitável, e a do formulário rejeitaria coisas
   * que o servidor sabe normalizar — o pior dos dois mundos para um usuário
   * não-técnico que colou o link do próprio perfil.
   *
   * Optional pelo mesmo motivo de `hideSoldOutDefault`: o wizard de
   * onboarding não define este campo.
   */
  instagram: z
    .string()
    .trim()
    .max(120, "Instagram muito longo — use só o nome de usuário")
    .optional()
    .or(z.literal("")),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
