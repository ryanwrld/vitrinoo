"use client";

import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";

export type ShareVitrineButtonProps = {
  url: string;
  storeName: string | null;
  className?: string;
  /**
   * Texto ao lado do ícone. `null` deixa o botão SÓ com o ícone — usado no
   * cartão de perfil da vitrine pública, onde o rótulo escrito não caberia
   * na linha de ações do celular. Nesse caso `ariaLabel` passa a ser a única
   * descrição que o leitor de tela tem, então ele deixa de ser opcional na
   * prática.
   */
  label?: ReactNode;
  ariaLabel?: string;
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
export function ShareVitrineButton({
  url,
  storeName,
  className,
  label = "Compartilhar vitrine",
  ariaLabel,
}: ShareVitrineButtonProps) {
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
    <button
      type="button"
      onClick={handleShare}
      disabled={isPending}
      aria-label={ariaLabel}
      className={className}
    >
      <Share2 className={label === null ? "h-[18px] w-[18px]" : "h-4 w-4"} aria-hidden="true" />
      {label}
    </button>
  );
}
