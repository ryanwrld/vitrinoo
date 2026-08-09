"use client";

import Link from "next/link";
import clsx from "clsx";
import { getContrastTextColor } from "@/lib/color/contrast";

/**
 * Ação do empty state de "filtro sem resultado". Existe como Client
 * Component só por causa de `getContrastTextColor` aplicado a um estilo
 * inline com a cor da loja — a navegação em si é um `<Link>` real para
 * `/${slug}` (sem query string), nunca um handler de JS: a mesma disciplina
 * de âncora real que vale para o CTA do WhatsApp, já que a vitrine é
 * consumida dentro de webviews in-app.
 */
export function ClearFiltersButton({ slug, accentColor }: { slug: string; accentColor: string }) {
  const isDarkText = getContrastTextColor(accentColor) === "dark";

  return (
    <Link
      href={`/${slug}`}
      scroll={false}
      style={{ backgroundColor: accentColor }}
      className={clsx(
        "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
        isDarkText ? "text-gray-900" : "text-white"
      )}
    >
      Limpar filtros
    </Link>
  );
}
