"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

/**
 * Fallback de imagem com erro de carregamento (VITR-05). Client Component
 * porque `onError` do next/image exige handler de evento — um Server
 * Component não pode registrar isso diretamente (04-RESEARCH.md §Code
 * Examples). Reusado tanto pelo card de produto quanto pelo logo do hero da
 * loja (mesma robustez, sem custo extra).
 *
 * Tokens de cor (#E7F2FD/#6B6B6B) e ícone ImageOff idênticos ao fallback já
 * usado em src/app/(admin)/produtos/product-list.tsx — nenhuma nova
 * dependência.
 */
export function ImageWithFallback({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(!src);

  if (errored || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-100">
        <ImageOff className="h-8 w-8 text-gray-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="rounded-xl object-cover"
      onError={() => setErrored(true)}
    />
  );
}
