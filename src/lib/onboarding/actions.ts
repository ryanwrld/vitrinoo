"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsAppBR } from "@/lib/phone/normalize-br";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { resolveTimeZone } from "@/lib/time/store-timezone";

export type OnboardingActionResult = { error: string } | void;

/**
 * Assinaturas de magic bytes (primeiros bytes do arquivo) por content-type
 * aceito para o logo da loja. Nunca confiar apenas na extensão do arquivo
 * ou no `file.type` reportado pelo browser (Domínio de Segurança do
 * 01-RESEARCH.md — "upload de logo malicioso disfarçado de imagem").
 */
const LOGO_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // "RIFF" — WebP usa o container RIFF
};

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB, conforme constraint do CLAUDE.md/PROJECT.md

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
    return { error: "Arquivo de logo inválido." };
  }

  return null;
}

/**
 * Conclui o onboarding pós-cadastro (D-04): salva identidade da loja
 * (nome/logo/cor/frase — LOJA-01) e configuração de WhatsApp (número
 * normalizado + template de mensagem — WPP-01/WPP-02), seta
 * `onboarding_completed_at` e libera o Dashboard.
 *
 * Logo é OBRIGATÓRIA aqui (decisão do usuário — antes era opcional), regra
 * que vale só para onboarding de contas novas: `stores.logo_url` continua
 * nullable no banco, e lojas antigas sem logo não são afetadas nem
 * bloqueadas em nenhuma outra tela.
 *
 * A normalização de telefone acontece AQUI, uma única vez, chamando
 * `normalizeWhatsAppBR` (Task 2) — nunca no client e nunca re-derivada
 * depois (Armadilha 2 do 01-RESEARCH.md: a Fase 5 apenas lê o valor já
 * normalizado e persistido por esta Server Action).
 */
export async function saveOnboarding(formData: FormData): Promise<OnboardingActionResult> {
  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    accentColor: formData.get("accentColor") ?? "",
    tagline: formData.get("tagline") ?? "",
    whatsapp: formData.get("whatsapp"),
    messageTemplate: formData.get("messageTemplate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  // Logo passou a ser OBRIGATÓRIA no onboarding (decisão explícita do
  // usuário — antes era opcional). A regra vale só para contas NOVAS: lojas
  // que já existiam sem logo continuam funcionando normalmente e podem
  // adicionar depois em /configuracoes, sem bloqueio nenhum ali.
  //
  // Checado aqui, não só no wizard: o botão desabilitado no cliente evita o
  // clique acidental, mas nunca é a garantia real — qualquer requisição
  // direta à action passaria por cima de uma validação só no front.
  const logoFile = formData.get("logo");
  if (!(logoFile instanceof File) || logoFile.size === 0) {
    return { error: "Envie uma logo para continuar." };
  }

  // Fuso da loja (migration 0013): vem do navegador do revendedor, sem
  // nenhuma pergunta no wizard — o aparelho já sabe o fuso, e perguntar isso
  // a um usuário não-técnico seria fricção sem retorno. NUNCA confiado cru:
  // `resolveTimeZone` valida contra o motor de datas do runtime e cai em
  // São Paulo se vier ausente, vazio ou forjado. Fora do schema Zod de
  // propósito — é telemetria de ambiente, não um campo que o usuário
  // preenche, e um valor inválido jamais pode bloquear o cadastro.
  const timezone = resolveTimeZone(
    typeof formData.get("timezone") === "string" ? (formData.get("timezone") as string) : null
  );

  const phoneResult = normalizeWhatsAppBR(parsed.data.whatsapp);
  if ("error" in phoneResult) {
    return { error: phoneResult.error };
  }

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
    return { error: "Não foi possível localizar sua loja." };
  }

  const validationError = await validateLogoFile(logoFile);
  if (validationError) {
    return validationError;
  }

  const path = `${userData.user.id}/logo.${logoExtension(logoFile.type)}`;
  const { error: uploadError } = await supabase.storage
    .from("store-assets")
    .upload(path, logoFile, { contentType: logoFile.type, upsert: true });

  if (uploadError) {
    return { error: "Não foi possível enviar o logo." };
  }

  const { data: publicUrlData } = supabase.storage.from("store-assets").getPublicUrl(path);
  const logoUrl = publicUrlData.publicUrl;

  const { error: storeUpdateError } = await supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      accent_color: parsed.data.accentColor || null,
      tagline: parsed.data.tagline || null,
      logo_url: logoUrl,
      timezone,
    })
    .eq("id", store.id);

  if (storeUpdateError) {
    return { error: "Não foi possível salvar os dados da loja." };
  }

  const { error: settingsUpdateError } = await supabase
    .from("store_settings")
    .update({
      whatsapp_e164: phoneResult.e164Digits,
      message_template: parsed.data.messageTemplate,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("store_id", store.id);

  if (settingsUpdateError) {
    return { error: "Não foi possível salvar o WhatsApp." };
  }

  redirect("/admin/dashboard");
}
