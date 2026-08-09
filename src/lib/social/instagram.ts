/**
 * Normalização do handle de Instagram da loja.
 *
 * O revendedor não-técnico cola o que tem na mão: `@rlesportes`,
 * `instagram.com/rlesportes`, `https://www.instagram.com/rlesportes/?hl=pt`,
 * ou o handle limpo. Todas essas formas significam a mesma conta, e nenhuma
 * delas deve virar um link quebrado na vitrine.
 *
 * A normalização acontece UMA VEZ, no momento de salvar — mesma disciplina do
 * telefone (`normalizeWhatsAppBR`): o banco guarda só o handle canônico, e a
 * vitrine monta a URL a partir dele sem nunca re-interpretar o que foi
 * digitado. Re-derivar no momento de exibir é o padrão que o CLAUDE.md
 * proíbe para o WhatsApp, pelo mesmo motivo: é o último lugar onde se quer um
 * bug silencioso.
 *
 * Devolve `null` para entrada vazia (o campo é opcional) — nunca string
 * vazia, para o banco distinguir "não informou" de "informou vazio".
 */

/**
 * Regras reais do Instagram: 1 a 30 caracteres, apenas letras, números,
 * ponto e underscore. O handle é case-insensitive lá, então guardamos em
 * minúsculas para dois cadastros do mesmo perfil não gerarem valores
 * diferentes.
 */
const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;

export type InstagramResult = { handle: string | null } | { error: string };

export function normalizeInstagramHandle(raw: string | null | undefined): InstagramResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { handle: null };

  let candidate = trimmed.toLowerCase();

  // Remove a URL em qualquer das formas que aparecem coladas do navegador ou
  // do app, com ou sem protocolo, com ou sem `www.`.
  candidate = candidate.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (candidate.startsWith("instagram.com/")) {
    candidate = candidate.slice("instagram.com/".length);
  }

  // Query string (`?hl=pt`, `?igsh=…`) e barra final vêm junto no link
  // compartilhado pelo app — nenhuma das duas faz parte do handle.
  candidate = candidate.split(/[?#]/)[0].replace(/\/+$/, "");

  // O `@` pode estar antes ou depois do resto da limpeza, dependendo de o
  // usuário ter colado "@nome" ou "instagram.com/@nome".
  candidate = candidate.replace(/^@/, "");

  if (!candidate) return { handle: null };

  if (!HANDLE_PATTERN.test(candidate)) {
    return {
      error: "Instagram inválido. Use só o nome de usuário, como rlesportes.",
    };
  }

  return { handle: candidate };
}

/** URL pública do perfil. Fonte única — nunca montar `instagram.com/...` à mão. */
export function instagramProfileUrl(handle: string): string {
  return `https://instagram.com/${handle}`;
}
