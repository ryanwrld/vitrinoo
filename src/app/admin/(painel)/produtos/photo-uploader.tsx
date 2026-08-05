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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PhotoPreview } from "./photo-preview";
import { Plus, X, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { addProductPhotos, updatePhotoOrder, removePhoto } from "@/lib/products/actions";

/**
 * Uploader de até 5 fotos por produto (D-11–D-13, PROD-03,
 * 03-UI-SPEC.md §Photo uploader). Compressão client-side via
 * `browser-image-compression` (Web Worker, correção EXIF automática —
 * Pitfall 4/A1 de 03-RESEARCH.md: NUNCA reprocessar orientação em outra
 * camada) e reordenação touch-friendly via `@dnd-kit/sortable`.
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
  onClickPhoto?: (url: string | null) => void;
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

export function PhotoUploader({ productId, initialPhotos, onPendingFilesChange }: PhotoUploaderProps) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    (initialPhotos ?? []).map((photo) => ({ kind: "saved" as const, id: photo.id, url: photo.url }))
  );
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [processingCount, setProcessingCount] = useState(0);
  const [, startBackgroundTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const emptySlotCount = Math.max(0, MAX_PHOTOS - slots.length - processingCount);

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
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Fotos</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">Até 5 fotos. A primeira é a capa da sua vitrine.</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slots.map(slotKey)} strategy={horizontalListSortingStrategy}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {slots.map((slot, index) => (
              <PhotoSlotItem
                key={slotKey(slot)}
                slot={slot}
                isCover={index === 0}
                onRemove={() => handleRemove(slot)}
                onClickPhoto={() => setActivePhotoIndex(index)}
              />
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

            {Array.from({ length: emptySlotCount }).map((_, index) => (
              <label
                key={`empty-${index}`}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-600"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs">Adicionar foto</span>
                <input type="file" multiple accept={ACCEPTED_TYPES} className="sr-only" onChange={handleFilesSelected} />
              </label>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <PhotoPreview
        urls={slots.map((s) => (s.kind === "saved" ? s.url : s.previewUrl))}
        activeIndex={activePhotoIndex}
        onChange={setActivePhotoIndex}
        onClose={() => setActivePhotoIndex(null)}
      />
    </div>
  );
}

type PhotoSlotItemProps = {
  slot: Slot;
  isCover: boolean;
  onRemove: () => void;
  onClickPhoto?: () => void;
};

/**
 * Slot preenchido (empty/uploading vêm de PhotoUploader diretamente).
 * `useSortable` só participa da grade quando o slot está preenchido — slots
 * vazios não são drop targets (03-UI-SPEC.md §Photo uploader).
 */
function PhotoSlotItem({ slot, isCover, onRemove, onClickPhoto }: PhotoSlotItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slotKey(slot) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClickPhoto}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 ${isDragging ? "opacity-50" : ""}`}
    >
      {slot.kind === "saved" ? (
        <Image src={slot.url} alt="" fill sizes="20vw" className="object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- preview de object URL local (blob:), next/image não serve esse esquema
        <img src={slot.previewUrl} alt="" className="h-full w-full object-cover" />
      )}

      {isCover && (
        <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-xs text-white">Capa</span>
      )}

      {/*
        Área de toque (botão) mantém 44x44px cheio — mínimo recomendado para
        alvo tocável no mobile — mas o círculo VISÍVEL dentro dela é bem menor,
        para não tampar a miniatura da foto. Sombra + leve zoom no hover dá um
        alvo preciso e discreto pro usuário de mouse/desktop também.
      */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reordenar foto"
        className="group absolute bottom-0 left-0 flex h-11 w-11 items-center justify-center"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-gray-900 shadow-sm transition group-hover:scale-110 group-hover:bg-white dark:bg-gray-800/85 dark:text-gray-50 dark:group-hover:bg-gray-800">
          <GripVertical className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover foto"
        className="group absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-error-solid shadow-sm transition group-hover:scale-110 group-hover:bg-white dark:bg-gray-800/85 dark:group-hover:bg-gray-800">
          <X className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
