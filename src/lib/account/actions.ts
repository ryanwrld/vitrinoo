"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/account/constants";

const BUCKETS = ["product-images", "store-assets"] as const;

/**
 * Storage do Supabase NÃO tem cascade: apagar a linha do banco não apaga o
 * arquivo. Como todo upload é gravado sob `${userId}/…`
 * (settings/actions.ts, products/actions.ts, onboarding/actions.ts), dá pra
 * varrer o prefixo do dono e remover tudo.
 *
 * A varredura é recursiva porque `product-images` tem um nível a mais
 * (`${userId}/${productId}/arquivo`) — `list()` devolve a pasta, não os
 * arquivos dentro dela. Um item é pasta quando vem sem `id`.
 */
async function collectStoragePaths(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) {
    return [];
  }

  const paths: string[] = [];
  for (const entry of data) {
    const entryPath = `${prefix}/${entry.name}`;
    if (entry.id) {
      paths.push(entryPath);
    } else {
      paths.push(...(await collectStoragePaths(supabase, bucket, entryPath)));
    }
  }
  return paths;
}

/**
 * Exclui a conta do usuário logado e tudo que pende dela.
 *
 * Ordem importa:
 *  1. Arquivos do Storage primeiro — depois que o usuário some, não há mais
 *     como descobrir quais arquivos eram dele (o prefixo é o próprio id), e
 *     eles ficariam órfãos consumindo cota pra sempre.
 *  2. `auth.admin.deleteUser` — o resto cai por cascade no banco:
 *     `stores.owner_id → auth.users` é `on delete cascade`, e daí em diante
 *     `store_settings`, `products`, `product_images`, `product_sizes`,
 *     `order_clicks` e `pageviews` também são. Nenhum delete manual de
 *     tabela é necessário, e fazer manualmente só criaria a chance de
 *     esquecer uma tabela nova no futuro.
 *  3. `signOut` — o usuário já não existe, mas o cookie de sessão continua
 *     no navegador; sem isso a próxima navegação bate num estado
 *     inconsistente em vez de cair no login.
 *
 * Falha de Storage NÃO aborta a exclusão: deixar arquivo órfão é ruim, mas
 * muito menos ruim do que dizer ao usuário que a conta foi excluída quando
 * ela não foi — ou travá-lo numa conta que ele pediu para apagar.
 */
export async function deleteAccountAction(
  confirmation: string
): Promise<{ error: string } | never> {
  if (confirmation.trim().toUpperCase() !== DELETE_ACCOUNT_CONFIRMATION) {
    return { error: `Digite ${DELETE_ACCOUNT_CONFIRMATION} para confirmar.` };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (!userId) {
    redirect("/admin/login");
  }

  const admin = createAdminClient();

  for (const bucket of BUCKETS) {
    const paths = await collectStoragePaths(admin, bucket, userId);
    if (paths.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        console.error(`deleteAccountAction: falha ao limpar o bucket ${bucket}`, error);
      }
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("deleteAccountAction: deleteUser falhou", deleteError);
    return { error: "Não foi possível excluir a conta. Tente novamente." };
  }

  // O usuário já não existe, então o servidor Supabase pode rejeitar o
  // signOut — mas o cookie precisa sair do navegador de qualquer forma, e
  // uma falha aqui não pode reverter uma exclusão que já aconteceu.
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("deleteAccountAction: signOut após a exclusão falhou", err);
  }

  redirect("/admin/login");
}
