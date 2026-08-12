"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { addProductPhotos, updatePhotoOrder, removePhoto } from "@/lib/products/actions";

/**
 * Painel de fotos do produto (até 5, D-11–D-13, PROD-03). Fixo/sticky ao lado
 * do formulário em telas largas (product-form.tsx cuida do posicionamento via
 * `className`), empilhado como mais uma seção em telas estreitas.
 *
 * Lista VERTICAL (não um hero + tira de miniaturas): a coluna lateral é alta
 * e estreita, e uma foto grande "hero" forçada a preencher essa altura toda
 * ou vira letterboxing (contain, sobra vão) ou corta a foto de um jeito
 * estranho (cover numa proporção retrato extrema). Uma lista vertical cresce
 * NATURALMENTE com a altura disponível (mais fotos = coluna mais alta, do
 * mesmo jeito que o formulário fica mais alto com mais tamanhos/descrição) e
 * cada foto já aparece grande o bastante pra examinar — não tem "selecionar
 * qual foto ver", todas ficam visíveis ao mesmo tempo. Isso também elimina a
 * distinção entre "grade de upload" e "tira de preview" que existia antes:
 * um único cartão por foto já reordena (arrastar), remove (X), marca capa
 * (badge na primeira) e mostra a foto inteira, sem esconder nem cortar nada
 * relevante.
 *
 * Dois modos, mesma UI:
 * - **Criação** (sem `productId`): fotos comprimidas ficam como File[] em
 *   memória (slots "pending"); `onPendingFilesChange` notifica
 *   product-form.tsx a cada mudança, para anexar ao mesmo FormData de
 *   `saveProduct` no submit (nunca upload antes do produto existir).
 * - **Edição** (`productId` presente, Plan 03-05): cada ação
 *   (adicionar/remover/reordenar) chama imediatamente a Server Action
 *   dedicada (`addProductPhotos`/`removePhoto`/`updatePhotoOrder`) — os
 *   slots são sempre "saved" (id real + URL pública).
 */
const MAX_PHOTOS = 5;
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

export type SavedPhoto = { id: string; url: string };

type Slot =
  | { kind: "saved"; id: string; url: string }
  | { kind: "pending"; localId: string; file: File; previewUrl: string };

export type PhotoUploaderProps = {
  productId?: string;
  initialPhotos?: SavedPhoto[];
  onPendingFilesChange?: (files: File[]) => void;
  className?: string;
};

function slotKey(slot: Slot): string {
  return slot.kind === "saved" ? slot.id : slot.localId;
}

/**
 * `crypto.randomUUID()` só existe em contexto seguro (HTTPS ou localhost) —
 * indisponível ao testar via IP de rede local em HTTP puro. Este id é só uma
 * key de UI para um slot ainda não enviado (nunca persiste no banco), então
 * um fallback não-criptográfico é suficiente.
 */
function localSlotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pendingFilesOf(slots: Slot[]): File[] {
  return slots
    .filter((slot): slot is Extract<Slot, { kind: "pending" }> => slot.kind === "pending")
    .map((slot) => slot.file);
}

/**
 * Modo edição: após adicionar uma foto via `addProductPhotos`, a Server
 * Action não retorna os dados da foto criada (só `{success, id: productId}`)
 * — recarregar via o client de browser (RLS já garante escopo por dono) é
 * mais simples do que estender o retorno da action só para isso.
 */
async function refreshSavedPhotos(productId: string): Promise<SavedPhoto[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("product_photos")
    .select("id, storage_path")
    .eq("product_id", productId)
    .order("position", { ascending: true });

  if (!data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    url: supabase.storage.from("product-images").getPublicUrl(row.storage_path).data.publicUrl,
  }));
}

export function PhotoUploader({ productId, initialPhotos, onPendingFilesChange, className }: PhotoUploaderProps) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    (initialPhotos ?? []).map((photo) => ({ kind: "saved" as const, id: photo.id, url: photo.url }))
  );
  const [processingCount, setProcessingCount] = useState(0);
  const [, startBackgroundTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const canAddMore = slots.length + processingCount < MAX_PHOTOS;

  // Notifica o form pai (modo criação) DEPOIS do commit, nunca de dentro do
  // updater de `setSlots` — chamar o setState do pai ali dentro disparava
  // "Cannot update a component while rendering a different component".
  useEffect(() => {
    if (!productId) {
      onPendingFilesChange?.(pendingFilesOf(slots));
    }
  }, [slots, productId, onPendingFilesChange]);

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    // Copiar para um array ANTES de limpar o input: em alguns navegadores
    // (ex.: Edge/Chromium) `FileList` é esvaziada junto com `input.value`,
    // então limpar antes de ler os arquivos perde a seleção silenciosamente.
    const incoming = fileList ? Array.from(fileList) : [];
    // Permite escolher o mesmo arquivo de novo no futuro (ex.: depois de remover).
    event.target.value = "";
    if (incoming.length === 0) {
      return;
    }

    const roomLeft = MAX_PHOTOS - slots.length;
    if (roomLeft <= 0) {
      toast.error("Você já atingiu o limite de 5 fotos por produto.");
      return;
    }
    if (incoming.length > roomLeft) {
      toast.error("Você já atingiu o limite de 5 fotos por produto.");
    }
    const toProcess = incoming.slice(0, roomLeft);

    for (const file of toProcess) {
      setProcessingCount((count) => count + 1);
      try {
        // Compressão + correção EXIF automática (Pitfall 4/A1) — único lugar
        // do pipeline onde isso acontece, nunca refeito em outra camada.
        const compressed = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
        });

        if (productId) {
          const formData = new FormData();
          formData.append("photos", compressed);
          const result = await addProductPhotos(productId, formData);
          if ("error" in result) {
            toast.error(result.error);
          } else {
            const refreshed = await refreshSavedPhotos(productId);
            setSlots(refreshed.map((photo) => ({ kind: "saved" as const, id: photo.id, url: photo.url })));
          }
        } else {
          const previewUrl = URL.createObjectURL(compressed);
          setSlots((prev) => [
            ...prev,
            { kind: "pending" as const, localId: localSlotId(), file: compressed, previewUrl },
          ]);
        }
      } catch {
        toast.error("Não foi possível processar essa foto. Tente novamente.");
      } finally {
        setProcessingCount((count) => Math.max(0, count - 1));
      }
    }
  }

  function handleRemove(slot: Slot) {
    if (slot.kind === "pending") {
      URL.revokeObjectURL(slot.previewUrl);
      setSlots((prev) => prev.filter((item) => slotKey(item) !== slotKey(slot)));
      return;
    }

    const photoId = slot.id;
    // Otimista: esvazia o slot na hora (D-13), toast só se a remoção falhar.
    setSlots((prev) => prev.filter((item) => slotKey(item) !== photoId));
    startBackgroundTransition(async () => {
      const result = await removePhoto(photoId);
      if ("error" in result) {
        toast.error(result.error);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = slots.findIndex((slot) => slotKey(slot) === active.id);
    const newIndex = slots.findIndex((slot) => slotKey(slot) === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Reordenar é um evento discreto (soltar o drag), não uma atualização
    // derivada de state anterior — computar fora do updater evita repetir a
    // Server Action de persistência caso o updater rode 2x (Strict Mode).
    const reordered = arrayMove(slots, oldIndex, newIndex);
    setSlots(reordered);

    if (productId) {
      const order = reordered
        .filter((slot): slot is Extract<Slot, { kind: "saved" }> => slot.kind === "saved")
        .map((slot, index) => ({ id: slot.id, position: index }));

      // Otimista (D-12): reordena na hora, persiste em background, toast só em falha.
      startBackgroundTransition(async () => {
        const result = await updatePhotoOrder(order);
        if ("error" in result) {
          toast.error(result.error);
        }
      });
    }
    // Modo criação (!productId): a notificação ao form pai acontece no
    // useEffect acima, disparado pela mudança de `slots`.
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 ${className ?? ""}`}
    >
      <div>
        <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Fotos</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Até 5 fotos. A primeira é a capa da sua vitrine.</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slots.map(slotKey)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {slots.map((slot, index) => (
              <PhotoListItem key={slotKey(slot)} slot={slot} isCover={index === 0} onRemove={() => handleRemove(slot)} />
            ))}

            {Array.from({ length: processingCount }).map((_, index) => (
              <div
                key={`processing-${index}`}
                className="flex aspect-square items-center justify-center rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
              >
                <div className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span className="text-xs">Enviando…</span>
                </div>
              </div>
            ))}

            {canAddMore && (
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-600 ${
                  slots.length === 0 ? "aspect-square" : "py-6"
                }`}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs">Adicionar foto</span>
                <input type="file" multiple accept={ACCEPTED_TYPES} className="sr-only" onChange={handleFilesSelected} />
              </label>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

type PhotoListItemProps = {
  slot: Slot;
  isCover: boolean;
  onRemove: () => void;
};

/**
 * Cartão de foto em largura total (não mais uma miniatura pequena numa
 * grade) — os alvos de toque de 44px de reordenar/remover ficam nos cantos
 * de um cartão bem maior agora, então não há mais risco de eles se
 * sobrepor ao centro clicável (bug encontrado e corrigido na versão anterior
 * deste componente, com a grade de miniaturas estreita).
 */
function PhotoListItem({ slot, isCover, onRemove }: PhotoListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slotKey(slot) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-square w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 ${isDragging ? "opacity-50" : ""}`}
    >
      {slot.kind === "saved" ? (
        <Image src={slot.url} alt="" fill sizes="(min-width: 1280px) 33vw, 90vw" className="object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- preview de object URL local (blob:), next/image não serve esse esquema
        <img src={slot.previewUrl} alt="" className="h-full w-full object-cover" />
      )}

      {isCover && (
        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs text-white">Capa</span>
      )}

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reordenar foto"
        className="group absolute bottom-1 left-1 flex h-11 w-11 items-center justify-center"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-sm transition group-hover:scale-110 group-hover:bg-white dark:bg-gray-800/90 dark:text-gray-50 dark:group-hover:bg-gray-800">
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover foto"
        className="group absolute right-1 top-1 flex h-11 w-11 items-center justify-center"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-error-solid shadow-sm transition group-hover:scale-110 group-hover:bg-white dark:bg-gray-800/90 dark:group-hover:bg-gray-800">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
