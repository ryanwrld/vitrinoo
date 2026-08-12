"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { productSchema, type ProductInput } from "@/lib/validation/product";
import { saveProduct, updateProduct, unpublishProduct } from "@/lib/products/actions";
import { BRANDS, SOLES, CATEGORIES, FULFILLMENTS, DEFAULT_SIZE_RANGE } from "@/lib/products/constants";
import { SizeGrid } from "./size-grid";
import { PhotoUploader, type SavedPhoto } from "./photo-uploader";

/**
 * Formulário de produto de tela única (D-08), espelhando
 * `configuracoes/settings-form.tsx` (useForm + zodResolver + useTransition +
 * toast; mesmos wrappers de campo label+input+erro, mesmas classes/tokens).
 *
 * Esta fatia (Plan 03-02) renderiza só as seções Identificação/Solado &
 * Categoria/Preço/Descrição — as seções Tamanhos e Fotos (03-UI-SPEC.md
 * §4/§5) chegam nos Plans 03-03/03-04, que devem estender este componente
 * em vez de recriá-lo.
 *
 * Aceita `defaultValues` opcional para reuso no Plan 03-05 (edição) — nesta
 * fatia só o modo criação é exercido (sem prop, formulário em branco).
 *
 * `productId` (opcional, Plan 03-05) diferencia modo edição de criação:
 * - Seção Tamanhos: em criação, "Marcar tudo como esgotado" só mexe no form
 *   state; em edição, chama a Server Action `markProductEsgotado` (ver
 *   size-grid.tsx).
 * - Fotos: em edição, `initialPhotos` pré-carrega o uploader com as fotos já
 *   salvas (URLs públicas) e cada ação chama as Server Actions dedicadas
 *   imediatamente (ver photo-uploader.tsx).
 * - Submit: em criação chama `saveProduct`; em edição chama
 *   `updateProduct(productId, formData)`.
 * - `status` (só relevante em edição) habilita o botão secundário
 *   "Publicar"/"Voltar para rascunho" (D-10) — ação distinta de salvar os
 *   campos, nunca disparada pelo submit do formulário.
 */
export type ProductFormProps = {
  defaultValues?: Partial<ProductInput>;
  productId?: string;
  status?: string;
  initialPhotos?: SavedPhoto[];
};

export function ProductForm({ defaultValues, productId, status, initialPhotos }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPublishPending, startPublishTransition] = useTransition();
  // Espelha o status do produto (edição) só para atualizar o rótulo do botão
  // Publicar/Voltar-para-rascunho sem precisar de router.refresh() — a
  // listagem (Server Component) reflete o status real na próxima navegação.
  const [currentStatus, setCurrentStatus] = useState(status ?? "draft");
  // Modo criação (sem productId): PhotoUploader mantém as fotos comprimidas
  // como File[] local, notificadas aqui via onPendingFilesChange, para
  // serem anexadas ao mesmo FormData de saveProduct (Task 3, 03-04-PLAN.md).
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  // Qual botão de submit foi clicado (Publicar/Rascunho/Salvar) — setado no
  // onClick de cada botão, ANTES do evento de submit do form disparar.
  // useRef (não useState) porque onSubmit roda no mesmo ciclo síncrono do
  // clique: um setState aqui não teria repintado a tempo de ser lido logo
  // em seguida.
  const submitIntentRef = useRef<"publish" | "draft" | "save">("draft");
  // Trava síncrona contra duplo-envio. `disabled={isPending}` não basta: o
  // `handleSubmit` do react-hook-form valida de forma assíncrona, então dois
  // toques rápidos (comum no mobile, em conexão lenta) atravessam a validação
  // antes de `isPending` virar true — e viravam dois produtos.
  const isSubmittingRef = useRef(false);
  // Id do produto criado nesta sessão do formulário. Se o cadastro já criou a
  // linha e algo posterior falhou, qualquer nova tentativa EDITA esse produto
  // em vez de criar outro — é o que torna o retry idempotente.
  const createdIdRef = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      brand: "",
      brandOther: "",
      line: "",
      sole: "",
      category: "",
      fulfillment: undefined,
      price: "",
      description: "",
      hideWhenSoldOut: "",
      ...defaultValues,
      // Pré-seleção 37-43 esgotada por padrão ao criar (D-02/D-03); 36/44/45
      // ficam fora até o revendedor adicioná-las manualmente (D-01). Fica
      // depois do spread para garantir o tipo não-opcional (sempre um
      // array), nunca `undefined`.
      sizes: defaultValues?.sizes ?? DEFAULT_SIZE_RANGE.map((size) => ({ size, available: false })),
    },
  });

  const brandValue = watch("brand");
  const isBrandOther = brandValue === "Outra";

  const onSubmit = (values: ProductInput) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("brand", values.brand);
    formData.set("brandOther", values.brandOther ?? "");
    formData.set("line", values.line ?? "");
    formData.set("sole", values.sole ?? "");
    formData.set("category", values.category ?? "");
    formData.set("fulfillment", values.fulfillment ?? "");
    formData.set("price", values.price);
    formData.set("description", values.description ?? "");
    formData.set("sizes", JSON.stringify(values.sizes ?? []));
    formData.set("hideWhenSoldOut", values.hideWhenSoldOut ?? "");
    // "publish" salva os campos E publica numa ação só (evita a volta:
    // criar/editar -> salvar -> voltar pra lista -> abrir editar de novo só
    // pra achar o botão de publicar). "draft"/"save" salvam sem mexer no
    // status. Ver render dos botões abaixo pra cada combinação por tela.
    formData.set("intent", submitIntentRef.current);
    for (const photoFile of pendingPhotoFiles) {
      formData.append("photos", photoFile);
    }

    startTransition(async () => {
      try {
        const targetId = productId ?? createdIdRef.current;
        const result = targetId ? await updateProduct(targetId, formData) : await saveProduct(formData);

        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        createdIdRef.current = result.id;

        // Produto salvo, fotos não. Manda direto para a edição desse mesmo
        // produto (uploader em modo "salvo", reenvio foto a foto) em vez de
        // deixar o revendedor achando que precisa cadastrar tudo de novo.
        if (result.warning) {
          toast.error(`${result.warning} Os dados do produto já foram salvos.`);
          router.push(`/admin/produtos/${result.id}/editar`);
          return;
        }

        if (submitIntentRef.current === "publish") {
          toast.success("Produto publicado na sua vitrine!");
        } else if (currentStatus === "published") {
          toast.success("Alterações salvas!");
        } else {
          toast.success("Rascunho salvo!");
        }
        router.push("/admin/produtos");
      } finally {
        isSubmittingRef.current = false;
      }
    });
  };

  /**
   * Despublicar (D-10) — a única direção que ainda passa por aqui. Publicar
   * a partir de um rascunho agora acontece dentro do próprio submit
   * (`intent="publish"`, ver onSubmit) pra salvar os campos editados e
   * publicar numa ação só, em vez de duas ações desconectadas. Esta função
   * segue com seu próprio `useTransition` (não desabilita o botão de salvar
   * enquanto despublica) e sem diálogo de confirmação (reversível, baixo
   * risco — T-03-12, 03-UI-SPEC.md).
   */
  function handleUnpublish() {
    if (!productId) return;

    startPublishTransition(async () => {
      const result = await unpublishProduct(productId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setCurrentStatus("draft");
      toast.success("Produto voltou para rascunho.");
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Identificação</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Nome
            </label>
            <input
            id="name"
            type="text"
            {...register("name")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.name && <span className="text-sm text-error-fg">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="brand" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Marca
          </label>
          <div className="relative">
            <select
              id="brand"
              {...register("brand")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="">Selecione a marca</option>
              {BRANDS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          </div>
          {errors.brand && <span className="text-sm text-error-fg">{errors.brand.message}</span>}
        </div>

        {isBrandOther && (
          <div className="flex flex-col gap-1">
            <label htmlFor="brandOther" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Qual marca?
            </label>
            <input
              id="brandOther"
              type="text"
              {...register("brandOther")}
              className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
            />
            {errors.brandOther && (
              <span className="text-sm text-error-fg">{errors.brandOther.message}</span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="line" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Linha (opcional)
          </label>
          <input
            id="line"
            type="text"
            placeholder="Ex.: Mercurial"
            {...register("line")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.line && <span className="text-sm text-error-fg">{errors.line.message}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Solado &amp; Categoria</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="sole" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Solado (opcional)
          </label>
          <div className="relative">
            <select
              id="sole"
              {...register("sole")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="">—</option>
              {SOLES.map((sole) => (
                <option key={sole} value={sole}>
                  {sole}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Categoria (opcional)
          </label>
          <div className="relative">
            <select
              id="category"
              {...register("category")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="">—</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fulfillment" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Modalidade (opcional)
          </label>
          <div className="relative">
            <select
              id="fulfillment"
              {...register("fulfillment")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="">—</option>
              {FULFILLMENTS.map((fulfillment) => (
                <option key={fulfillment.value} value={fulfillment.value}>
                  {fulfillment.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Preço</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="price" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Preço
          </label>
          <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 h-11 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
            <span className="text-base text-gray-500 dark:text-gray-400">R$</span>
            <input
              id="price"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              {...register("price")}
              className="w-full text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-600"
            />
          </div>
          {errors.price && <span className="text-sm text-error-fg">{errors.price.message}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Visibilidade</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="hideWhenSoldOut" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Quando este produto esgotar
          </label>
          <div className="relative">
            <select
              id="hideWhenSoldOut"
              {...register("hideWhenSoldOut")}
              className="w-full min-h-11 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20"
            >
              <option value="">Usar padrão da loja</option>
              <option value="false">Sempre mostrar (esmaecido)</option>
              <option value="true">Ocultar da vitrine</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>

      <SizeGrid control={control} productId={productId} />

      <PhotoUploader
        productId={productId}
        initialPhotos={initialPhotos}
        onPendingFilesChange={setPendingPhotoFiles}
      />

      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Descrição</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Descrição (opcional)
          </label>
          <textarea
            id="description"
            rows={4}
            {...register("description")}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
          />
          {errors.description && (
            <span className="text-sm text-error-fg">{errors.description.message}</span>
          )}
        </div>
      </div>

      {/*
        Três combinações (D-10, revisado): produto novo ou rascunho em edição
        priorizam "Publicar" como ação primária (evita a volta salvar -> lista
        -> reabrir editar só pra achar o botão de publicar); só um produto JÁ
        publicado tem uma única ação primária de salvar, com "Voltar para
        rascunho" como saída secundária de baixo risco (T-03-12).
      */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {currentStatus === "published" ? (
          <>
            <button
              type="submit"
              onClick={() => { submitIntentRef.current = "save"; }}
              disabled={isPending}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
            >
              {isPending ? "Salvando…" : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={handleUnpublish}
              disabled={isPublishPending}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              {isPublishPending ? "Salvando…" : "Voltar para rascunho"}
            </button>
          </>
        ) : (
          <>
            <button
              type="submit"
              onClick={() => { submitIntentRef.current = "publish"; }}
              disabled={isPending}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
            >
              {isPending && submitIntentRef.current === "publish" ? "Publicando…" : "Publicar"}
            </button>
            <button
              type="submit"
              onClick={() => { submitIntentRef.current = productId ? "save" : "draft"; }}
              disabled={isPending}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              {isPending && submitIntentRef.current !== "publish"
                ? "Salvando…"
                : productId
                  ? "Salvar"
                  : "Rascunho"}
            </button>
          </>
        )}
      </div>
    </form>
    </>
  );
}
