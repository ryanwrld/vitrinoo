import { redirect } from "next/navigation";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { createClient } from "@/lib/supabase/server";
import { buildStoreUrl } from "@/lib/slug/store-url";
import { SettingsForm } from "./settings-form";
import { SlugEditor } from "./slug-editor";
import { QrCodePanel } from "./qr-code-panel";

/**
 * Rota `/configuracoes` (D-05, LOJA-02/03/04 — revisitar e editar). Mesmo
 * gate combinado de auth + onboarding que `/dashboard` (`requireCompletedOnboarding`
 * como primeira linha, nunca uma condição fundida). Página totalmente
 * dinâmica — NUNCA adicionar `"use cache"` aqui, pois o slug/estoque
 * precisa refletir mudanças imediatamente (D-04, 02-RESEARCH.md).
 *
 * Layout de página única com rolagem, três seções empilhadas nesta ordem
 * (D-06, sem abas): Loja+WhatsApp (SettingsForm) → Link e QR Code
 * (SlugEditor + QrCodePanel).
 */
export default async function ConfiguracoesPage() {
  await requireCompletedOnboarding();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug, logo_url, accent_color, tagline, hide_sold_out_default")
    .eq("owner_id", userData.user!.id)
    .single();

  // Defesa contra a janela de corrida entre o guard (requireCompletedOnboarding,
  // que só confirma a EXISTÊNCIA da linha) e esta busca dos dados completos —
  // sem essa checagem, um `store` ausente aqui derrubaria a página com uma
  // exceção não tratada em vez de redirecionar de forma previsível.
  if (!store) {
    redirect("/onboarding");
  }

  const { data: settings } = await supabase
    .from("store_settings")
    .select("whatsapp_e164, message_template")
    .eq("store_id", store.id)
    .single();

  const publicUrl = buildStoreUrl(store.slug);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:py-10">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Configurações da loja</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Identidade visual, link público e QR code da sua vitrine.</p>
      </div>

      <SettingsForm
        store={{
          name: store.name,
          logoUrl: store.logo_url,
          accentColor: store.accent_color,
          tagline: store.tagline,
          hideSoldOutDefault: store.hide_sold_out_default,
        }}
        settings={{
          whatsapp: settings?.whatsapp_e164 ?? "",
          messageTemplate: settings?.message_template ?? "",
        }}
      />

      <SlugEditor currentSlug={store.slug} />
      <QrCodePanel publicUrl={publicUrl} />
    </div>
  );
}
