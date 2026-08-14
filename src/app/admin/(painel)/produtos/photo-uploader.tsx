"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, Loader2, ImageIcon } from "lucide-react";
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
 *
 * Layout:
 * - Preview grande fixo no topo: mostra a foto ativa (capa por padrão).
 *   Clicar numa miniatura atualiza o preview. Nenhum painel lateral.
 * - Grade de miniaturas abaixo do preview, com drag-and-drop.
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
};

function slotKey(slot: Slot): string {
  return slot.kind === "saved" ? slot.id : slot.localId;
}

function slotUrl(slot: Slot): string {
  return slot.kind === "saved" ? slot.url : slot.previewUrl;
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
  // Índice da foto ativa no preview grande — por padrão a capa (0).
  const [activeIndex, setActiveIndex] = useState<number>(0);
  // Id do slot sendo arrastado no momento — alimenta o `DragOverlay` (ver
  // abaixo). Sem overlay, o dnd-kit só move o próprio item via CSS transform
  // DENTRO do fluxo normal do documento: arrastar pra fora da grade fazia a
  // miniatura flutuar por cima de campos do formulário sem elevação nem
  // limite de área, parecendo quebrado. O overlay renderiza um clone fixo
  // (portal) que segue o ponteiro livremente, e o item original na grade
  // continua só com a opacidade reduzida (`isDragging`) no lugar dele.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [processingCount, setProcessingCount] = useState(0);
  const [, startBackgroundTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const emptySlotCount = Math.max(0, MAX_PHOTOS - slots.length - processingCount);

  // Se o activeIndex aponta para um slot que foi removido, volta para 0.
  const safeActiveIndex = slots.length > 0 ? Math.min(activeIndex, slots.length - 1) : 0;
  const activeSlot = slots[safeActiveIndex] ?? null;
  const activeUrl = activeSlot ? slotUrl(activeSlot) : null;

  const draggingIndex = draggingId ? slots.findIndex((slot) => slotKey(slot) === draggingId) : -1;
  const draggingSlot = draggingIndex !== -1 ? slots[draggingIndex] : null;

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

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);

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

    // Ajusta o activeIndex para seguir a foto que estava ativa.
    const movedKey = slotKey(slots[oldIndex]);
    const newActive = reordered.findIndex((s) => slotKey(s) === movedKey);
    if (newActive !== -1) setActiveIndex(newActive);

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
      <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Imagens do produto</h2>

      {/* ── Preview grande fixo ──────────────────────────────────────────────
          Mostra a foto ativa em tamanho real. Enquanto não há fotos, exibe
          um placeholder com ícone + label para convidar o upload.
          aspect-[4/3] mantém proporção consistente independente da foto.
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800" style={{ aspectRatio: "1/1" }}>
        {activeUrl ? (
          <Image
            key={activeUrl}
            src={activeUrl}
            alt="Preview da foto ativa"
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-contain"
            priority
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-600">
            <ImageIcon className="h-10 w-10" aria-hidden="true" />
            <span className="text-sm">Nenhuma foto adicionada</span>
          </div>
        )}
      </div>

      {/* ── Grade de miniaturas ──────────────────────────────────────────────
          `id` fixo é obrigatório aqui, não cosmético. Sem ele, o dnd-kit gera o
          `aria-describedby` de cada item por um contador GLOBAL de módulo
          (`useUniqueId` em @dnd-kit/utilities): no processo do servidor esse
          contador acumula entre requisições, enquanto no navegador ele sempre
          começa do zero. O resultado era um erro de hidratação intermitente
          ("DndDescribedBy-3" no servidor vs "DndDescribedBy-0" no cliente) que
          aparecia no overlay do Next só de vez em quando. Passar um `id`
          curto-circuita o contador e torna os ids determinísticos.
      ─────────────────────────────────────────────────────────────────────── */}
      <DndContext
        id="product-photos"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <SortableContext items={slots.map(slotKey)} strategy={horizontalListSortingStrategy}>
          <div className="grid grid-cols-5 gap-2">
            {slots.map((slot, index) => (
              <PhotoSlotItem
                key={slotKey(slot)}
                slot={slot}
                isCover={index === 0}
                isActive={index === safeActiveIndex}
                onRemove={() => handleRemove(slot)}
                onSelect={() => setActiveIndex(index)}
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
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-primary hover:text-primary dark:border-gray-700 dark:text-gray-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                <span className="text-[10px] text-center leading-tight">Adicionar</span>
                <input type="file" multiple accept={ACCEPTED_TYPES} className="sr-only" onChange={handleFilesSelected} />
              </label>
            ))}
          </div>
        </SortableContext>

        {/*
          Clone flutuante (portal, fora do fluxo do documento) que segue o
          ponteiro livremente — inclusive por cima de qualquer outro campo
          do formulário — com elevação própria. Sem isso, arrastar pra fora
          da grade deixava o item real (preso ao layout da grade) flutuando
          sem sombra/z-index por cima de campos do form, parecendo quebrado.
        */}
        <DragOverlay>
          {draggingSlot ? (
            <div className="h-24 w-24 cursor-grabbing overflow-hidden rounded-lg border-2 border-primary shadow-xl">
              {draggingSlot.kind === "saved" ? (
                <Image src={draggingSlot.url} alt="" width={96} height={96} className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- preview de object URL local (blob:), next/image não serve esse esquema
                <img src={draggingSlot.previewUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

type PhotoSlotItemProps = {
  slot: Slot;
  isCover: boolean;
  isActive: boolean;
  onRemove: () => void;
  onSelect: () => void;
};

/**
 * Miniatura individual com drag-and-drop.
 * Clicar na imagem seleciona a foto no preview grande (onSelect); segurar e
 * arrastar a MESMA imagem reordena — sem handle dedicado. O `PointerSensor`
 * tem `activationConstraint: { distance: 4 }` (ver mais acima), então um
 * toque/clique curto sempre vira `onSelect` e só um arraste de fato dispara
 * o drag do dnd-kit; os dois gestos não competem.
 * O anel azul indica qual foto está ativa no preview.
 */
function PhotoSlotItem({ slot, isCover, isActive, onRemove, onSelect }: PhotoSlotItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slotKey(slot) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all duration-150 ${
        isDragging ? "opacity-50" : ""
      } ${
        isActive
          ? "border-primary shadow-md shadow-primary/20"
          : "border-transparent"
      }`}
    >
      {/* Clique seleciona no preview grande; arraste reordena. */}
      <button
        type="button"
        onClick={onSelect}
        {...attributes}
        {...listeners}
        className="absolute inset-0 z-0 h-full w-full touch-none"
        aria-label={`Ver foto${isCover ? " (capa)" : ""} — arraste para reordenar`}
      >
        {slot.kind === "saved" ? (
          <Image src={slot.url} alt="" fill sizes="20vw" className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- preview de object URL local (blob:), next/image não serve esse esquema
          <img src={slot.previewUrl} alt="" className="h-full w-full object-cover" />
        )}
      </button>

      {isCover && (
        <span className="absolute left-1 top-1 z-10 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-white pointer-events-none">
          Capa
        </span>
      )}

      {/* Botão de remover */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Remover foto"
        className="group/rm absolute right-0 top-0 z-20 flex h-9 w-9 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-error-solid shadow-sm transition group-hover/rm:scale-110 dark:bg-gray-800/90">
          <X className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
