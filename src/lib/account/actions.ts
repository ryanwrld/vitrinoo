"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/account/constants";
import { signUpSchema } from "@/lib/validation/auth";

const BUCKETS = ["product-images", "store-assets"] as const;

/**
 * Troca a senha de quem já está logado, sem passar por email.
 *
 * Por que não reusar o fluxo de "esqueci minha senha": ele depende de o
 * email de recuperação chegar, e o plano free do Supabase não entrega
 * template customizado — o botão pareceria funcionar e o revendedor ficaria
 * esperando um email que não vem. Aqui a sessão já prova quem é o usuário,
 * então o email não é necessário para nada.
 *
 * A senha ATUAL é exigida mesmo assim: sem isso, quem pegasse o notebook
 * destravado trocaria a senha e tomaria a conta. `signInWithPassword` é
 * usado só para conferir a senha atual — é a única forma de verificar via
 * SDK, já que não existe endpoint de "confira esta senha".
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string } | { success: true }> {
  const parsed = signUpSchema.shape.password.safeParse(newPassword);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Senha inválida" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;

  if (!email) {
    redirect("/admin/login");
  }

  if (parsed.data === currentPassword) {
    return { error: "A nova senha precisa ser diferente da atual." };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (reauthError) {
    return { error: "Senha atual incorreta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data });
  if (updateError) {
    return { error: "Não foi possível alterar a senha." };
  }

  return { success: true };
}

/**
 * Encerra a sessão em TODOS os dispositivos (`scope: "global"`), incluindo
 * este. Serve pro caso real de quem entrou no painel do celular de outra
 * pessoa ou num computador emprestado e não lembra de ter saído — sem isso
 * a única saída seria trocar a senha.
 *
 * Termina em `redirect` porque a sessão local também é derrubada: continuar
 * na página renderizaria um painel logado que já não tem sessão válida.
 */
export async function signOutAllDevicesAction(): Promise<{ error: string } | never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });

  if (error) {
    console.error("signOutAllDevicesAction: signOut global falhou", error);
    return { error: "Não foi possível encerrar as sessões." };
  }

  redirect("/admin/login");
}

/**
 * Exporta os dados da conta (loja, configurações e catálogo) como JSON.
 *
 * Contrapeso de "Excluir conta": a LGPD trata portabilidade e eliminação
 * como direitos irmãos, e na prática é o que permite o revendedor sair sem
 * perder o catálogo que levou meses montando — ou simplesmente guardar uma
 * cópia.
 *
 * Devolve a string do JSON em vez de gravar arquivo: o download é montado no
 * cliente (Blob), sem precisar de bucket, rota de arquivo estático ou
 * limpeza posterior.
 *
 * Só lê o que pertence ao dono logado. As URLs das fotos entram como
 * caminhos do Storage, não binário — um JSON com imagens embutidas ficaria
 * grande demais para o navegador montar em memória.
 */
export async function exportAccountDataAction(): Promise<
  { error: string } | { json: string; filename: string }
> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/admin/login");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug, tagline, accent_color, logo_url, hide_sold_out_default, created_at")
    .eq("owner_id", user.id)
    .single();

  if (!store) {
    return { error: "Não encontramos sua loja para exportar." };
  }

  const [{ data: settings }, { data: products, error: productsError }] = await Promise.all([
    supabase
      .from("store_settings")
      .select("whatsapp_e164, message_template, onboarding_completed_at")
      .eq("store_id", store.id)
      .single(),
    // Nomes de tabela/coluna conferidos contra `database.types.ts`: a tabela
    // de fotos é `product_photos` (com `storage_path`), NÃO `product_images`.
    // TODOS os campos do produto entram — `description`, `category`, `sole` e
    // `fulfillment` também: num backup, campo faltando é dado perdido, e o
    // dono não tem como saber que faltou.
    supabase
      .from("products")
      .select(
        "id, name, brand, brand_other, line, sole, category, fulfillment, description, price, status, hide_when_sold_out, created_at, product_sizes(size, available), product_photos(storage_path, position)"
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: true }),
  ]);

  // Falha de consulta NÃO pode virar `[]`: um backup vazio é
  // indistinguível de uma loja vazia, e o revendedor só descobriria o
  // problema no dia em que precisasse restaurar. Melhor não entregar
  // arquivo nenhum do que entregar um arquivo que mente.
  if (productsError) {
    console.error("exportAccountDataAction: falha ao ler produtos", productsError);
    return { error: "Não foi possível ler seus produtos." };
  }

  const publicPhotoUrl = (storagePath: string) =>
    supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;

  const payload = {
    exportadoEm: new Date().toISOString(),
    conta: { email: user.email, criadaEm: user.created_at },
    loja: store,
    configuracoes: settings ?? null,
    // Tamanhos ordenados e fotos com URL pública resolvida: o caminho cru do
    // Storage não serve pra nada fora do painel — quem abre o backup precisa
    // conseguir ver a foto, não decifrar um path.
    produtos: (products ?? []).map((product) => {
      const { product_sizes, product_photos, ...rest } = product;
      return {
        ...rest,
        tamanhos: [...(product_sizes ?? [])].sort((a, b) => a.size - b.size),
        fotos: [...(product_photos ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((photo) => ({ posicao: photo.position, url: publicPhotoUrl(photo.storage_path) })),
      };
    }),
  };

  return {
    json: JSON.stringify(payload, null, 2),
    filename: `vitrinoo-${store.slug}.json`,
  };
}

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
    return { error: "Não foi possível excluir a conta." };
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
