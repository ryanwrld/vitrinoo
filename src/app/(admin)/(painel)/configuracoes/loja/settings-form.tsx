"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AsYouType } from "libphonenumber-js";
import { ChevronDown, Paintbrush, MessageCircle } from "lucide-react";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";
import { saveStoreSettings } from "@/lib/settings/actions";

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
    accentColor: string | null;
    tagline: string | null;
    hideSoldOutDefault: boolean;
  };
  settings: {
    whatsapp: string;
    messageTemplate: string;
  };
};

export function SettingsForm({ store, settings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: store.name,
      accentColor: store.accentColor ?? "#0D21A1",
      tagline: store.tagline ?? "",
      whatsapp: settings.whatsapp,
      messageTemplate: settings.messageTemplate,
      hideSoldOutDefault: store.hideSoldOutDefault ? "true" : "false",
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

  const whatsappValue = watch("whatsapp");
  const formattedPreview = whatsappValue ? new AsYouType("BR").input(whatsappValue) : "";

  const onSubmit = (values: OnboardingInput) => {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("accentColor", values.accentColor ?? "");
    formData.set("tagline", values.tagline ?? "");
    formData.set("whatsapp", values.whatsapp);
    formData.set("messageTemplate", values.messageTemplate);
    formData.set("hideSoldOutDefault", values.hideSoldOutDefault ?? "false");
    if (logoFile) {
      formData.set("logo", logoFile);
    }

    startTransition(async () => {
      const result = await saveStoreSettings(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações salvas!");
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <Paintbrush className="h-5 w-5" />
          <h2 className="font-display font-bold">Identidade visual</h2>
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
          <label htmlFor="logo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Logo (opcional)
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
            <div className="flex flex-1 flex-col gap-1">
              {/* Input nativo escondido — o texto padrão do navegador
                  ("Nenhum arquivo escolhido") não reflete se já existe uma
                  logo salva, então trocamos por um botão + legenda próprios. */}
              <input
                id="logo"
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="self-start rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {store.logoUrl ? "Trocar logo" : "Escolher logo"}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {logoFile ? logoFile.name : "PNG, JPG ou WEBP"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="accentColor" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Cor de destaque
          </label>
          <input
            id="accentColor"
            type="color"
            {...register("accentColor")}
            className="h-10 w-20 rounded-md border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900"
          />
          {errors.accentColor && (
            <span className="text-sm text-error-fg">{errors.accentColor.message}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tagline" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Frase de apresentação (opcional, até 100 caracteres)
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
          <label htmlFor="hideSoldOutDefault" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Ocultar produtos esgotados por padrão
          </label>
          <div className="relative">
            <select
              id="hideSoldOutDefault"
              {...register("hideSoldOutDefault")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="false">Não — mostrar esmaecido (padrão)</option>
              <option value="true">Sim — ocultar da vitrine</option>
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
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.messageTemplate && (
            <span className="text-sm text-error-fg">{errors.messageTemplate.message}</span>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto sm:self-end rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow active:translate-y-0 active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
      >
        {isPending ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}
