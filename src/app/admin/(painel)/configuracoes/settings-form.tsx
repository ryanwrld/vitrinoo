"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AsYouType } from "libphonenumber-js";
import { ChevronDown, Paintbrush, MessageCircle, SlidersHorizontal, Eye, Link as LinkIcon } from "lucide-react";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";
import { checkSlugAvailability, saveStoreSettings, updateStoreSlug } from "@/lib/settings/actions";
import { getContrastTextColor } from "@/lib/color/contrast";
import { buildCoverGradient } from "@/lib/color/cover-gradient";
import { measureImageRatio, resolveCoverRatio } from "@/lib/store/cover-ratio";
import { resolveCoverFrame, type CoverFrame } from "@/lib/store/cover-frame";
import { CoverEditor } from "./cover-editor";
import { slugify } from "@/lib/slug/slugify";
import { slugSchema } from "@/lib/slug/validation";
import { useDebouncedValue } from "@/lib/hooks/use-debounce";
import { SlugFieldProvider, type SlugAvailabilityStatus } from "./slug-field-context";
import { SlugEditor } from "./slug-editor";
import { QrCodePanel } from "./qr-code-panel";

/**
 * Formulário de edição pós-onboarding (Loja + WhatsApp), escrito do zero
 * para esta tela (D-07 — reusa `onboardingSchema` e a convenção visual de
 * `onboarding-wizard.tsx`, mas NÃO importa o componente do wizard: aqui é
 * uma página de edição em vigência, não um wizard de conclusão única).
 *
 * Cada campo é pré-preenchido com os valores atuais da loja/config via
 * `defaultValues` (props vindas do Server Component `page.tsx`). O submit
 * único chama `saveStoreSettings` e mostra toast de sucesso/erro (D-12) —
 * nunca faz `redirect()`, pois esta tela é revisitável.
 */
export type SettingsFormProps = {
  store: {
    name: string;
    logoUrl: string | null;
    /** Capa do cartão de perfil da vitrine. `null` = usa o gradiente da cor. */
    coverUrl: string | null;
    /** Proporção da capa salva. `null` = sem capa, usa a padrão. */
    coverAspectRatio: number | null;
    /** Enquadramento salvo: altura da faixa, zoom e posição. */
    coverFrame: CoverFrame;
    accentColor: string | null;
    tagline: string | null;
    instagram: string | null;
    hideSoldOutDefault: boolean;
  };
  settings: {
    whatsapp: string;
    messageTemplate: string;
  };
  /** Slug atual da loja — base de comparação para saber se ele mudou. */
  currentSlug: string;
  /**
   * URL pública da vitrine (`buildStoreUrl`, calculada no Server Component
   * `page.tsx`) — só o dado bruto. A seção "Link e QR code da vitrine" em si
   * (`SlugEditor` + `QrCodePanel`, ver o JSX no fim deste componente) é
   * renderizada AQUI DENTRO, não recebida pronta de `page.tsx`.
   *
   * Duas razões, as duas exigem que a seção viva na árvore deste Client
   * Component:
   * 1) O `SlugEditor` precisa do `SlugFieldProvider` logo abaixo — um
   *    elemento montado no Server Component nunca enxergaria esse contexto.
   * 2) A prévia do `QrCodePanel` precisa de `accentColorValue`
   *    (`watch("accentColor")`) para acompanhar a cor ENQUANTO o revendedor
   *    arrasta no seletor, antes de salvar — esse valor só existe aqui.
   *    (Chegou a ser uma função `(accentColor) => ReactNode` passada como
   *    prop, mas Server → Client Component não pode passar FUNÇÃO nenhuma,
   *    só dado serializável e elementos já construídos — React derruba a
   *    árvore inteira com "Functions cannot be passed directly to Client
   *    Components". Só dá pra resolver morando dos dois lados da fronteira:
   *    o dado (`publicUrl`) atravessa, o comportamento (a função) não.)
   */
  publicUrl: string;
};

export function SettingsForm({ store, settings, currentSlug, publicUrl }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const confirmSlugDialogRef = useRef<HTMLDialogElement>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);
  // Guarda os valores validados entre "usuário clicou em salvar" e "usuário
  // confirmou a troca do link" — sem isso o submit precisaria ser refeito
  // depois do diálogo.
  const pendingValuesRef = useRef<OnboardingInput | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Capa: além do arquivo novo, precisa de um estado explícito de REMOÇÃO.
  // Sem ele, "não enviei arquivo" e "quero voltar ao gradiente" seriam
  // indistinguíveis no submit, e apagar a capa viraria impossível.
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  // Proporção do arquivo ESCOLHIDO AGORA (ainda não salvo). Medida no
  // navegador para a prévia já sair na forma real e para o aviso de
  // enquadramento aparecer ANTES de salvar, não depois.
  const [coverRatio, setCoverRatio] = useState<number | null>(null);
  const [coverRatioClamped, setCoverRatioClamped] = useState(false);
  const [coverFrame, setCoverFrame] = useState<CoverFrame>(store.coverFrame);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: store.name,
      accentColor: store.accentColor ?? "#0D21A1",
      tagline: store.tagline ?? "",
      whatsapp: settings.whatsapp,
      messageTemplate: settings.messageTemplate,
      hideSoldOutDefault: store.hideSoldOutDefault ? "true" : "false",
      instagram: store.instagram ?? "",
    },
  });

  // Prévia local do arquivo escolhido (object URL) — revoga a anterior antes
  // de criar uma nova para não vazar memória a cada troca de arquivo.
  useEffect(() => {
    if (!logoFile) return;
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!coverFile) return;
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile]);

  const whatsappValue = watch("whatsapp");
  const taglineValue = watch("tagline") ?? "";
  const nameValue = watch("name");
  const accentColorValue = watch("accentColor") || "#0D21A1";
  const heroLogoUrl = logoPreviewUrl ?? store.logoUrl;
  // Ordem importa: arquivo novo > remoção pendente > capa salva. Sem a
  // remoção no meio, clicar em "Usar o gradiente" não mudaria nada na tela
  // até salvar, e o revendedor clicaria de novo achando que falhou.
  const coverPreview = coverPreviewUrl ?? (coverRemoved ? null : store.coverUrl);
  // Mesma função usada em store-hero.tsx (a vitrine REAL) — a prévia usa a
  // lógica exata de contraste, não uma aproximação, senão ela pode mostrar
  // uma combinação legível aqui e ilegível na vitrine de verdade.
  const heroIsDarkText = getContrastTextColor(accentColorValue) === "dark";
  const formattedPreview = whatsappValue ? new AsYouType("BR").input(whatsappValue) : "";

  // --- Campo "Slug" -------------------------------------------------------
  // Mora aqui, e não mais no `SlugEditor`, porque quem salva o slug agora é o
  // botão "Salvar alterações" deste formulário. O `SlugEditor` virou só a
  // parte visual, alimentada via `SlugFieldProvider`.
  const [rawSlug, setRawSlug] = useState(currentSlug);
  const [availability, setAvailability] = useState<"idle" | "available" | "taken">("idle");
  const [isCheckPending, startCheckTransition] = useTransition();

  const slug = slugify(rawSlug);
  const debouncedSlug = useDebouncedValue(slug, 400);

  const slugFormatResult = slugSchema.safeParse(slug);
  const slugFormatError = slugFormatResult.success
    ? null
    : slugFormatResult.error.issues[0]?.message ?? null;

  // Formato é checado de forma síncrona; só a checagem de REDE é debounced
  // (02-RESEARCH.md Open Question 2). Tudo derivado no render — nenhum
  // `setState` síncrono dentro do efeito (react-hooks/set-state-in-effect).
  const needsSlugCheck = slugFormatResult.success && debouncedSlug !== currentSlug;
  const slugStatus: SlugAvailabilityStatus = !needsSlugCheck
    ? "idle"
    : isCheckPending
      ? "checking"
      : availability;

  useEffect(() => {
    if (!needsSlugCheck) return;

    let cancelled = false;
    startCheckTransition(async () => {
      const result = await checkSlugAvailability(debouncedSlug);
      if (cancelled) return;
      setAvailability(result.available ? "available" : "taken");
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, currentSlug, needsSlugCheck]);

  const slugChanged = slug !== currentSlug;

  /**
   * "Há algo por salvar?" — precisa somar TRÊS fontes, porque nem tudo neste
   * formulário passa pelo react-hook-form: o `isDirty` cobre os campos
   * registrados (nome, cor, frase, esgotados, WhatsApp, template), o logo é
   * um `File` em estado próprio e o slug vive no `SlugFieldProvider`.
   * Olhar só o `isDirty` deixaria o botão "Reverter" invisível justamente
   * para quem trocou o logo ou o link.
   */
  const frameChanged =
    coverFrame.bandRatio !== store.coverFrame.bandRatio ||
    coverFrame.zoom !== store.coverFrame.zoom ||
    coverFrame.posX !== store.coverFrame.posX ||
    coverFrame.posY !== store.coverFrame.posY;
  const hasUnsavedChanges =
    isDirty || logoFile !== null || coverFile !== null || coverRemoved || frameChanged || slugChanged;

  /**
   * Devolve tudo ao último estado salvo, sem recarregar a página — o ponto do
   * botão é exatamente não obrigar o usuário a sair da aba e voltar (nem
   * redigitar o que apagou).
   *
   * `reset()` sem argumento volta aos `defaultValues`, que são os valores
   * vindos do servidor. Logo e slug são revertidos à mão por não morarem no
   * react-hook-form. O `value` do input de arquivo também é limpo: sem isso,
   * escolher o MESMO arquivo de novo não dispararia `change` e o usuário
   * ficaria sem conseguir reenviar o logo que acabou de descartar.
   */
  const handleRevert = () => {
    reset();
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setRawSlug(currentSlug);
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
    toast.success("Alterações revertidas.");
  };
  // Trava o save enquanto o link estiver inválido/ocupado: deixar salvar aqui
  // só produziria um toast de erro depois de o usuário achar que terminou.
  const slugBlocksSave = slugChanged && (!!slugFormatError || slugStatus !== "available");

  // Logo obrigatória (decisão do usuário — vale desde o onboarding, incluindo
  // esta tela). "Ter logo" não exige escolher um arquivo NOVO a cada save:
  // basta a loja já possuir uma (`store.logoUrl`) OU um arquivo ter sido
  // selecionado agora. Isso é o que permite editar WhatsApp/cor/frase sem
  // reenviar a mesma imagem toda vez, e é a mesma regra que o servidor aplica
  // em `saveStoreSettings`.
  const hasLogo = logoFile !== null || store.logoUrl !== null;

  /**
   * Grava de verdade. A ordem importa: identidade/WhatsApp primeiro, slug
   * depois. Se a troca do slug falhar (ex.: alguém pegou o link nesse
   * intervalo), o resto já foi salvo e o usuário recebe só o erro do link —
   * o inverso deixaria o link trocado e as demais edições perdidas, que é o
   * pior dos dois estados parciais.
   */
  const persist = (values: OnboardingInput) => {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("accentColor", values.accentColor ?? "");
    formData.set("tagline", values.tagline ?? "");
    formData.set("whatsapp", values.whatsapp);
    formData.set("messageTemplate", values.messageTemplate);
    formData.set("hideSoldOutDefault", values.hideSoldOutDefault ?? "false");
    formData.set("instagram", values.instagram ?? "");
    formData.set("coverBandRatio", String(coverFrame.bandRatio));
    formData.set("coverZoom", String(coverFrame.zoom));
    formData.set("coverPosX", String(coverFrame.posX));
    formData.set("coverPosY", String(coverFrame.posY));
    if (logoFile) {
      formData.set("logo", logoFile);
    }
    if (coverFile) {
      formData.set("cover", coverFile);
      formData.set("coverAspectRatio", String(coverRatio ?? 0));
    } else if (coverRemoved) {
      formData.set("removeCover", "true");
    }

    startTransition(async () => {
      const result = await saveStoreSettings(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      if (slugChanged) {
        const slugResult = await updateStoreSlug(slug);
        if ("error" in slugResult) {
          toast.error(slugResult.error);
          return;
        }
        // Sem refresh, a URL pública, o QR e o cartão continuariam mostrando
        // o link antigo até uma navegação manual.
        router.refresh();
      }

      // Novo ponto de partida: sem isso o react-hook-form continuaria
      // comparando com os valores ORIGINAIS da página, o botão "Reverter"
      // ficaria visível para sempre depois do primeiro save — e, pior,
      // reverteria para o estado anterior ao que acabou de ser salvo.
      reset(values);
      setLogoFile(null);
      setLogoPreviewUrl(null);
      setCoverFile(null);
      setCoverPreviewUrl(null);
      setCoverRemoved(false);
      setCoverRatio(null);
      setCoverRatioClamped(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
      if (coverInputRef.current) {
        coverInputRef.current.value = "";
      }
      // A capa e a logo salvas vieram do servidor nas props; sem um refresh, a
      // prévia local some no reset e o card volta a mostrar a imagem ANTIGA
      // até uma navegação manual.
      router.refresh();

      toast.success("Configurações salvas!");
    });
  };

  /**
   * Trocar o slug quebra todo link já compartilhado — por isso ele tinha um
   * botão e um diálogo próprios (D-04/D-08). Ao unificar num único "Salvar
   * alterações", a confirmação não some: ela passa a ser CONDICIONAL, só
   * aparecendo quando o campo do link foi realmente alterado. Quem só mexeu
   * no WhatsApp salva num clique, como antes.
   */
  const onSubmit = (values: OnboardingInput) => {
    if (slugChanged) {
      pendingValuesRef.current = values;
      confirmSlugDialogRef.current?.showModal();
      return;
    }
    persist(values);
  };

  const handleConfirmSlugChange = () => {
    const values = pendingValuesRef.current;
    confirmSlugDialogRef.current?.close();
    pendingValuesRef.current = null;
    if (values) persist(values);
  };

  return (
    // `contents`: o <form> some do layout e seus dois filhos (a coluna de
    // cards e o botão) entram DIRETO no container de configuracoes/page.tsx —
    // na grade, no desktop; na pilha, no mobile. É o que permite o botão
    // "Salvar alterações" ser o ÚLTIMO elemento da tela nos dois casos
    // (atravessando as duas colunas e encostado à direita no desktop, depois
    // do card do QR no mobile) em vez de ficar preso ao fim do formulário.
    //
    // Por que não simplesmente envolver a grade inteira no <form>: o card do
    // QR contém o <dialog> do SlugEditor, que usa <form method="dialog"> —
    // form aninhado é HTML inválido e o navegador descarta o interno, o que
    // quebraria o botão "Cancelar" do diálogo.
    //
    // Como `display: contents` desliga a auto-colocação implícita esperada
    // (o <section> do QR vem DEPOIS do form no DOM, mas precisa ficar ANTES
    // do botão na grade), a posição dos três itens é declarada explicitamente
    // via col-start/row-start aqui e lá.
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents">
      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
            <Paintbrush className="h-5 w-5" />
            <h2 className="font-display font-bold">Identidade visual</h2>
          </div>
          {/* Prévia é SOB DEMANDA, não fixa na tela — por decisão explícita do
              usuário. Abre num popup (mesmo <dialog> nativo dos outros
              diálogos da tela) com o estado ATUAL dos campos, mesmo antes de
              salvar. Como <dialog> em modo modal bloqueia o resto da página
              enquanto aberto, o fluxo é abrir → conferir → fechar → continuar
              editando, não uma prévia que atualiza enquanto se olha para ela e
              para o formulário ao mesmo tempo. */}
          <button
            type="button"
            onClick={() => previewDialogRef.current?.showModal()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Pré-visualizar
          </button>
        </div>

        <dialog
          ref={previewDialogRef}
          className="dialog-modal m-auto w-full max-w-xs rounded-lg bg-white p-5 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900"
        >
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-sm font-bold text-gray-900 dark:text-gray-50">
              Assim fica o topo da sua vitrine
            </h3>

            {/* Mesma composição de store-hero.tsx (fundo = accentColor, logo
                circular, nome, frase), inclusive a MESMA função de contraste
                (getContrastTextColor) — não uma aproximação. Reflete o estado
                ATUAL do formulário (via watch), incluindo o que ainda não foi
                salvo. */}
            <div
              style={{ backgroundColor: accentColorValue }}
              className={`flex flex-col items-center gap-2 rounded-lg px-4 py-6 text-center ${
                heroIsDarkText ? "text-gray-900" : "text-white"
              }`}
            >
              <div
                className={`relative h-12 w-12 overflow-hidden rounded-full ${
                  heroIsDarkText ? "bg-black/10" : "bg-white/20"
                }`}
              >
                {heroLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- prévia local/já salva, mesma justificativa do avatar abaixo
                  <img src={heroLogoUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <span className="font-display text-base font-extrabold tracking-tight">
                {nameValue || "Nome da loja"}
              </span>
              {taglineValue && (
                <span className={`max-w-xs text-xs ${heroIsDarkText ? "text-gray-900/85" : "text-white/85"}`}>
                  {taglineValue}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => previewDialogRef.current?.close()}
              className="self-end rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              Fechar
            </button>
          </div>
        </dialog>

        {/* CAPA — banner do cartão de perfil da vitrine.
            Fica ACIMA de logo e cor porque é isso que a vitrine mostra
            primeiro, e porque a prévia larga aqui ensina o enquadramento
            sem precisar de texto explicando.
            Opcional de propósito (decisão do usuário): sem capa a vitrine
            gera um gradiente da cor de destaque, então nenhuma loja fica
            com buraco e ninguém é obrigado a um segundo upload. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="cover" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Capa da vitrine
            </label>
            <span className="text-xs text-gray-500 dark:text-gray-500">Opcional</span>
          </div>

          {/* `aspect-[3/1]` reproduz a proporção real da capa na vitrine — uma
              prévia quadrada mentiria sobre o corte e o revendedor só
              descobriria o enquadramento errado depois de publicar. */}
          {/* Editor de enquadramento: a prévia É a vitrine (mesmas funções de
              estilo), e os controles decidem o que fica de fora quando a
              proporção da arte não bate com a da faixa. Sem capa, mostra o
              gradiente REAL que a vitrine vai gerar — assim "não enviar" é
              uma escolha informada, não um campo vazio esperando ser
              preenchido. */}
          <CoverEditor
            imageUrl={coverPreview}
            fallbackBackground={buildCoverGradient(accentColorValue)}
            frame={coverFrame}
            onChange={setCoverFrame}
          />

          <input
            id="cover"
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0] ?? null;
              setCoverFile(file);
              // Escolher um arquivo cancela uma remoção pendente — do
              // contrário o submit mandaria os dois sinais e o servidor
              // decidiria por conta própria qual vale.
              setCoverRemoved(false);

              if (!file) {
                setCoverRatio(null);
                setCoverRatioClamped(false);
                return;
              }
              const measured = await measureImageRatio(file);
              const resolved = resolveCoverRatio(measured);
              setCoverRatio(resolved.ratio);
              setCoverRatioClamped(resolved.clamped);
            }}
            className="sr-only"
          />

          {coverRatioClamped && (
            // Aviso ANTES de salvar, não um erro depois. A capa continua
            // válida — ela só ficou fora da faixa em que o cabeçalho ainda
            // deixa o catálogo visível, e vai recortar um pouco.
            <p className="text-xs text-warning-fg">
              Essa imagem é muito {coverRatio && coverRatio <= 3 ? "alta" : "larga"} para o cabeçalho — ela vai
              aparecer levemente recortada. Um banner mais alongado (tipo 1600×400) encaixa inteiro.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {coverPreview ? "Trocar capa" : "Enviar capa"}
            </button>
            {coverPreview && (
              <button
                type="button"
                onClick={() => {
                  setCoverFile(null);
                  setCoverPreviewUrl(null);
                  setCoverRemoved(true);
                  // Enquadramento é de uma imagem específica; mantê-lo depois
                  // de remover a capa aplicaria o ajuste de uma arte que não
                  // existe mais ao gradiente.
                  setCoverFrame(resolveCoverFrame(null));
                  if (coverInputRef.current) coverInputRef.current.value = "";
                }}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 outline-none transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              >
                Usar o gradiente
              </button>
            )}
          </div>
        </div>

        {/* Logo e cor de destaque na MESMA linha: são as duas escolhas de
            identidade visual e ocupam pouco espaço cada uma — empilhadas,
            desperdiçavam a largura do card e afastavam a cor do contexto a
            que ela pertence. Empilha de volta abaixo de `sm`, onde não há
            largura para as duas. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {/* Sem `flex-1`: com ele o bloco do logo esticava até o fim da linha e
            jogava o seletor de cor lá na borda direita, longe do botão. Cada
            bloco ocupa só a própria largura e o `gap` faz o resto. */}
        <div className="flex flex-col gap-1">
          <label htmlFor="logo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Logo
          </label>
          <div className="flex items-center gap-3">
            {(logoPreviewUrl ?? store.logoUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local (object URL) e logo já salva, sem necessidade de otimização do next/image aqui
              <img
                src={logoPreviewUrl ?? store.logoUrl ?? undefined}
                alt="Logo atual da loja"
                className="h-12 w-12 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400 dark:border-gray-700 dark:text-gray-600">
                Sem logo
              </div>
            )}
            {/* Input nativo escondido — o texto padrão do navegador
                ("Nenhum arquivo escolhido") não reflete se já existe uma logo
                salva, então trocamos por um botão próprio.
                A legenda que ficava abaixo ("PNG, JPG ou WEBP" / nome do
                arquivo) saiu: ela empurrava o botão para fora do alinhamento
                com o avatar e o seletor de cor. O feedback de qual arquivo foi
                escolhido continua existindo na prévia do avatar ao lado, que
                atualiza na hora. */}
            <input
              id="logo"
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
            {/* Altura original preservada (menor que os 48px do avatar e do
                seletor de cor). O alinhamento vem do `items-center` da linha:
                o centro do botão bate com o centro do avatar e, por
                consequência, com o do seletor de cor ao lado — que começa na
                mesma altura por ter rótulo de mesma altura. */}
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {store.logoUrl ? "Trocar logo" : "Escolher logo"}
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <label htmlFor="accentColor" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Cor de destaque
          </label>
          {/* A causa do desalinhamento não era a altura do input — já batia
              com o botão. Era o CONTEXTO: a linha do logo tem 48px (altura do
              avatar) e centraliza o botão dentro dela (`items-center`), então
              o botão começa 5px abaixo do topo da linha. A linha da cor, sem
              essa moldura, começava o input flush no topo. `h-12 items-center`
              aqui replica a mesma moldura de 48px, então os dois controles
              centralizam pela mesma régua e seus topos batem de verdade. */}
          <div className="flex h-12 items-center">
            <input
              id="accentColor"
              type="color"
              {...register("accentColor")}
              className="h-[38px] w-20 rounded-md border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          {errors.accentColor && (
            <span className="text-sm text-error-fg">{errors.accentColor.message}</span>
          )}
        </div>
        </div>

        {/* Só aparece quando falta logo (contas antigas de antes desta regra
            existir) — é o que trava "Salvar alterações", não narrativa. O
            efeito da cor não precisa mais de frase: a prévia acima já mostra. */}
        {!hasLogo && <p className="text-xs text-error-fg">Logo obrigatória — escolha uma imagem.</p>}
      </div>

      {/* "Preferências": nome, frase e política de estoque. Separado de
          "Identidade visual" a pedido do usuário — lá ficam só os elementos
          gráficos da marca (logo e cor), aqui o texto da loja e a regra de
          exibição. Continua no MESMO <form>: o botão "Salvar alterações" no
          rodapé salva os dois cards de uma vez, como antes. */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <SlidersHorizontal className="h-5 w-5" />
          <h2 className="font-display font-bold">Preferências</h2>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Nome da loja
          </label>
          <input
            id="name"
            type="text"
            autoComplete="organization"
            {...register("name")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.name && <span className="text-sm text-error-fg">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tagline" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Frase de apresentação
          </label>
          <input
            id="tagline"
            type="text"
            maxLength={100}
            {...register("tagline")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.tagline && <span className="text-sm text-error-fg">{errors.tagline.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="instagram" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Instagram
            </label>
            <span className="text-xs text-gray-500 dark:text-gray-500">Opcional</span>
          </div>
          {/* Prefixo `@` fixo no campo: comunica o formato esperado sem uma
              linha de instrução, e o servidor aceita de qualquer jeito o link
              inteiro colado do app (normalizeInstagramHandle) — o prefixo
              orienta, não restringe. */}
          <div className="flex items-center rounded-md border border-gray-300 bg-white transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
            <span className="pl-3 text-base text-gray-400 dark:text-gray-600">@</span>
            <input
              id="instagram"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="rlesportes"
              {...register("instagram")}
              className="h-11 w-full bg-transparent px-2 text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-600"
            />
          </div>
          {errors.instagram && <span className="text-sm text-error-fg">{errors.instagram.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="hideSoldOutDefault" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Quando um produto esgotar
          </label>
          <div className="relative">
            {/* Rótulo + opção precisam formar UMA frase que se lê inteira:
                "Quando um produto esgotar → Mostrar esmaecido". O rótulo
                anterior ("Exibir quando esgotado") não tinha sujeito — exibir
                o quê? — e só fazia sentido pra quem já sabia do que se tratava. */}
            <select
              id="hideSoldOutDefault"
              {...register("hideSoldOutDefault")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="true">Ocultar da vitrine (padrão)</option>
              <option value="false">Mostrar esmaecido</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <MessageCircle className="h-5 w-5" />
          <h2 className="font-display font-bold">WhatsApp e mensagem de pedido</h2>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="whatsapp" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            WhatsApp
          </label>
          <input
            id="whatsapp"
            type="tel"
            placeholder="(11) 99999-9999"
            {...register("whatsapp")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {formattedPreview && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Prévia: {formattedPreview}</span>
          )}
          {errors.whatsapp && <span className="text-sm text-error-fg">{errors.whatsapp.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="messageTemplate" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Template da mensagem de pedido
          </label>
          <textarea
            id="messageTemplate"
            rows={6}
            {...register("messageTemplate")}
            // `w-full resize-y`: sem isso o <textarea> usa a largura
            // intrínseca do atributo `cols` e, pior, pode ser ARRASTADO na
            // horizontal pela alça do canto — o arraste grava uma largura
            // inline que empurra a coluna e faz a aba "Loja" ficar mais larga
            // que a aba "Conta". Travar em `resize-y` mantém o ajuste de
            // altura (útil pra um template longo) e elimina o vetor
            // horizontal.
            className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.messageTemplate && (
            <span className="text-sm text-error-fg">{errors.messageTemplate.message}</span>
          )}
        </div>
      </div>

      {/* Diálogo de confirmação da troca do link. Fica DENTRO da coluna de
          cards (um container flex comum) e não solto na grade: um `<dialog>`
          fechado é `display:none`, mas manter estrutura previsível evita
          surpresa se alguém mudar o modo de exibição depois.
          Os botões são `type="button"` com `close()` manual em vez do
          `<form method="dialog">` que o SlugEditor usava — aqui já estamos
          dentro de um `<form>`, e form aninhado é HTML inválido: o navegador
          descartaria o interno e o "Cancelar" pararia de funcionar. */}
      <dialog
        ref={confirmSlugDialogRef}
        // `m-auto` NÃO é decoração: o navegador centraliza um <dialog> modal
        // via `margin: auto` do próprio user-agent stylesheet, e o preflight
        // do Tailwind zera `margin` em TODOS os elementos — sem isso o
        // diálogo encosta no canto superior esquerdo da tela.
        // `dialog-modal` (globals.css) anima entrada E saída do próprio
        // diálogo e do fundo escurecido.
        className="dialog-modal m-auto rounded-lg bg-white p-6 text-gray-900 shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px] dark:bg-gray-900 dark:text-gray-50"
      >
        <div>
          <h2 className="font-display text-xl font-medium text-gray-900 dark:text-gray-50">
            Trocar o link da sua vitrine?
          </h2>
          <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Isso vai quebrar links já compartilhados: quem tiver o link antigo não vai mais
            conseguir acessar sua vitrine. Essa ação não pode ser desfeita.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => confirmSlugDialogRef.current?.close()}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleConfirmSlugChange}
              className="rounded-md bg-error-solid px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-error-solid-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-bg focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {isPending ? "Salvando…" : "Sim, trocar o link"}
            </button>
          </div>
        </div>
      </dialog>
      </div>

      <SlugFieldProvider
        value={{
          rawSlug,
          setRawSlug,
          slug,
          formatError: slugFormatError,
          status: slugStatus,
        }}
      >
        {/* `lg:col-start-2 lg:row-start-1`: posição explícita porque, com o
            form em `display: contents`, esta seção vem DEPOIS do botão
            "Salvar alterações" no DOM — a auto-colocação da grade a jogaria
            para a linha de baixo. */}
        <section className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-5 lg:col-start-2 lg:row-start-1 lg:h-full dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
            <LinkIcon className="h-5 w-5" />
            <h2 className="font-display font-bold">Link e QR code da vitrine</h2>
          </div>

          <SlugEditor />

          <hr className="border-gray-100 dark:border-gray-800" />

          <QrCodePanel publicUrl={publicUrl} storeName={store.name} accentColor={accentColorValue} />
        </section>
      </SlugFieldProvider>

      {/* Linha de ações. O `order`/`col-start` que antes vivia no botão de
          salvar mudou para este container: com o <form> em `display: contents`
          quem é filho da grade agora é ele, não o botão.
          Secundário à esquerda, primário à direita — e é por isso que
          "Reverter" aparecendo/sumindo não empurra o "Salvar" de lugar. */}
      <div className="flex flex-col-reverse gap-2 max-lg:order-last sm:flex-row sm:justify-end lg:col-span-2 lg:col-start-1 lg:row-start-2">
        {/* Só existe quando há algo por salvar: um botão de reverter sempre
            visível seria um controle morto na maior parte do tempo, e um
            convite a cliques sem efeito. */}
        {hasUnsavedChanges && (
          <button
            type="button"
            onClick={handleRevert}
            disabled={isPending}
            className="w-full sm:w-auto rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
          >
            Reverter alterações
          </button>
        )}

        <button
          type="submit"
          disabled={isPending || slugBlocksSave || !hasLogo}
          className="w-full sm:w-auto rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow active:translate-y-0 active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
        >
          {isPending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
