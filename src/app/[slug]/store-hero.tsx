import { BadgeCheck } from "lucide-react";
import { formatBRLPrice } from "@/lib/currency/brl";
import { instagramProfileUrl } from "@/lib/social/instagram";
import { formatStoreFreshness } from "@/lib/store/freshness";
import { buildStoreUrl } from "@/lib/slug/store-url";
import { buildCoverGradient } from "@/lib/color/cover-gradient";
import { coverBandStyle, coverImageStyle, type CoverFrame } from "@/lib/store/cover-frame";
import { InstagramIcon } from "@/components/icons/instagram-icon";
import { ShareVitrineButton } from "@/components/share-vitrine-button";
import { QrCodeButton } from "./qr-code-button";
import { ImageWithFallback } from "./image-with-fallback";

export type StoreHeroData = {
  name: string;
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
  accentColor: string | null;
  tagline: string | null;
  instagram: string | null;
  /** Enquadramento escolhido pelo revendedor no editor de capa. */
  coverFrame: CoverFrame;
  timezone: string | null;
};

export type StoreHeroStats = {
  modelCount: number;
  minPrice: number | null;
  lastUpdatedAt: string | null;
};

/**
 * Cabeçalho de perfil da vitrine pública.
 *
 * Substitui a faixa de cor chapada anterior (logo centralizada + nome +
 * frase sobre `accent_color`). O problema daquele desenho não era estético:
 * ele parecia conversa de rede social, e o Vitrinoo precisa parecer site de
 * loja profissional — é essa percepção que decide se um cliente que chegou
 * por um link de WhatsApp confia o suficiente para mandar um pedido.
 *
 * UM BLOCO SÓ, DE BORDA A BORDA
 *
 * Capa em cima, faixa de identidade logo abaixo, as duas na largura inteira
 * da tela e emendadas. Nada flutua, nada tem canto arredondado solto, não há
 * fundo da página aparecendo nas laterais. O CONTEÚDO é que tem largura
 * O CONTEÚDO é centralizado na MESMA `max-w-[100rem]` do grid de produtos —
 * o nome da loja começa exatamente na coluna onde começa o primeiro produto.
 * O teto subiu de `max-w-5xl` (1024px) para 1600px junto com o grid, que
 * agora vai a 8 colunas; manter os dois valores casados é o que impede o
 * cabeçalho e a grade de lerem como dois layouts colados.
 *
 * FAIXA CLARA
 *
 * Mesma superfície branca do grid logo abaixo: cabeçalho e catálogo
 * pertencem à mesma página, separados por um fio de 1px em vez de uma
 * mudança de cor. A cor da loja fica confinada à CAPA — que é onde ela pode
 * ser qualquer coisa (amarelo-limão, rosa-choque, branco) sem nunca decidir
 * se um texto é legível.
 *
 * BREAKPOINTS DE CONTAINER, NÃO DE JANELA
 *
 * Todo prefixo responsivo aqui é `@min-[…]`/`@max-[…]` sobre o `@container`
 * do próprio `<header>`, e não o `sm:`/`lg:` de sempre. Na vitrine pública
 * não muda nada — o cabeçalho ocupa a largura inteira da janela, então os
 * dois critérios dão o mesmo resultado nos mesmos 640/768/1024/1280/1536px.
 * A diferença aparece na PRÉVIA do painel: lá o hero é desenhado dentro de
 * uma moldura de 390px numa janela de desktop, e com breakpoint de janela
 * ele mostrava tipografia e avatar de desktop espremidos numa coluna de
 * celular — ou seja, um enquadramento que nenhum cliente jamais veria.
 *
 * RITMO DE ESPAÇAMENTO
 *
 * Um valor por degrau, sem exceção: `gap-1` dentro de um par (nome/@),
 * `mt-4` entre blocos, `mt-5` antes de uma divisória. Compensar posição com
 * margem negativa em cada bloco é o que deixa um layout "quase certo" — o
 * único negativo aqui é o do avatar, que precisa atravessar a emenda com a
 * capa.
 */
export function StoreHero({
  store,
  stats,
  censorStats = false,
}: {
  store: StoreHeroData;
  stats: StoreHeroStats;
  /**
   * Só a prévia do painel usa isto. Os três números da linha de baixo
   * (quantos modelos, a partir de quanto, quando foi atualizado) falam de
   * ESTOQUE, e a prévia existe para conferir IDENTIDADE VISUAL — capa,
   * avatar, nome, selo, @, Instagram e frase, que continuam exatamente
   * iguais à vitrine pública porque é o MESMO componente. Cada valor vira
   * uma tarja cinza do tamanho aproximado do texto real, para a linha
   * manter o ritmo que vai ter na vitrine; os RÓTULOS ficam, senão a tarja
   * não diz o que está escondendo.
   */
  censorStats?: boolean;
}) {
  const accent = store.accentColor ?? "#0D21A1";
  const freshness = formatStoreFreshness(stats.lastUpdatedAt, store.timezone);
  // `@min-[640px]:h-auto` na classe + estes estilos: no celular a altura fixa de 128px
  // continua valendo (`h-32`), e a proporção/limite só entram a partir de
  // `sm`. Como os estilos inline não têm breakpoint, o `aspect-ratio` é
  // inofensivo no celular — lá `h-32` já define a altura e vence.
  const bandStyle = coverBandStyle(store.coverFrame);
  const imageStyle = coverImageStyle(store.coverFrame);

  // Os três números são condicionais e independentes. Loja recém-criada não
  // deve anunciar "0 modelos" nem "a partir de R$ 0" — número ruim em vitrine
  // nova destrói mais confiança do que a ausência dele.
  //
  // A PRÉVIA passa pelo MESMO caminho. `censorStats` decide apenas se o VALOR
  // é substituído por uma tarja; rótulo, ordem e largura de cada item saem
  // daqui de qualquer forma. Uma lista paralela só para a prévia foi tentada
  // antes e é exatamente o que deixa o painel mostrando uma vitrine que não
  // existe mais: quem mudasse "atualizados" aqui teria de lembrar de mudar
  // lá. Com um caminho só, um item novo já nasce aparecendo (censurado) na
  // prévia, sem ninguém sincronizar nada.
  //
  // Na prévia as três condições são forçadas a passar, porque as tarjas não
  // dependem de estoque nenhum — a tela de Configurações não consulta o
  // catálogo para desenhar retângulos cinza.
  const statItems: { value: string; label: string; censoredWidth: string }[] = [];
  if (censorStats || stats.modelCount > 0) {
    statItems.push({
      value: String(stats.modelCount),
      label: stats.modelCount === 1 ? "modelo" : "modelos",
      censoredWidth: "w-6",
    });
  }
  if (censorStats || stats.minPrice !== null) {
    statItems.push({
      value: stats.minPrice === null ? "" : formatBRLPrice(stats.minPrice),
      label: "a partir de",
      censoredWidth: "w-20",
    });
  }
  if (censorStats || freshness) {
    // Plural por decisão do usuário, aqui e na prévia — mesmo o rótulo vindo
    // logo depois de uma data ("ontem atualizados").
    statItems.push({ value: freshness ?? "", label: "atualizados", censoredWidth: "w-14" });
  }

  const actionButtonClass =
    "flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60";

  return (
    <header className="@container w-full border-b border-gray-200 bg-white">
      {/* CAPA
          ----
          A caixa ocupa a largura inteira da tela e tem a PROPORÇÃO DA IMAGEM
          enviada. É a proporção que zera o corte.

          A versão anterior usava ALTURA FIXA. Como a largura muda em cada
          tela, a proporção da caixa mudava junto (3:1 num celular, 7:1 num
          notebook, 12:1 num ultrawide) — e uma imagem tem UMA proporção. O
          `object-cover` cortava em todo dispositivo, só mudava o eixo: um
          banner 1280x248 perdia 27% da altura no desktop. Nenhum valor de
          altura resolvia; qualquer escolha só empurrava o corte de um eixo
          para o outro.

          A capa continua SANGRANDO de borda a borda, sem canto arredondado e
          sem coluna máxima — a largura nunca foi o problema.

          NO DESKTOP NÃO HÁ MANIPULAÇÃO DE ALTURA. Nenhuma caixa com altura
          forçada, nenhuma proporção travada, nenhum recorte: a imagem é
          desenhada na proporção do arquivo e a altura é o que ela é. Não
          existe teto de altura nem de largura — a capa acompanha a janela.

          No celular a altura fixa de 128px continua exatamente como estava:
          lá o enquadramento já funcionava e não foi tocado.

          SEM `position: relative` aqui, de propósito. Nada dentro desta caixa
          usa posicionamento absoluto — mas `relative` sozinho, mesmo sem
          `z-index`, já eleva o elemento para uma camada de pintura que o CSS
          desenha DEPOIS de todo conteúdo não-posicionado, não importa a
          ordem no HTML. O anel branco do avatar (mais abaixo) não tem
          `position` nenhuma, então ele ficava numa camada anterior — e onde
          os dois se sobrepunham (o topo do avatar, sobre a capa), a capa
          pintava POR CIMA do anel. Resultado: contorno visível só na metade
          de baixo do avatar (sobre o fundo branco, sem sobreposição de
          camada), sumindo na metade de cima. Reintroduzir `relative` aqui
          sem necessidade real volta a quebrar isso. */}
      <div
        className="h-32 w-full overflow-hidden @min-[640px]:h-auto"
        style={{
          // A altura da faixa, o zoom e a posição vêm do EDITOR DE CAPA, não
          // mais de números fixos no código. Quem decide o que fica de fora é
          // quem fez a arte.
          ...bandStyle,
          // Três paradas da MESMA cor em claridades diferentes, todas opacas —
          // ver buildCoverGradient para por que alfa sobre fundo branco fazia
          // um azul virar lilás.
          backgroundImage: buildCoverGradient(accent),
        }}
      >
        {store.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública do Supabase Storage; `next/image` exigiria remotePatterns por host de projeto e não traz ganho num banner único acima da dobra
          <img
            src={store.coverUrl}
            alt=""
            style={imageStyle}
            className="h-full w-full"
            aria-hidden="true"
          />
        )}
      </div>

      {/* O CORPO BRANCO SOBE SOBRE A CAPA
          --------------------------------
          Antes a capa e o corpo se encontravam numa emenda reta, e o branco
          morava no <header> — pai da capa E do corpo, entao ele pintava ATRAS
          dela e nao tinha como subir. Agora o corpo tem superficie propria,
          sangrando na largura inteira (o conteudo segue preso na coluna de
          `max-w-[100rem]`, no filho abaixo), e ela invade a capa.

          `relative` NAO e enfeite: sem ele o branco nao cobre a capa quando
          existe imagem enviada. A ordem de pintura do CSS desenha o fundo de
          todo bloco nao-posicionado ANTES de qualquer elemento inline, e a
          <img> da capa e inline-level — a foto pintaria por cima deste branco
          e por cima dos cantos arredondados. `relative` joga o painel para a
          camada dos posicionados, acima da foto. E a mesma armadilha que o
          comentario da capa documenta ao contrario ("SEM position: relative
          aqui"): la o `relative` na capa fazia a capa cobrir o anel do
          avatar. Aqui e o inverso, e o anel sobe junto — que e o certo.

          A SUBIDA E IGUAL AO RAIO, e isso e geometria, nao gosto: o azul so
          existe atras do painel na faixa em que ele invade a capa. Com subida
          menor que o raio, a parte de baixo da curva cairia fora da capa, com
          branco atras, e o arredondamento apareceria cortado. Entao 28px e
          28px no celular, 56px e 56px de 640px para cima — se um dia o raio
          crescer, a subida cresce com ele, nunca um sem o outro.

          O CELULAR TEM RAIO MENOR QUE O DESKTOP de proposito, e o motivo nao e
          estetico: la a faixa da capa tem 128px FIXOS, e tudo que o painel
          sobe sai da arte. Com 40px o rodape do banner (logo, botao, assinatura
          — o que o lojista costuma por embaixo) ficava escondido. 28px deixam
          100px dos 128px visiveis. No desktop a faixa e mais que o dobro, entao
          56px cabem sem comer o que importa.

          O `pt-4`/`pt-5` do filho e o respiro que faltava: sem ele o avatar e
          os botoes nasciam colados na borda de cima e o bloco lia como se
          estivesse vazando para fora do branco. Ele desce TODO o conteudo de
          uma vez, entao o ritmo interno (o `mt-4` entre blocos, o `mt-5` antes
          da divisoria) continua igual — e o avatar desce junto, passando a
          atravessar menos a emenda, que era o ponto.

          A faixa azul VISIVEL encurta nesses 24/32px. E o que "o branco sobe
          sobre o azul" significa, e nao se compensa aumentando a altura da
          capa: aquela altura vem do editor de capa, e enquadramento do
          lojista, e e justamente a manipulacao que o comentario acima proibe.

          A margem negativa do avatar (abaixo) fica intocada: o painel e o
          avatar sobem juntos, entao o quanto do avatar atravessa a borda
          branca continua identico ao de antes. */}
      <div className="relative -mt-7 rounded-t-[1.75rem] bg-white @min-[640px]:-mt-14 @min-[640px]:rounded-t-[3.5rem]">
        <div className="mx-auto w-full max-w-[100rem] px-4 pb-6 pt-4 @min-[640px]:px-6 @min-[640px]:pb-7 @min-[640px]:pt-5 @min-[768px]:px-12 @min-[1024px]:px-20 @min-[1280px]:px-24 @min-[1536px]:px-28">
          {/* Avatar e ações na MESMA linha, alinhados pela BASE (`items-end`).
              Antes as ações flutuavam no topo do bloco sem se alinhar a
              elemento nenhum — a borda inferior do avatar dá a elas uma linha
              de apoio real. O negativo aqui é o único do componente: é ele que
              faz o avatar subir sobre a capa. */}
          <div className="-mt-10 flex items-end justify-between gap-4 @min-[640px]:-mt-12 @min-[1024px]:-mt-14">
            {/* Anel branco: separa o avatar da capa sem depender da cor dela —
                um anel colorido sumiria contra uma capa da mesma família. */}
            <div className="shrink-0 rounded-full bg-white p-1 shadow-sm">
              <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gray-100 @min-[640px]:h-24 @min-[640px]:w-24 @min-[1024px]:h-28 @min-[1024px]:w-28">
                <ImageWithFallback src={store.logoUrl} alt={store.name} />
              </div>
            </div>

            {/* `pb-1` compensa exatamente o `p-1` do anel do avatar, para as
                duas bases caírem na mesma linha ótica.

                `@max-[768px]:translate-y-2`: no mobile a capa termina a 128px e estes
                botões começavam a 132px — 4px de folga, que a olho nu lê como
                se estivessem encostados/vazando no banner escuro. O avatar pode
                invadir a capa (é o desenho), mas eles não: são controles, não
                identidade, e sobrepor um controle a um fundo de cor
                imprevisível (a capa é escolhida pelo revendedor) também custa
                contraste. Descidos JUNTOS, no wrapper, para não perderem o
                alinhamento entre si.
                `translate` e não margem/padding de propósito: transform não
                reflui o layout, então nada abaixo (nome da loja, @, stats) se
                desloca por causa deste ajuste. */}
            <div className="flex shrink-0 items-center gap-2 pb-1 @max-[768px]:translate-y-2">
              <QrCodeButton
                url={buildStoreUrl(store.slug)}
                storeName={store.name}
                accentColor={accent}
                className={actionButtonClass}
              />
              <ShareVitrineButton
                url={buildStoreUrl(store.slug)}
                storeName={store.name}
                label={null}
                ariaLabel={`Compartilhar a vitrine de ${store.name}`}
                className={actionButtonClass}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1">
            <h1 className="flex items-center gap-1.5 font-display text-xl font-extrabold tracking-tight text-gray-900 @min-[640px]:text-2xl @min-[1024px]:text-3xl">
              {store.name}
              {/* Selo de verificado — vale pra TODA loja publicada (decisão do
                  usuário), não condicionado a nenhum campo de "verificação"
                  real no banco; é puramente visual/confiança de marca. */}
              <BadgeCheck
                className="relative top-[2px] h-[22px] w-[22px] shrink-0 @min-[640px]:top-[3px] @min-[640px]:h-6 @min-[640px]:w-6 @min-[1024px]:top-1 @min-[1024px]:h-7 @min-[1024px]:w-7"
                style={{ fill: "#1DA1F2", color: "white" }}
                aria-label="Loja verificada"
              />
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-500">@{store.slug}</p>
              {store.instagram && (
                <a
                  href={instagramProfileUrl(store.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Instagram de ${store.name}`}
                  className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                >
                  <InstagramIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{store.instagram}</span>
                </a>
              )}
            </div>
          </div>

          {store.tagline && (
            // Teto de 2 linhas com reticências. Sem ele uma frase longa empurra
            // o primeiro produto para fora da dobra no celular — e a frase de
            // apresentação não vale o catálogo inteiro.
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-gray-600 @min-[640px]:text-base">
              {store.tagline}
            </p>
          )}

          {statItems.length > 0 && (
            // `flex-wrap` + `gap-x-8`: em tela estreita os três números quebram
            // para a linha de baixo em vez de encolher a fonte. O separador é o
            // espaço, não um traço — traço entre itens que já têm rótulo
            // próprio é ruído.
            <dl className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
              {statItems.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-start @min-[640px]:flex-row @min-[640px]:items-baseline @min-[640px]:gap-1.5"
                >
                  <dd className="text-sm font-bold text-gray-900 @min-[640px]:text-base">
                    {censorStats ? (
                      // Tarja, não asteriscos: mantém a LARGURA do texto real na
                      // linha, então a prévia mostra o mesmo ritmo de espaçamento
                      // que a vitrine vai ter de verdade.
                      <span
                        aria-label="número oculto na prévia"
                        className={`inline-block h-4 translate-y-[1px] rounded bg-gray-300 @min-[640px]:h-[18px] ${item.censoredWidth}`}
                      />
                    ) : (
                      item.value
                    )}
                  </dd>
                  <dt className="text-sm text-gray-500">{item.label}</dt>
                </div>
              ))}
            </dl>
          )}

        </div>
      </div>
    </header>
  );
}
