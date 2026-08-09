"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsAppBR } from "@/lib/phone/normalize-br";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { slugSchema } from "@/lib/slug/validation";
import { normalizeInstagramHandle } from "@/lib/social/instagram";
import { resolveCoverRatio } from "@/lib/store/cover-ratio";
import { resolveCoverFrame } from "@/lib/store/cover-frame";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SettingsActionResult = { error: string } | { success: true };

/**
 * Assinaturas de magic bytes por content-type aceito — mesma checagem de
 * src/lib/onboarding/actions.ts (Domínio de Segurança do 01-RESEARCH.md),
 * duplicada aqui em vez de importada porque `validateLogoFile` não é
 * exportada lá e este arquivo não modifica o onboarding.
 *
 * Validar o CONTEÚDO e não só o `type` declarado é o ponto: `file.type` vem
 * do navegador e é trivial de forjar — um .php renomeado para .png chega com
 * `image/png` no cabeçalho. Os primeiros bytes não mentem.
 */
const IMAGE_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function imageExtension(contentType: string): string {
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

/**
 * `label` entra nas mensagens de erro ("Logo deve ser…" / "Capa deve ser…").
 * Sem ele, o revendedor que errou a capa receberia um aviso falando de logo
 * e iria mexer no campo errado — os dois uploads convivem na mesma tela.
 */
async function validateImageFile(file: File, label: string): Promise<{ error: string } | null> {
  const signature = IMAGE_MAGIC_BYTES[file.type];
  if (!signature) {
    return { error: `${label} deve ser uma imagem PNG, JPEG ou WebP.` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `${label} excede o limite de 5MB.` };
  }
  const headerBytes = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  const matchesSignature = signature.every((byte, index) => headerBytes[index] === byte);
  if (!matchesSignature) {
    return { error: `Arquivo de ${label.toLowerCase()} inválido (conteúdo não corresponde a uma imagem).` };
  }
  return null;
}

/**
 * Sobe um asset da loja e devolve a URL pública já com cache-buster.
 *
 * `upsert: true` grava sempre no mesmo caminho, então a URL pública nunca
 * muda de um upload pro outro — sem o parâmetro `v` o navegador e o CDN
 * continuam servindo a imagem ANTIGA depois da troca. `Date.now()` aqui é um
 * valor opaco pra invalidar cache, nunca comparado nem persistido como
 * timestamp real.
 */
async function uploadStoreAsset(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
  basename: "logo" | "cover"
): Promise<{ url: string } | { error: string }> {
  const path = `${userId}/${basename}.${imageExtension(file.type)}`;
  const { error: uploadError } = await supabase.storage
    .from("store-assets")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return { error: `Não foi possível enviar ${basename === "logo" ? "o logo" : "a capa"}. Tente novamente.` };
  }

  const { data: publicUrlData } = supabase.storage.from("store-assets").getPublicUrl(path);
  return { url: `${publicUrlData.publicUrl}?v=${Date.now()}` };
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
 *
 * Logo é OBRIGATÓRIA (decisão do usuário — vale desde o onboarding, não só
 * lá): a checagem abaixo bloqueia o save quando a loja não tem `logo_url` E
 * não veio um arquivo novo nesta chamada. Não exige reenviar a MESMA imagem
 * a cada edição — só afeta contas antigas que nunca tiveram logo.
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
  // `logo_url` vem na mesma consulta pelo mesmo motivo de eficiência — é o
  // valor que decide se a checagem de logo obrigatória abaixo passa sem um
  // arquivo novo.
  const { data: currentStore } = await owned.supabase
    .from("stores")
    .select("hide_sold_out_default, logo_url")
    .eq("id", owned.storeId)
    .single();
  const previousHideSoldOutDefault = currentStore?.hide_sold_out_default ?? false;
  const nextHideSoldOutDefault =
    parsed.data.hideSoldOutDefault === undefined
      ? previousHideSoldOutDefault
      : parsed.data.hideSoldOutDefault === "true";

  // Logo obrigatória (decisão do usuário — vale desde o onboarding, incluindo
  // esta tela). Não exige um arquivo NOVO a cada save: a loja já ter uma
  // (`currentStore.logo_url`) satisfaz a regra tanto quanto enviar uma agora
  // — do contrário, editar só o WhatsApp forçaria reenviar a mesma imagem
  // toda vez. Só bloqueia quem NUNCA teve logo e não está enviando uma agora
  // (contas antigas de antes desta regra existir).
  const incomingLogoFile = formData.get("logo");
  const hasIncomingLogo = incomingLogoFile instanceof File && incomingLogoFile.size > 0;
  if (!currentStore?.logo_url && !hasIncomingLogo) {
    return { error: "Envie uma logo para continuar." };
  }

  // Logo e capa sobem CRUAS, sem compressão/redimensionamento — diferente das
  // fotos de produto, que passam por `browser-image-compression` no uploader.
  // Isso é decisão consciente de escopo (confirmada pelo usuário), NÃO um
  // passo esquecido: só `validateImageFile` (tipo + teto de 5MB) roda aqui.
  //
  // Consequência conhecida e aceita: imagem de baixa resolução aparece
  // pixelada e nenhum ajuste de exibição resolve — o teto é a resolução da
  // origem. Vale mais para a CAPA que para a logo, porque ela é exibida
  // larga: uma foto pequena estica na vitrine. Antes de "corrigir" isso
  // achando que é bug, confirmar que o escopo mudou.
  let logoUrl: string | undefined;
  if (incomingLogoFile instanceof File && incomingLogoFile.size > 0) {
    const validationError = await validateImageFile(incomingLogoFile, "Logo");
    if (validationError) {
      return validationError;
    }

    const uploaded = await uploadStoreAsset(owned.supabase, owned.userId, incomingLogoFile, "logo");
    if ("error" in uploaded) {
      return uploaded;
    }
    logoUrl = uploaded.url;
  }

  // Capa é OPCIONAL (decisão do usuário): sem ela a vitrine gera um gradiente
  // a partir da cor de marca, e toda loja nasce apresentável sem ninguém
  // fazer nada. Três estados possíveis, e eles precisam ser distinguidos —
  // `undefined` (não mexeu, mantém o que está no banco), uma URL nova
  // (enviou), ou `null` (pediu para remover e voltar ao gradiente).
  const incomingCoverFile = formData.get("cover");
  const wantsCoverRemoved = formData.get("removeCover") === "true";
  let coverUrl: string | null | undefined;
  let coverAspectRatio: number | null | undefined;

  if (incomingCoverFile instanceof File && incomingCoverFile.size > 0) {
    const validationError = await validateImageFile(incomingCoverFile, "Capa");
    if (validationError) {
      return validationError;
    }

    const uploaded = await uploadStoreAsset(owned.supabase, owned.userId, incomingCoverFile, "cover");
    if ("error" in uploaded) {
      return uploaded;
    }
    coverUrl = uploaded.url;

    // Proporção medida no navegador (ver measureImageRatio) e re-enquadrada
    // AQUI: o número vem do cliente e, como qualquer entrada, não é confiável.
    // Sem este segundo enquadramento, um valor forjado passaria direto para a
    // vitrine e viraria um cabeçalho de altura arbitrária.
    coverAspectRatio = resolveCoverRatio(Number(formData.get("coverAspectRatio"))).ratio;
  } else if (wantsCoverRemoved) {
    // Só limpa a coluna. O arquivo continua no bucket de propósito: o próximo
    // upload usa `upsert` no MESMO caminho e sobrescreve, então apagar aqui
    // seria uma chamada de rede a mais para nada — e uma falha nela deixaria
    // o formulário com erro por um arquivo que ninguém mais alcança.
    coverUrl = null;
    // A proporção acompanha a capa: deixá-la para trás faria o gradiente
    // herdar a forma de uma imagem que não existe mais.
    coverAspectRatio = null;
  }

  // Enquadramento da capa. `resolveCoverFrame` roda aqui de novo porque estes
  // quatro números vêm do formulário e, como qualquer entrada, não são
  // confiáveis — um valor fora da faixa viraria uma vitrine quebrada para o
  // cliente final, que não tem como reportar nada.
  const coverFrame = resolveCoverFrame({
    bandRatio: formData.get("coverBandRatio"),
    zoom: formData.get("coverZoom"),
    posX: formData.get("coverPosX"),
    posY: formData.get("coverPosY"),
  });

  // Instagram: normalizado UMA vez, aqui, para o banco guardar só o handle
  // canônico. A vitrine monta a URL a partir dele e nunca re-interpreta o que
  // foi digitado — mesma disciplina do telefone.
  const instagramResult = normalizeInstagramHandle(formData.get("instagram") as string | null);
  if ("error" in instagramResult) {
    return { error: instagramResult.error };
  }

  const { error: storeUpdateError } = await owned.supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      accent_color: parsed.data.accentColor || null,
      tagline: parsed.data.tagline || null,
      hide_sold_out_default: nextHideSoldOutDefault,
      instagram: instagramResult.handle,
      cover_band_ratio: coverFrame.bandRatio,
      cover_zoom: coverFrame.zoom,
      cover_pos_x: coverFrame.posX,
      cover_pos_y: coverFrame.posY,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      // `undefined` significa "não mexeu" e precisa ficar FORA do objeto —
      // incluído, o supabase-js o serializa como null e apagaria a capa a
      // cada save de qualquer outro campo.
      ...(coverUrl !== undefined ? { cover_url: coverUrl } : {}),
      ...(coverAspectRatio !== undefined ? { cover_aspect_ratio: coverAspectRatio } : {}),
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
