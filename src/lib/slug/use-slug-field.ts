"use client";

import { useEffect, useState, useTransition } from "react";
import { checkSlugAvailability } from "@/lib/settings/actions";
import { useDebouncedValue } from "@/lib/hooks/use-debounce";
import { slugify } from "./slugify";
import { slugSchema } from "./validation";

export type SlugAvailabilityStatus = "idle" | "checking" | "available" | "taken";

export type SlugFieldState = {
  /** Valor cru digitado — o exibido no input. */
  rawSlug: string;
  setRawSlug: (value: string) => void;
  /** `rawSlug` já normalizado (sem acento, minúsculo, sem hífen). */
  slug: string;
  /** Mensagem de formato inválido, síncrona. `null` quando o formato está ok. */
  formatError: string | null;
  status: SlugAvailabilityStatus;
};

/**
 * Estado do campo "@" (slug): normalização síncrona, validação síncrona de
 * formato, checagem de disponibilidade debounced. Extraído de
 * `settings-form.tsx` (onde vivia inline) para ser reusado também pelo
 * onboarding — comportamento idêntico nos dois lugares, um lugar só pra
 * corrigir se algo mudar.
 *
 * `currentSlug`: base de comparação. Enquanto o slug normalizado for igual
 * a ela, nenhuma checagem de rede dispara — "nada mudou" não precisa
 * verificar disponibilidade de algo que já é seu.
 */
export function useSlugField(currentSlug: string): SlugFieldState {
  const [rawSlug, setRawSlug] = useState(currentSlug);
  const [availability, setAvailability] = useState<"idle" | "available" | "taken">("idle");
  const [isCheckPending, startCheckTransition] = useTransition();

  const slug = slugify(rawSlug);
  const debouncedSlug = useDebouncedValue(slug, 400);

  const slugFormatResult = slugSchema.safeParse(slug);
  const formatError = slugFormatResult.success
    ? null
    : slugFormatResult.error.issues[0]?.message ?? null;

  // Formato é checado de forma síncrona; só a checagem de REDE é debounced.
  const needsSlugCheck = slugFormatResult.success && debouncedSlug !== currentSlug;
  const status: SlugAvailabilityStatus = !needsSlugCheck
    ? "idle"
    : isCheckPending
      ? "checking"
      : availability;

  useEffect(() => {
    if (!needsSlugCheck) return;

    let cancelled = false;
    startCheckTransition(async () => {
      const result = await checkSlugAvailability(debouncedSlug);
      if (cancelled) return;
      setAvailability(result.available ? "available" : "taken");
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, currentSlug, needsSlugCheck]);

  return { rawSlug, setRawSlug, slug, formatError, status };
}
