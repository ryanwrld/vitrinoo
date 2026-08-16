import { checkSlugAvailability } from "@/lib/settings/actions";

/**
 * Sugestão de slug livre a partir de uma base, tentando `base`, `base2`,
 * `base3`... (sem hífen, consistente com `slugify`/`slugSchema`). Usado
 * pelo onboarding quando o slug preenchido automaticamente a partir do nome
 * colide com uma loja já existente — sugere uma alternativa em vez de
 * deixar o revendedor adivinhar.
 *
 * Roda só no client (importa uma Server Action e a chama sob demanda), uma
 * tentativa por vez — nunca em paralelo, porque cada tentativa só faz
 * sentido depois de saber que a anterior está ocupada.
 */
export async function resolveAvailableSlug(base: string, maxAttempts = 20): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const result = await checkSlugAvailability(candidate);
    if (result.available) {
      return candidate;
    }
  }
  return null;
}
