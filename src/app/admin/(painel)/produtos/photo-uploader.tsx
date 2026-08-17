"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
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
import { Plus, X, Loader2, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
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

  // Três formas de trocar de foto no preview grande, além de clicar na
  // miniatura:
  // 1. Arrastar com o DEDO (mobile/tablet touch) — acompanha o toque em
  //    tempo real (`dragOffsetX`), troca ao soltar se passar do limiar.
  //    Filtrado por `pointerType === "touch"`: mouse NUNCA entra nesse
  //    fluxo (pedido explícito do usuário — arraste de mouse no desktop
  //    era instável, "uma hora funciona outra não", porque competia com o
  //    drag nativo de imagem do navegador).
  // 2. SWIPE de touchpad/trackpad (desktop) — via `onWheel`, que é o
  //    evento que dois dedos deslizando no trackpad disparam (com
  //    `deltaX` != 0), não `pointer*`.
  // 3. Setas dedicadas nas bordas esquerda/direita do preview.
  function goToPhoto(direction: 1 | -1) {
    if (slots.length < 2) return;
    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) return slots.length - 1;
      if (next >= slots.length) return 0;
      return next;
    });
  }

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);

  function handlePreviewPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || slots.length < 2) return;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    setIsDraggingPreview(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    const start = dragStartRef.current;
    if (!start) return;
    setDragOffsetX(event.clientX - start.x);
  }

  function handlePreviewPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setIsDraggingPreview(false);

    if (!start) {
      setDragOffsetX(0);
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const SWIPE_THRESHOLD_PX = 40;
    // Predominantemente horizontal (senão um scroll vertical acidental na
    // área do preview dispararia troca de foto).
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX && Math.abs(deltaX) >= Math.abs(deltaY)) {
      // Arrastar pra ESQUERDA (deltaX negativo) avança pra próxima foto —
      // mesmo sentido de um carrossel/swipe nativo.
      goToPhoto(deltaX < 0 ? 1 : -1);
    }

    // Sempre volta pra 0: a foto nova (ou a mesma, se não passou do
    // limiar) já renderiza centrada — não desliza fisicamente pra fora da
    // tela antes de trocar (ver nota "não quero scroll horizontal").
    setDragOffsetX(0);
  }

  function handlePreviewPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    dragStartRef.current = null;
    setIsDraggingPreview(false);
    setDragOffsetX(0);
  }

  // Swipe de trackpad: um único gesto de dois dedos dispara DEZENAS de
  // eventos `wheel` em sequência — sem um cooldown, um swipe só já passaria
  // o limiar várias vezes e pularia 3-4 fotos de uma vez. `wheelLockRef`
  // trava novas trocas por `WHEEL_COOLDOWN_MS` depois de cada troca.
  const wheelLockRef = useRef(false);

  function handlePreviewWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (slots.length < 2) return;
    // Scroll vertical de mouse comum (deltaY dominante) não deve trocar de
    // foto — só o swipe horizontal do trackpad (deltaX dominante).
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) || Math.abs(event.deltaX) < 12) return;

    event.preventDefault();
    if (wheelLockRef.current) return;

    wheelLockRef.current = true;
    goToPhoto(event.deltaX > 0 ? 1 : -1);
    const WHEEL_COOLDOWN_MS = 350;
    setTimeout(() => {
      wheelLockRef.current = false;
    }, WHEEL_COOLDOWN_MS);
  }

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
      toast.error("Limite de 5 fotos por produto atingido.");
      return;
    }
    if (incoming.length > roomLeft) {
      toast.error("Limite de 5 fotos por produto atingido.");
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
        toast.error("Não foi possível processar a foto.");
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
    <div className="flex flex-col gap-4 rounded-[2rem] border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="font-display font-bold text-gray-900 dark:text-gray-50">Imagens do produto</h2>

      {/* ── Preview grande fixo ──────────────────────────────────────────────
          Mostra a foto ativa em tamanho real. Enquanto não há fotos, exibe
          um placeholder com ícone + label para convidar o upload.
          aspect-[4/3] mantém proporção consistente independente da foto.
      ─────────────────────────────────────────────────────────────────────── */}
      <div
        className="group relative mx-auto w-full touch-pan-y select-none overflow-hidden rounded-[1.25rem] bg-gray-100 2xl:max-w-md dark:bg-gray-800"
        style={{ aspectRatio: "1/1" }}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerUp}
        onPointerCancel={handlePreviewPointerCancel}
        onWheel={handlePreviewWheel}
      >
        {activeUrl ? (
          <div
            className="absolute inset-0"
            style={{
              transform: `translateX(${dragOffsetX}px)`,
              transition: isDraggingPreview ? "none" : "transform 200ms ease",
            }}
            onDragStart={(event) => event.preventDefault()}
          >
            <Image
              key={activeUrl}
              src={activeUrl}
              alt="Preview da foto ativa"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="pointer-events-none object-contain"
              priority
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-600">
            <ImageIcon className="h-10 w-10" aria-hidden="true" />
            <span className="text-sm">Nenhuma foto adicionada</span>
          </div>
        )}

        {/* Setas — terceira forma de trocar de foto (além do arraste touch
            e do swipe de trackpad), sempre visíveis quando há mais de 1
            foto. `stopPropagation` evita que o clique também dispare os
            handlers de pointer do container por baixo. */}
        {slots.length > 1 && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                goToPhoto(-1);
              }}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-700 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-150 hover:bg-white group-hover:opacity-100 dark:bg-gray-900/85 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                goToPhoto(1);
              }}
              aria-label="Próxima foto"
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-700 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-150 hover:bg-white group-hover:opacity-100 dark:bg-gray-900/85 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
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
                className="flex aspect-square items-center justify-center rounded-[1.25rem] border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
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
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[1.25rem] border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-primary hover:text-primary dark:border-gray-700 dark:text-gray-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES}
                  className="sr-only"
                  aria-label="Adicionar foto"
                  onChange={handleFilesSelected}
                />
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
            <div className="h-24 w-24 cursor-grabbing overflow-hidden rounded-[1.25rem] border-2 border-primary shadow-xl">
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
      className={`group relative aspect-square overflow-hidden rounded-[1.25rem] border-2 transition-all duration-150 ${
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
