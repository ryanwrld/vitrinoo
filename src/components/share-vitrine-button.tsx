"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";

export type ShareVitrineButtonProps = {
  url: string;
  storeName: string | null;
  className?: string;
};

/**
 * Botão "Compartilhar vitrine" do CTA do dashboard (widget "Atividades
 * recentes"). Dispara o share sheet NATIVO do dispositivo (WhatsApp,
 * Mensagens, AirDrop, Copiar...) via Web Share API — não é mais um simples
 * `<a href>` pra `/[slug]`, porque "compartilhar" != "abrir a vitrine".
 * Fallback pra `copyText` + toast (mesmo padrão de `qr-code-panel.tsx`) em
 * navegadores sem suporte a `navigator.share` (a maioria dos desktops).
 * `AbortError` (usuário fechou o share sheet sem escolher nada) é
 * silenciado de propósito — não é uma falha, é o usuário desistindo.
 */
export function ShareVitrineButton({ url, storeName, className }: ShareVitrineButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleShare() {
    startTransition(async () => {
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: storeName ? `Vitrine ${storeName}` : "Minha vitrine", url });
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          // segue pro fallback de copiar o link abaixo
        }
      }

      const ok = await copyText(url);
      if (ok) {
        toast.success("Link da vitrine copiado!");
      } else {
        toast.error("Não foi possível compartilhar. Copie o link manualmente.");
      }
    });
  }

  return (
    <button type="button" onClick={handleShare} disabled={isPending} className={className}>
      <Share2 className="h-4 w-4" aria-hidden="true" />
      Compartilhar vitrine
    </button>
  );
}
