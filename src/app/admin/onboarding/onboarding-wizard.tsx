"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AsYouType } from "libphonenumber-js";
import {
  onboardingSchema,
  DEFAULT_MESSAGE_TEMPLATE,
  type OnboardingInput,
} from "@/lib/validation/onboarding";
import { saveOnboarding } from "@/lib/onboarding/actions";
import { LogoMark } from "@/components/logo-mark";

/**
 * Wizard de onboarding em tela única (decisão de UI a critério do executor,
 * conforme 01-CONTEXT.md — poucos campos obrigatórios, percebido como
 * rápido). `name`, `whatsapp` e a LOGO são obrigatórios; cor/frase
 * continuam opcionais. O template de mensagem vem pré-preenchido e editável
 * (Pergunta em Aberto #2 do 01-RESEARCH.md).
 *
 * Logo obrigatória vale DESDE o onboarding (decisão do usuário, antes era
 * opcional) — e continua obrigatória depois, em /configuracoes
 * (settings-form.tsx). Aqui o botão "Concluir" fica desabilitado sem arquivo
 * escolhido, e a mesma exigência é revalidada no servidor (`saveOnboarding`),
 * já que o disabled do cliente não é garantia contra uma requisição direta à
 * action.
 *
 * A prévia de telefone usa `AsYouType` (formatação de exibição, client-side)
 * só para feedback visual enquanto o revendedor digita — NUNCA é o valor
 * enviado/persistido. A normalização real e definitiva acontece uma única
 * vez dentro de `saveOnboarding` (Armadilha 2 do 01-RESEARCH.md).
 */
export function OnboardingWizard() {
  const [isPending, startTransition] = useTransition();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: "",
      accentColor: "#0D21A1",
      tagline: "",
      whatsapp: "",
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    },
  });

  const whatsappValue = watch("whatsapp");
  const formattedPreview = whatsappValue ? new AsYouType("BR").input(whatsappValue) : "";

  const onSubmit = (values: OnboardingInput) => {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("accentColor", values.accentColor ?? "");
    formData.set("tagline", values.tagline ?? "");
    formData.set("whatsapp", values.whatsapp);
    formData.set("messageTemplate", values.messageTemplate);
    // Fuso do aparelho do revendedor (migration 0013) — nenhum campo novo no
    // wizard: o navegador já sabe, e perguntar isso a um usuário não-técnico
    // seria fricção sem retorno. O servidor NUNCA confia neste valor cru
    // (`resolveTimeZone` valida e cai em São Paulo), então um navegador que
    // não resolva o fuso apenas mantém o comportamento antigo.
    formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    if (logoFile) {
      formData.set("logo", logoFile);
    }

    startTransition(async () => {
      const result = await saveOnboarding(formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-dot-pattern p-6">
      <div className="flex w-full max-w-lg flex-col gap-6 rounded-xl bg-white p-8 shadow-lg">
        {/* Logo no topo do card */}
        <div className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="font-display text-lg font-extrabold text-gray-900">Vitrinoo</span>
        </div>

        <div>
          <h1 className="font-display text-2xl font-extrabold text-gray-900">Configure sua vitrine</h1>
          <p className="mt-1 text-sm text-gray-500">
            Só o essencial para começar — você pode ajustar tudo depois no painel.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-gray-700">
            Nome da loja
          </label>
          <input
            id="name"
            type="text"
            autoComplete="organization"
            {...register("name")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.name && <span className="text-sm text-error-solid">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="logo" className="text-sm font-medium text-gray-700">
            Logo
          </label>
          <input
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle"
          />
          {/* Legenda sempre visível (não é erro de submit): explica por que o
              botão "Concluir" está desabilitado antes de o usuário escolher
              um arquivo — um botão travado sem explicação é o tipo de "ação
              sem feedback visual imediato" que o próprio produto evita em
              todas as outras telas. */}
          <span className="text-xs text-gray-500">
            {logoFile ? logoFile.name : "PNG, JPG ou WEBP — obrigatório para continuar"}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="accentColor" className="text-sm font-medium text-gray-700">
            Cor de destaque
          </label>
          <input
            id="accentColor"
            type="color"
            {...register("accentColor")}
            className="h-10 w-20 rounded-md border border-gray-300 bg-white p-1"
          />
          {errors.accentColor && (
            <span className="text-sm text-error-solid">{errors.accentColor.message}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tagline" className="text-sm font-medium text-gray-700">
            Frase de apresentação (opcional, até 100 caracteres)
          </label>
          <input
            id="tagline"
            type="text"
            maxLength={100}
            {...register("tagline")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.tagline && <span className="text-sm text-error-solid">{errors.tagline.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="whatsapp" className="text-sm font-medium text-gray-700">
            WhatsApp
          </label>
          <input
            id="whatsapp"
            type="tel"
            placeholder="(11) 99999-9999"
            {...register("whatsapp")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {formattedPreview && (
            <span className="text-xs text-gray-500">Prévia: {formattedPreview}</span>
          )}
          {errors.whatsapp && <span className="text-sm text-error-solid">{errors.whatsapp.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="messageTemplate" className="text-sm font-medium text-gray-700">
            Template da mensagem de pedido
          </label>
          <textarea
            id="messageTemplate"
            rows={6}
            {...register("messageTemplate")}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.messageTemplate && (
            <span className="text-sm text-error-solid">{errors.messageTemplate.message}</span>
          )}
        </div>

          <button
            type="submit"
            disabled={isPending || !logoFile}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
          >
            {isPending ? "Salvando…" : "Concluir e ver minha vitrine"}
          </button>
        </form>
      </div>
    </main>
  );
}
