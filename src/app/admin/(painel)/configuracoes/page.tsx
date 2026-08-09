import Link from "next/link";
import { redirect } from "next/navigation";
import {
  UserCircle,
  Shield,
  Paintbrush,
  Link as LinkIcon,
  AlertTriangle,
  LogOut,
  MonitorSmartphone,
  DatabaseBackup,
} from "lucide-react";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding-guard";
import { resolveCoverFrame } from "@/lib/store/cover-frame";
import { createClient } from "@/lib/supabase/server";
import { buildStoreUrl } from "@/lib/slug/store-url";
import { queryRecentActivity, HEADER_FEED_LIMIT } from "@/lib/dashboard/metrics";
import { HeaderActions } from "@/components/header-actions";
import { ProfileForm } from "./profile-form";
import { ThemeToggle } from "./theme-toggle";
import { SettingsForm } from "./settings-form";
import { SlugEditor } from "./slug-editor";
import { QrCodePanel } from "./qr-code-panel";
import { DeleteAccountPanel } from "./delete-account-panel";
import { ChangePasswordPanel } from "./change-password-panel";
import { SignOutAllPanel } from "./sign-out-all-panel";
import { ExportDataPanel } from "./export-data-panel";
import { signOutAction } from "@/lib/auth/actions";

type Aba = "conta" | "loja";

const TABS: { value: Aba; label: string; href: string }[] = [
  { value: "conta", label: "Configurações da conta", href: "/admin/configuracoes" },
  { value: "loja", label: "Configurações da loja", href: "/admin/configuracoes?aba=loja" },
];

/**
 * Rota única de configurações — antes vivia dividida em `/admin/configuracoes`
 * (conta: perfil/tema/senha) e `/admin/configuracoes/loja` (identidade/WhatsApp/
 * link/QR code), e a segunda não tinha mais nenhum link levando até ela na
 * interface (órfã, só acessível digitando a URL). Unificada por pedido
 * explícito do usuário — sem redirect da rota antiga: como nada apontava
 * pra ela, não há link quebrado a proteger.
 *
 * Abas via query string (`?aba=loja`), não estado de cliente: mesma
 * convenção já usada no filtro de período do Dashboard
 * (`?periodo=7`/`?periodo=15`, ver dashboard/page.tsx) — navegável, com
 * back/forward do navegador funcionando, e sem duplicar a árvore de
 * componentes inteira escondida via CSS. "Conta" é a aba padrão quando
 * `?aba` está ausente ou tem qualquer valor que não seja "loja".
 *
 * Estilo das abas (texto + sublinhado, não pílula) segue uma referência
 * visual trazida pelo usuário — cor de marca (primary) no lugar do
 * verde-água do exemplo original; o filtro de período do Dashboard já usa
 * o estilo de pílula, então as pílulas ficam reservadas pra alternar um
 * MESMO conteúdo por parâmetro (período), enquanto o sublinhado aqui
 * alterna entre duas seções de conteúdo bem distintas.
 */
export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  await requireCompletedOnboarding();

  const params = await searchParams;
  const aba: Aba = params.aba === "loja" ? "loja" : "conta";

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug, logo_url, cover_url, cover_aspect_ratio, cover_band_ratio, cover_zoom, cover_pos_x, cover_pos_y, accent_color, tagline, instagram, hide_sold_out_default")
    .eq("owner_id", userData.user!.id)
    .single();

  // Defesa contra a janela de corrida entre o guard (requireCompletedOnboarding,
  // que só confirma a EXISTÊNCIA da linha) e esta busca dos dados completos —
  // preservada da antiga /configuracoes/loja e agora aplicada às duas abas
  // (antes só protegia a rota da loja; a de conta nunca buscava `store`).
  if (!store) {
    redirect("/admin/onboarding");
  }

  // `headerFeed` alimenta o pop-up do sino, que agora abre em toda rota do
  // painel (ver HEADER_FEED_LIMIT em lib/dashboard/metrics.ts). Em paralelo
  // com as settings: consultas independentes.
  const [{ data: settings }, headerFeed] = await Promise.all([
    supabase
      .from("store_settings")
      .select("whatsapp_e164, message_template")
      .eq("store_id", store.id)
      .single(),
    queryRecentActivity(supabase, store.id, HEADER_FEED_LIMIT),
  ]);

  const publicUrl = buildStoreUrl(store.slug);

  // `created_at` do Supabase é UTC; formatar no fuso de São Paulo evita
  // mostrar o dia seguinte para quem criou a conta depois das 21h (mesma
  // armadilha já resolvida em pageview-actions.ts e format-relative-time.ts).
  const contaCriadaEm = userData.user?.created_at
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(userData.user.created_at))
    : "—";

  return (
    // max-w-6xl (não o max-w-2xl original): a aba "Loja" virou duas colunas no
    // desktop e precisa de largura real pra elas respirarem. A largura é do
    // CONTAINER, constante nas duas abas de propósito — se cada aba tivesse a
    // sua, a barra de abas mudaria de tamanho ao alternar, o que lê como
    // defeito. A aba "Conta" mantém o conteúdo contido (ver max-w-2xl abaixo),
    // padrão comum de cabeçalho largo + conteúdo em coluna de leitura.
    // Respiro (px-4 sm:px-6 lg:px-10 / py-6 lg:py-8) idêntico ao do Dashboard
    // e de todas as outras rotas do painel: navegar entre elas não pode
    // deslocar o h1 nem horizontal nem verticalmente.
    //
    // SEM `mx-auto` e sem `max-w` no CONTAINER: centralizar faria a distância
    // até a sidebar variar conforme a largura da janela, e um `max-w` aqui
    // faria o `HeaderActions` descolar da borda direita da tela e pular de
    // lugar ao navegar entre as rotas. O `max-w-6xl` desceu para a coluna de
    // conteúdo, que é quem precisa dele.
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold text-gray-900 dark:text-gray-50">Configurações</h1>
        <HeaderActions activityFeed={headerFeed.items} />
      </div>

      {/* Divisor cinza é FULL WIDTH (sem max-w), igual à linha que corre sob
          o título acima — antes o divisor vivia dentro do mesmo
          `max-w-6xl 2xl:max-w-7xl` do conteúdo e parava bem antes da borda
          direita (onde ficam os ícones), lendo como uma linha incompleta.

          As ABAS (o texto clicável) voltam à posição ORIGINAL, de antes de
          qualquer mudança de largura desta sessão: SEM `mx-auto` nem
          `max-w` — são só dois links curtos, não precisam de teto, e sem
          centralização ficam sempre coladas no canto esquerdo (mesmo
          offset do padding do container, igual ao "Configurações" acima),
          nunca deslocadas pela centralização do conteúdo em telas largas. */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const isActive = tab.value === aba;
            return (
              <Link
                key={tab.value}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "border-primary text-primary dark:border-blue-300 dark:text-blue-300"
                    : "border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Wrapper de conteúdo comum às DUAS abas — é ele que garante que um
          card da aba "Conta" tenha exatamente a mesma largura que um card da
          aba "Loja": mesmo teto, mesma centralização, mesmo grid de 2
          colunas iguais nos dois lados. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 2xl:max-w-7xl">
      {aba === "conta" ? (
        // Colunas IGUAIS (50/50) — e a aba "Loja" usa a mesma proporção.
        // Isso garante as duas coisas ao mesmo tempo: os cards têm a mesma
        // largura entre si DENTRO da aba, e a divisa entre as colunas não
        // muda de lugar ao alternar Conta ↔ Loja. Uma tentativa anterior de
        // usar 1.35fr/1fr nas duas abas resolvia o pulo entre abas mas
        // deixava um card visivelmente maior que o outro aqui — trocar um
        // desalinhamento por outro.
        //
        // Distribuição: à esquerda quem é o usuário (perfil), como ele vê o
        // painel (interface) e o que é dele (dados); à direita o que mexe no
        // acesso — senha, sessões e excluir. Manter as ações destrutivas/de
        // acesso na mesma coluna evita que "Excluir conta" apareça isolado no
        // fim de uma cascata.
        //
        // Cada coluna empilha seus próprios cards de forma independente
        // (sem `items-stretch`/`lg:flex-1`): as alturas internas ficam como
        // o conteúdo de cada card pede, sem esticar nada pra forçar os pés
        // a baterem — diferença de altura entre as colunas é aceitável,
        // diferença de LARGURA não.
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
          <div className="flex w-full min-w-0 flex-col gap-6">
            <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
                <UserCircle className="h-5 w-5" />
                <h2 className="font-display font-bold">Seu perfil</h2>
              </div>
              <ProfileForm email={userData.user?.email ?? ""} />

              {/* Data de criação: dado que já vem em `getUser()`, sem consulta
                  extra. Formatada no fuso de São Paulo pelo mesmo motivo do
                  feed de atividades — `created_at` é UTC, e à noite o dia em
                  UTC já virou enquanto no Brasil não. */}
              {/* Mesmo formato da linha de e-mail logo acima (profile-form.tsx):
                  rótulo em cima, VALOR na sub-linha cinza. Antes o valor ficava
                  na extrema direita e a sub-linha trazia uma paráfrase ("Você
                  usa o Vitrinoo desde essa data") que só repetia o rótulo — duas
                  linhas irmãs, no mesmo card, tratando "rótulo + valor" de dois
                  jeitos diferentes. De quebra some a frase truncada: "Conta
                  criada em" pedia complemento, e o complemento estava a meia
                  tela de distância. Continua com duas linhas de texto, então a
                  altura do card não muda. */}
              <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
                <div>
                  <span className="block font-medium text-gray-900 dark:text-gray-50">Conta criada em</span>
                  <span className="text-sm text-gray-500 tabular-nums dark:text-gray-400">{contaCriadaEm}</span>
                </div>
              </div>
            </section>

            <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
                <Paintbrush className="h-5 w-5" />
                <h2 className="font-display font-bold">Interface</h2>
              </div>

              {/* Rótulo + subtítulo no mesmo formato das linhas dos outros
                  cards (span block + span text-sm text-gray-500). */}
              <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
                <div className="flex min-h-16 flex-col items-start justify-center gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="block font-medium text-gray-900 dark:text-gray-50">Tema</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Altere a cor do seu painel</span>
                  </div>
                  <ThemeToggle />
                </div>
              </div>
            </section>

            {/* Contrapeso do card vermelho da outra coluna: a mesma tela que
                deixa apagar tudo agora deixa levar uma cópia antes. Fica na
                coluna esquerda, com o que é "seu", e não junto do vermelho —
                baixar dados é ação tranquila, não passo da exclusão. */}
            <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
                <DatabaseBackup className="h-5 w-5" />
                <h2 className="font-display font-bold">Seus dados</h2>
              </div>

              <ExportDataPanel />
            </section>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-6">
            <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
                <Shield className="h-5 w-5" />
                <h2 className="font-display font-bold">Acesso</h2>
              </div>

              {/* Antes: botão "Alterar" desabilitado, ao lado de um texto que
                  prometia alterar a senha. Agora funciona de verdade e sem
                  depender de email — ver `changePasswordAction`. */}
              <ChangePasswordPanel />
            </section>

            {/* Sessões em card próprio, separado de "Acesso": são duas
                perguntas diferentes ("como eu entro" vs. "onde eu estou
                logado"), e juntas empilhavam três linhas de ação num card só.
                Separado, "sair daqui" e "sair de todos" ficam lado a lado —
                que é exatamente quando a diferença entre os dois importa. */}
            <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
                <MonitorSmartphone className="h-5 w-5" />
                <h2 className="font-display font-bold">Sessões</h2>
              </div>

              {/* "Sair da conta" também existe no menu do avatar, mas lá está
                  escondido atrás de um clique — quem procura por isso vai em
                  Configurações primeiro. Duplicar um caminho de saída é
                  barato; não achar nenhum é o que irrita. */}
              <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="block font-medium text-gray-900 dark:text-gray-50">Este dispositivo</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Encerrar a sessão neste dispositivo.</span>
                  </div>
                  <form action={signOutAction} className="w-full shrink-0 sm:w-auto">
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:w-auto dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sair da conta
                    </button>
                  </form>
                </div>
              </div>

              <SignOutAllPanel />
            </section>

            {/* "Apagar permanentemente" e não "Zona de perigo": o segundo é
                jargão de painel de infraestrutura e exagera o tom — isso
                apaga uma conta, não detona um cluster. O adjetivo carrega o
                aviso ("permanentemente") sem apelar para metáfora de
                catástrofe, e o título deixa de repetir literalmente o rótulo
                do botão logo abaixo. O peso visual vermelho fica, por decisão
                do usuário. */}
            <section className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-error-bg bg-white p-5 dark:border-error-solid/25 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-error-solid">
                <AlertTriangle className="h-5 w-5" />
                <h2 className="font-display font-bold">Apagar permanentemente</h2>
              </div>

              <DeleteAccountPanel />
            </section>
          </div>
        </div>
      ) : (
        // Duas colunas SÓ no desktop (lg+); abaixo disso segue empilhado.
        // Divisão por finalidade, não por ordem: à esquerda o que se preenche
        // e salva (identidade + WhatsApp, que são um formulário só, com um
        // único "Salvar alterações" no fim); à direita o que se usa pra
        // divulgar (link + QR code).
        //
        // Sem `items-start`: o padrão `items-stretch` do grid é o que faz a
        // coluna da direita acompanhar a altura da esquerda, e o card de lá
        // absorve essa altura via `lg:flex-1` internos — as duas colunas
        // terminam alinhadas embaixo, sem vão sobrando dentro de nenhum card.
        // Mesma técnica já usada no Dashboard.
        //
        // O alinhamento é CARD a CARD, não coluna a coluna: a coluna esquerda
        // termina com o botão "Salvar alterações", que fica FORA do último
        // card. Sem o espaçador espelho abaixo, o card do QR esticava até o
        // rodapé do botão e ficava visivelmente mais alto que o card do
        // WhatsApp ao lado.
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-stretch">
          <SettingsForm
            store={{
              name: store.name,
              logoUrl: store.logo_url,
              coverUrl: store.cover_url,
              coverAspectRatio: store.cover_aspect_ratio,
              coverFrame: resolveCoverFrame({
                bandRatio: store.cover_band_ratio,
                zoom: store.cover_zoom,
                posX: store.cover_pos_x,
                posY: store.cover_pos_y,
              }),
              accentColor: store.accent_color,
              tagline: store.tagline,
              instagram: store.instagram,
              hideSoldOutDefault: store.hide_sold_out_default,
            }}
            settings={{
              whatsapp: settings?.whatsapp_e164 ?? "",
              messageTemplate: settings?.message_template ?? "",
            }}
            currentSlug={store.slug}
            // Coluna da direita passada como PROP, não como irmã: o
            // `SlugEditor` lá dentro perdeu o botão próprio e agora é salvo
            // pelo "Salvar alterações" do formulário, então precisa enxergar
            // o `SlugFieldProvider` — o que só acontece se estiver na árvore
            // React do `SettingsForm`. No DOM nada muda, porque o `<form>` é
            // `display: contents`.
            //
            // Slug e QR num card ÚNICO: tratam do mesmo assunto (o link
            // público — o QR nada mais é do que esse link em imagem), e
            // separados o card do slug ficaria raso demais ao lado da coluna
            // do formulário.
            //
            // `lg:col-start-2 lg:row-start-1`: posição explícita porque, com
            // o form em `display: contents`, este <section> vem DEPOIS do
            // botão "Salvar alterações" no DOM — a auto-colocação da grade o
            // jogaria para a linha de baixo.
            aside={
              <section className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-5 lg:col-start-2 lg:row-start-1 lg:h-full dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
                  <LinkIcon className="h-5 w-5" />
                  <h2 className="font-display font-bold">Link e QR code da vitrine</h2>
                </div>

                <SlugEditor />

                <hr className="border-gray-100 dark:border-gray-800" />

                <QrCodePanel publicUrl={publicUrl} storeName={store.name} />
              </section>
            }
          />
        </div>
      )}
      </div>
    </div>
  );
}
