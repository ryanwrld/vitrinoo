"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Avatar circular do painel admin — usa a logo da loja (`logo_url`) quando
 * configurada em Configurações > Identidade visual; cai para as iniciais do
 * nome da loja quando não há logo ou o carregamento falha. Compartilhado
 * entre `HeaderActions` (desktop) e `AdminSidebar` (topo mobile) para não
 * duplicar a lógica de fallback.
 */
export function StoreAvatar({
  storeName,
  logoUrl,
}: {
  storeName: string | null;
  logoUrl?: string | null;
}) {
  const [errored, setErrored] = useState(false);

  const initials = storeName
    ? storeName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join("")
    : "?";

  if (logoUrl && !errored) {
    return (
      <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {/* sizes bem maior que o tamanho real exibido (24px) de propósito:
            força o Next a gerar uma versão de resolução mais alta e deixa o
            próprio navegador reduzi-la com suavização, em vez de gerar já um
            arquivo minúsculo — isso evita o aspecto pixelado num avatar tão
            pequeno. 160px cobre até telas de celular com pixel density alta
            (3x) sem esforço. quality=100 tira a compressão padrão (75), que
            ficava visível demais nesse tamanho. A partir daqui o teto é a
            resolução da foto que o lojista enviou — se a origem já for
            pequena/baixa qualidade, nenhum ajuste aqui resolve. */}
        <Image
          src={logoUrl}
          alt={storeName ?? "Logo da loja"}
          fill
          sizes="160px"
          quality={100}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: "#0D21A1" }}
    >
      {initials}
    </div>
  );
}
