"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsAppBR } from "@/lib/phone/normalize-br";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { slugSchema } from "@/lib/slug/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SettingsActionResult = { error: string } | { success: true };

/**
 * Assinaturas de magic bytes por content-type aceito para o logo — mesma
 * checagem de src/lib/onboarding/actions.ts (Domínio de Segurança do
 * 01-RESEARCH.md), duplicada aqui em vez de importada porque
 * `validateLogoFile` não é exportada e este plano (02-03) não modifica
 * src/lib/onboarding/actions.ts (fora do `files_modified` do 02-03-PLAN.md).
 */
const LOGO_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function logoExtension(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

async function validateLogoFile(file: File): Promise<{ error: string } | null> {
  const signature = LOGO_MAGIC_BYTES[file.type];
  if (!signature) {
    return { error: "Logo deve ser uma imagem PNG, JPEG ou WebP." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo excede o limite de 5MB." };
  }
  const headerBytes = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  const matchesSignature = signature.every((byte, index) => headerBytes[index] === byte);
  if (!matchesSignature) {
    return { error: "Arquivo de logo inválido (conteúdo não corresponde a uma imagem)." };
  }
  return null;
}

/**
 * Sequência "getUser() → localizar loja por owner_id" — mesmo padrão de três
 * passos de `saveOnboarding` (src/lib/onboarding/actions.ts linhas 85-100),
 * mandatório para as três Server Actions deste arquivo (02-PATTERNS.md
 * §Owner-scoped store lookup). Extraído aqui para não triplicar o mesmo
 * bloco em cada action.
 */
async function getOwnedStore(): Promise<
  | { error: string }
  | { supabase: SupabaseClient<Database>; userId: string; storeId: string }
> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const { data: store, error: storeLookupError } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", userData.user.id)
    .single();

  if (storeLookupError || !store) {
    return { error: "Não foi possível localizar sua loja. Tente novamente." };
  }

  return { supabase, userId: userData.user.id, storeId: store.id };
}

/**
 * Checagem de disponibilidade de slug em tempo real (D-03). A policy RLS de
 * `stores` (`owner_id = auth.uid()`, 0001_init_stores_rls.sql) bloqueia
 * qualquer SELECT direto cross-tenant, então a única forma correta de
 * responder "esse slug já é de outro revendedor" é via o RPC
 * `is_slug_available` (SECURITY DEFINER, boolean-only — 02-RESEARCH.md
 * Pitfall 1, Threat T-02-03).
 */
export async function checkSlugAvailability(
  candidateSlug: string
): Promise<{ available: boolean; error?: string }> {
  const parsed = slugSchema.safeParse(candidateSlug);
  if (!parsed.success) {
    return { available: false, error: parsed.error.issues[0]?.message ?? "Link inválido" };
  }

  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { available: false, error: owned.error };
  }

  const { data, error } = await owned.supabase.rpc("is_slug_available", {
    candidate_slug: parsed.data,
  });

  if (error) {
    return { available: false, error: "Não foi possível verificar o link agora." };
  }

  return { available: Boolean(data) };
}

/**
 * Troca do slug público da loja (D-08, confirmação destrutiva no client). A
 * UNIQUE constraint de `stores.slug` (0001) é a rede de segurança real
 * contra a corrida TOCTOU entre a checagem debounced e o save
 * (02-RESEARCH.md Pitfall 3, Threat T-02-05) — o código `23505` do Postgres
 * é traduzido aqui para a mensagem amigável do Copywriting Contract, nunca
 * repassado cru.
 */
export async function updateStoreSlug(newSlug: string): Promise<SettingsActionResult> {
  const parsed = slugSchema.safeParse(newSlug);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Link inválido" };
  }

  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  const { error } = await owned.supabase.from("stores").update({ slug: parsed.data }).eq("id", owned.storeId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Este link já está em uso. Escolha outro." };
    }
    return { error: "Não foi possível salvar o novo link. Tente novamente." };
  }

  return { success: true };
}

/**
 * Salva edições pós-onboarding de identidade da loja + WhatsApp (Fase 2,
 * Goal #4 — "revisitar e editar"). Espelha `saveOnboarding` (reusa
 * `onboardingSchema` por D-07 e `normalizeWhatsAppBR`), mas NUNCA seta
 * `onboarding_completed_at` nem faz `redirect()` — é um save em página, não
 * um passo de wizard terminal.
 */
export async function saveStoreSettings(formData: FormData): Promise<SettingsActionResult> {
  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    accentColor: formData.get("accentColor") ?? "",
    tagline: formData.get("tagline") ?? "",
    whatsapp: formData.get("whatsapp"),
    messageTemplate: formData.get("messageTemplate"),
    hideSoldOutDefault: formData.get("hideSoldOutDefault") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const phoneResult = normalizeWhatsAppBR(parsed.data.whatsapp);
  if ("error" in phoneResult) {
    return { error: phoneResult.error };
  }

  const owned = await getOwnedStore();
  if ("error" in owned) {
    return { error: owned.error };
  }

  // D-11: precisa do valor ATUAL antes do update, para só resetar as
  // exceções por produto quando a preferência global REALMENTE muda (nunca
  // num resubmit do formulário sem alteração deste campo específico).
  const { data: currentStore } = await owned.supabase
    .from("stores")
    .select("hide_sold_out_default")
    .eq("id", owned.storeId)
    .single();
  const previousHideSoldOutDefault = currentStore?.hide_sold_out_default ?? false;
  const nextHideSoldOutDefault =
    parsed.data.hideSoldOutDefault === undefined
      ? previousHideSoldOutDefault
      : parsed.data.hideSoldOutDefault === "true";

  // A logo sobe CRUA, sem compressão/redimensionamento — diferente das fotos
  // de produto, que passam por `browser-image-compression` no uploader. Isso
  // é decisão consciente de escopo (confirmada pelo usuário), NÃO um passo
  // esquecido: só `validateLogoFile` (tipo + teto de 5MB) roda aqui.
  //
  // Consequência conhecida e aceita: se o lojista enviar uma imagem de baixa
  // resolução, o avatar do painel (`StoreAvatar`) aparece pixelado e nenhum
  // ajuste de exibição resolve — o teto é a resolução da origem. Antes de
  // "corrigir" isso achando que é bug, confirmar que o escopo mudou.
  let logoUrl: string | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    const validationError = await validateLogoFile(logoFile);
    if (validationError) {
      return validationError;
    }

    const path = `${owned.userId}/logo.${logoExtension(logoFile.type)}`;
    const { error: uploadError } = await owned.supabase.storage
      .from("store-assets")
      .upload(path, logoFile, { contentType: logoFile.type, upsert: true });

    if (uploadError) {
      return { error: "Não foi possível enviar o logo. Tente novamente." };
    }

    // `upsert: true` grava sempre no mesmo caminho, então a URL pública
    // nunca muda de um upload pro outro — sem um cache-buster o navegador
    // (e o CDN da Vercel/Supabase) continuam servindo a logo antiga em
    // cache mesmo depois da troca. `Date.now()` aqui é só um valor opaco
    // pra invalidar cache, nunca comparado/persistido como timestamp real.
    const { data: publicUrlData } = owned.supabase.storage.from("store-assets").getPublicUrl(path);
    logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
  }

  const { error: storeUpdateError } = await owned.supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      accent_color: parsed.data.accentColor || null,
      tagline: parsed.data.tagline || null,
      hide_sold_out_default: nextHideSoldOutDefault,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    })
    .eq("id", owned.storeId);

  if (storeUpdateError) {
    return { error: "Não foi possível salvar os dados da loja. Tente novamente." };
  }

  // D-11: a preferência global REALMENTE mudou -> reseta (para null) todas
  // as exceções por produto já configuradas nesta loja, para que passem a
  // herdar o novo padrão. Nunca dispara num resubmit sem mudança real deste
  // campo (comparação feita ANTES do update, acima).
  if (nextHideSoldOutDefault !== previousHideSoldOutDefault) {
    const { error: resetError } = await owned.supabase
      .from("products")
      .update({ hide_when_sold_out: null })
      .eq("store_id", owned.storeId);

    if (resetError) {
      return { error: "Configuração salva, mas não foi possível atualizar as exceções por produto. Tente novamente." };
    }
  }

  const { error: settingsUpdateError } = await owned.supabase
    .from("store_settings")
    .update({
      whatsapp_e164: phoneResult.e164Digits,
      message_template: parsed.data.messageTemplate,
    })
    .eq("store_id", owned.storeId);

  if (settingsUpdateError) {
    return { error: "Não foi possível salvar a configuração de WhatsApp. Tente novamente." };
  }

  // O layout do painel (src/app/(admin)/(painel)/layout.tsx) busca
  // name/slug/logo_url uma vez por navegação e passa pra AdminSidebar (props)
  // e pro StoreIdentityProvider (contexto usado por HeaderActions em cada
  // página) — sem revalidar, o avatar fica preso nos dados antigos até uma
  // navegação completa, mesmo com o save OK.
  revalidatePath("/", "layout");

  return { success: true };
}
