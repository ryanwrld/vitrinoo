"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Ações de curadoria do marketplace — publicar, despublicar, arquivar e marcar
 * um produto como parte do preview (os 100 que uma loja sem acesso enxerga).
 *
 * A AUTORIZAÇÃO NÃO É CHECADA AQUI, e isso é deliberado: quem decide é a policy
 * `admin_manage_marketplace_products` (migration 0025), que exige
 * `is_marketplace_admin()`. Um update disparado por quem não é admin não
 * encontra linha para atualizar e volta sem afetar nada.
 *
 * Repetir a checagem no TypeScript daria uma falsa sensação de segurança: a
 * chave `authenticated` é pública no bundle do cliente, então qualquer pessoa
 * pode chamar a REST do Supabase direto, sem passar por esta Server Action. A
 * única barreira que vale é a do banco. O que fazemos aqui é reportar o
 * resultado com honestidade — se nada mudou, a ação avisa em vez de fingir
 * sucesso.
 */

type Resultado = { ok: true } | { ok: false; error: string };

const STATUS_VALIDOS = ["draft", "published", "archived"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

export async function setMarketplaceStatus(id: string, status: Status): Promise<Resultado> {
  if (!STATUS_VALIDOS.includes(status)) {
    return { ok: false, error: "Status inválido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_products")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Nada foi alterado. Sua conta tem permissão de administrador do marketplace?" };
  }

  revalidatePath("/admin/marketplace");
  return { ok: true };
}

export async function setMarketplacePreview(id: string, preview: boolean): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_products")
    .update({ preview })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Nada foi alterado. Sua conta tem permissão de administrador do marketplace?" };
  }

  revalidatePath("/admin/marketplace");
  return { ok: true };
}

/**
 * Renomear e reprecificar direto no card. A curadoria deste acervo é visual —
 * o erro que se enxerga é quase sempre "esse nome está errado" ou "esse preço
 * está fora" —, e abrir um formulário separado para trocar um campo seria
 * atrito puro numa tela de 990 itens.
 */
export async function updateMarketplaceProduct(
  id: string,
  campos: { name?: string; suggestedPrice?: number },
): Promise<Resultado> {
  const patch: Record<string, unknown> = {};

  if (campos.name !== undefined) {
    const nome = campos.name.trim();
    if (nome.length < 3) return { ok: false, error: "O nome precisa ter ao menos 3 caracteres." };
    // Rede de segurança da nomenclatura: nenhum nome chega à vitrine com
    // caractere chinês. Ver docs/marketplace/03-NOMENCLATURA.md.
    if (/[一-鿿]/.test(nome)) {
      return { ok: false, error: "O nome não pode conter caracteres em mandarim." };
    }
    patch.name = nome;
  }

  if (campos.suggestedPrice !== undefined) {
    const preco = campos.suggestedPrice;
    if (!Number.isFinite(preco) || preco <= 0) {
      return { ok: false, error: "Informe um preço válido." };
    }
    patch.suggested_price = preco;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_products")
    .update(patch)
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Nada foi alterado. Sua conta tem permissão de administrador do marketplace?" };
  }

  revalidatePath("/admin/marketplace");
  return { ok: true };
}

/** Ações em lote, para curar 990 itens sem clicar card a card. */
export async function setMarketplaceStatusEmLote(
  ids: string[],
  status: Status,
): Promise<Resultado & { afetados?: number }> {
  if (!ids.length) return { ok: true, afetados: 0 };
  if (!STATUS_VALIDOS.includes(status)) return { ok: false, error: "Status inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_products")
    .update({ status })
    .in("id", ids)
    .select("id");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/marketplace");
  return { ok: true, afetados: data?.length ?? 0 };
}
