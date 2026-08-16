"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
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
import { ProductLayout } from "./product-layout";

/**
 * Formulário de produto — layout de duas colunas (D-08 rev.).
 *
 * Desktop (≥ lg): grid 50/50 (via ProductLayout).
 *   Esquerda: Identificação → Solado & Cat. → Visibilidade → Preço → Descrição → Ações
 *   Direita:  Fotos (preview + grade) → Tamanhos
 *
 * Mobile (< lg): coluna única, mas a direita (Fotos → Tamanhos) vem PRIMEIRO —
 * `order-1`/`order-2` em `ProductLayout`, sem duplicar/mover nenhum node.
 *
 * A base do card "Tamanhos" é esticada (via ResizeObserver, ver os refs
 * `precoCardRef`/`tamanhosCardRef`/`leftStackRef`/`fotosWrapRef` abaixo) para
 * coincidir exatamente com a base do card "Preço" no desktop — só ativo em
 * telas ≥ lg, onde as duas colunas existem lado a lado.
 *
 * Toda a lógica de negócio (validação, submit, publish/draft, revert,
 * idempotência, upload) permanece intocada em relação à versão anterior.
 *
 * `productId` (opcional) diferencia modo edição de criação — ver comentários
 * na versão anterior para o detalhe de cada bifurcação.
 */
export type ProductFormProps = {
  header: ReactNode;
  defaultValues?: Partial<ProductInput>;
  productId?: string;
  status?: string;
  initialPhotos?: SavedPhoto[];
};

/* ── Tokens visuais reutilizáveis ────────────────────────────────────────── */
const cardCls =
  "flex flex-col gap-4 rounded-[2rem] border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900";
const labelCls = "text-sm font-medium text-gray-700 dark:text-gray-300";
const inputCls =
  "rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20";
const selectCls =
  "w-full min-h-11 appearance-none rounded-xl border border-gray-300 bg-white px-3 pr-9 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-blue-400/20";
const errorCls = "text-sm text-error-fg";
const fieldCls = "flex flex-col gap-1";

export function ProductForm({ header, defaultValues, productId, status, initialPhotos }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPublishPending, startPublishTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(status ?? "draft");
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<File[]>([]);
  const submitIntentRef = useRef<"publish" | "draft" | "save">("draft");
  const isSubmittingRef = useRef(false);
  const createdIdRef = useRef<string | null>(null);

  /* ── Alinhamento milimétrico da base "Tamanhos" ↔ base "Preço" ──────────
   * Os dois cards ficam exatamente onde já estavam (colunas independentes,
   * sem reordenar nada) — só a base do card Tamanhos é esticada com
   * `minHeight` para coincidir com a base do card Preço, calculada a partir
   * da posição real dos dois na tela. `leftStackRef` cobre tudo que fica
   * ACIMA de Preço na coluna esquerda (Identificação/Solado/Visibilidade) e
   * `fotosWrapRef` cobre o que fica ACIMA de Tamanhos na direita (Fotos) —
   * um ResizeObserver nos dois recalcula sempre que algo empurra a posição
   * de um dos dois cards (campo condicional aparecendo, erro de validação,
   * foto adicionada/removida etc.). Só ativo em telas ≥ lg — no mobile as
   * colunas empilham em ordem de DOM e a base de um card não deve depender
   * do outro.
   */
  const leftStackRef = useRef<HTMLDivElement>(null);
  const precoCardRef = useRef<HTMLDivElement>(null);
  const fotosWrapRef = useRef<HTMLDivElement>(null);
  const tamanhosCardRef = useRef<HTMLDivElement>(null);
  const [tamanhosMinHeight, setTamanhosMinHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");

    function sync() {
      const precoEl = precoCardRef.current;
      const tamanhosEl = tamanhosCardRef.current;
      if (!precoEl || !tamanhosEl || !mql.matches) {
        setTamanhosMinHeight(undefined);
        return;
      }

      // Calculado sempre a partir das posições reais na tela (não da altura
      // atual do card, que já pode estar esticada por um cálculo anterior —
      // usar a altura renderizada como base faria o valor só crescer, nunca
      // encolher de volta quando Preço fica mais curto).
      const precoBottom = precoEl.getBoundingClientRect().bottom;
      const tamanhosTop = tamanhosEl.getBoundingClientRect().top;
      const target = precoBottom - tamanhosTop;

      if (target <= 0) {
        setTamanhosMinHeight(undefined);
        return;
      }

      setTamanhosMinHeight((prev) => (prev !== undefined && Math.abs(prev - target) < 0.5 ? prev : target));
    }

    sync();

    const ro = new ResizeObserver(sync);
    if (leftStackRef.current) ro.observe(leftStackRef.current);
    if (fotosWrapRef.current) ro.observe(fotosWrapRef.current);
    mql.addEventListener("change", sync);
    window.addEventListener("resize", sync);

    return () => {
      ro.disconnect();
      mql.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    formState: { errors, isDirty },
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
      sizes: defaultValues?.sizes ?? DEFAULT_SIZE_RANGE.map((size) => ({ size, available: true })),
    },
  });

  const brandValue = watch("brand");
  const isBrandOther = brandValue === "Outra";

  const handleRevert = () => {
    reset();
    toast.success("Alterações revertidas.");
  };

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

        if (result.warning) {
          toast.error(`${result.warning} Produto salvo, reenvie a foto.`);
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

  function handleUnpublish() {
    if (!productId) return;

    startPublishTransition(async () => {
      const result = await unpublishProduct(productId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setCurrentStatus("draft");
      toast.success("Movido para rascunho. Saiu da vitrine.");
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * O <form> envolve o ProductLayout inteiro.
   * className="contents" no form não cria uma caixa — é transparente para o
   * grid, então o layout de duas colunas não é quebrado por um wrapper extra.
   * Os botões de submit vivem na coluna direita (dentro do form → válido).
   * ────────────────────────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents">
      <ProductLayout
        header={header}
        left={
          <div ref={leftStackRef} className="flex flex-col gap-4">
            {/* ── Col. esquerda: campos de metadados ── */}

            {/* Identificação */}
            <div className={cardCls}>
              <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Identificação</h2>

              <div className={fieldCls}>
                <label htmlFor="name" className={labelCls}>Nome</label>
                <input id="name" type="text" {...register("name")} className={inputCls} />
                {errors.name && <span className={errorCls}>{errors.name.message}</span>}
              </div>

              <div className={fieldCls}>
                <label htmlFor="brand" className={labelCls}>Marca</label>
                <div className="relative">
                  <select id="brand" {...register("brand")} className={selectCls}>
                    <option value="">Selecione a marca</option>
                    {BRANDS.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
                {errors.brand && <span className={errorCls}>{errors.brand.message}</span>}
              </div>

              {isBrandOther && (
                <div className={fieldCls}>
                  <label htmlFor="brandOther" className={labelCls}>Qual marca?</label>
                  <input id="brandOther" type="text" {...register("brandOther")} className={inputCls} />
                  {errors.brandOther && <span className={errorCls}>{errors.brandOther.message}</span>}
                </div>
              )}

              <div className={fieldCls}>
                <label htmlFor="line" className={labelCls}>Linha (opcional)</label>
                <input
                  id="line"
                  type="text"
                  placeholder="Ex.: Mercurial"
                  {...register("line")}
                  className={inputCls}
                />
                {errors.line && <span className={errorCls}>{errors.line.message}</span>}
              </div>
            </div>

            {/* Solado & Categoria */}
            <div className={cardCls}>
              <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Solado &amp; Categoria</h2>

              <div className={fieldCls}>
                <label htmlFor="sole" className={labelCls}>Solado (opcional)</label>
                <div className="relative">
                  <select id="sole" {...register("sole")} className={selectCls}>
                    <option value="">—</option>
                    {SOLES.map((sole) => (
                      <option key={sole} value={sole}>{sole}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
              </div>

              <div className={fieldCls}>
                <label htmlFor="category" className={labelCls}>Categoria (opcional)</label>
                <div className="relative">
                  <select id="category" {...register("category")} className={selectCls}>
                    <option value="">—</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
              </div>

              <div className={fieldCls}>
                <label htmlFor="fulfillment" className={labelCls}>Modalidade (opcional)</label>
                <div className="relative">
                  <select id="fulfillment" {...register("fulfillment")} className={selectCls}>
                    <option value="">—</option>
                    {FULFILLMENTS.map((fulfillment) => (
                      <option key={fulfillment.value} value={fulfillment.value}>{fulfillment.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
              </div>
            </div>

            {/* Visibilidade */}
            <div className={cardCls}>
              <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Visibilidade</h2>

              <div className={fieldCls}>
                <label htmlFor="hideWhenSoldOut" className={labelCls}>Quando este produto esgotar</label>
                <div className="relative">
                  <select id="hideWhenSoldOut" {...register("hideWhenSoldOut")} className={selectCls}>
                    <option value="">Usar padrão da loja</option>
                    <option value="false">Sempre mostrar (esmaecido)</option>
                    <option value="true">Ocultar da vitrine</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                </div>
              </div>
            </div>

            {/* Preço */}
            <div ref={precoCardRef} className={cardCls}>
              <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Valor do produto</h2>

              <div className={fieldCls}>
                <label htmlFor="price" className={labelCls}>Preço</label>
                <div className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 h-11 transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
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
                {errors.price && <span className={errorCls}>{errors.price.message}</span>}
              </div>
            </div>

            {/* Descrição */}
            <div className={cardCls}>
              <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Descrição</h2>

              <div className={fieldCls}>
                <label htmlFor="description" className={labelCls}>Descrição (opcional)</label>
                <textarea
                  id="description"
                  rows={4}
                  {...register("description")}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
                />
                {errors.description && (
                  <span className={errorCls}>{errors.description.message}</span>
                )}
              </div>
            </div>

            {/* Botões de ação — fim da coluna esquerda, após todos os campos. */}
            <div className="flex flex-col gap-3 sm:flex-row">
              {currentStatus === "published" ? (
                <>
                  <button
                    type="submit"
                    onClick={() => { submitIntentRef.current = "save"; }}
                    disabled={isPending}
                    className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
                  >
                    {isPending ? "Salvando…" : "Salvar alterações"}
                  </button>
                  {isDirty ? (
                    <button
                      type="button"
                      onClick={handleRevert}
                      disabled={isPending}
                      className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
                    >
                      Reverter alterações
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUnpublish}
                      disabled={isPublishPending}
                      className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
                    >
                      {isPublishPending ? "Salvando…" : "Rascunho"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="submit"
                    onClick={() => { submitIntentRef.current = "publish"; }}
                    disabled={isPending}
                    className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none dark:disabled:bg-gray-800 dark:disabled:text-gray-600"
                  >
                    {isPending && submitIntentRef.current === "publish" ? "Publicando…" : "Publicar"}
                  </button>
                  <button
                    type="submit"
                    onClick={() => { submitIntentRef.current = productId ? "save" : "draft"; }}
                    disabled={isPending}
                    className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-all duration-150 hover:bg-gray-100 active:bg-gray-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800 dark:active:bg-gray-700"
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
          </div>
        }
        right={
          <>
            {/* ── Col. direita: Fotos + Tamanhos ── */}
            <div ref={fotosWrapRef}>
              <PhotoUploader
                productId={productId}
                initialPhotos={initialPhotos}
                onPendingFilesChange={setPendingPhotoFiles}
              />
            </div>

            <SizeGrid
              ref={tamanhosCardRef}
              control={control}
              productId={productId}
              style={tamanhosMinHeight !== undefined ? { minHeight: tamanhosMinHeight } : undefined}
            />
          </>
        }
      />
    </form>
  );
}
