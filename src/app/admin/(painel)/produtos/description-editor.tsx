"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { CharacterCount } from "@tiptap/extension-character-count";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DESCRIPTION_MAX_CHARS, parseRichText, emptyRichTextDoc } from "@/lib/rich-text/document";

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Editor de descrição do produto (negrito, itálico, título, listas,
 * alinhamento, desfazer/refazer, limpar formatação).
 *
 * O valor trafega como string JSON do TipTap — o MESMO formato que
 * `richTextDocSchema` valida no servidor e que `<RichText>` renderiza na
 * vitrine. Sem HTML em nenhum ponto do caminho (ver a decisão em
 * `src/lib/rich-text/document.ts`).
 *
 * Sem cor de texto na barra, deliberadamente: a descrição herda a cor do tema
 * da vitrine, então nunca fica ilegível no claro ou no escuro.
 *
 * Visual: a barra e a área de texto formam UMA caixa só, com a mesma borda,
 * raio e foco dos outros campos do formulário (`inputCls` de
 * product-form.tsx) — o editor tem que ler como mais um campo do card, não
 * como um widget externo.
 */
export type DescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

const BLOCK_OPTIONS = [
  { label: "Parágrafo", value: "paragraph" },
  { label: "Título", value: "heading-2" },
  { label: "Subtítulo", value: "heading-3" },
] as const;

type ToolbarButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
};

function ToolbarButton({ icon: Icon, label, onClick, isActive, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()} // mantém a seleção do texto
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={isActive}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800",
        isActive && "bg-primary-subtle text-primary dark:bg-blue-400/15 dark:text-blue-300"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-800" aria-hidden="true" />;
}

function Toolbar({ editor }: { editor: Editor }) {
  const blockValue = editor.isActive("heading", { level: 2 })
    ? "heading-2"
    : editor.isActive("heading", { level: 3 })
      ? "heading-3"
      : "paragraph";

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-300 px-2 py-1.5 dark:border-gray-700">
      <select
        value={blockValue}
        onChange={(event) => {
          const next = event.target.value;
          const chain = editor.chain().focus();
          if (next === "paragraph") chain.setParagraph().run();
          if (next === "heading-2") chain.toggleHeading({ level: 2 }).run();
          if (next === "heading-3") chain.toggleHeading({ level: 3 }).run();
        }}
        aria-label="Estilo do bloco"
        className="mr-1 h-9 rounded-lg border-0 bg-transparent px-2 text-sm text-gray-700 outline-none transition-colors duration-150 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {BLOCK_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <Divider />

      <ToolbarButton
        icon={Bold}
        label="Negrito"
        isActive={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="Itálico"
        isActive={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={RemoveFormatting}
        label="Limpar formatação"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      />

      <Divider />

      <ToolbarButton
        icon={List}
        label="Lista com marcadores"
        isActive={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Lista numerada"
        isActive={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <Divider />

      <ToolbarButton
        icon={AlignLeft}
        label="Alinhar à esquerda"
        isActive={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      />
      <ToolbarButton
        icon={AlignCenter}
        label="Centralizar"
        isActive={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      />
      <ToolbarButton
        icon={AlignRight}
        label="Alinhar à direita"
        isActive={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      />

      <Divider />

      <ToolbarButton
        icon={Undo2}
        label="Desfazer"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        icon={Redo2}
        label="Refazer"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}

export function DescriptionEditor({ value, onChange, id }: DescriptionEditorProps) {
  const editor = useEditor({
    // Next 16 renderiza o formulário no servidor primeiro; sem isso o TipTap
    // monta durante o SSR e o React acusa mismatch de hidratação.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Fora da allowlist do documento (ver document.ts) — se não forem
        // desligadas aqui, o editor produz nós que o servidor descarta.
        heading: { levels: [2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
        strike: false,
        link: false,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // `limit` bloqueia a digitação/colagem no exato caractere do teto — o
      // revendedor esbarra no limite em vez de descobrir só no submit.
      CharacterCount.configure({ limit: DESCRIPTION_MAX_CHARS }),
    ],
    content: parseRichText(value) ?? emptyRichTextDoc(),
    editorProps: {
      attributes: {
        id: id ?? "description",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Descrição do produto",
        /* Inline, não classe: o prosemirror-view injeta em runtime um
           `.ProseMirror { word-wrap: break-word }` que entra DEPOIS do CSS
           do app e vence qualquer utilitário de mesma especificidade.
           `break-word` quebra a palavra mas não encolhe o min-content, então
           uma palavra gigante ("kkkkk…", link colado) esticava o card e
           criava rolagem horizontal na página. `anywhere` corrige os dois. */
        style: "overflow-wrap: anywhere",
        class:
          "min-h-[10rem] [overflow-wrap:anywhere] px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none dark:text-gray-50 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-display [&_h3]:text-sm [&_h3]:font-bold [&_p]:min-h-[1.25rem]",
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(JSON.stringify(current.getJSON()));
    },
  });

  /* Sincroniza de fora para dentro APENAS quando o valor do formulário muda
     por outro caminho que não a digitação — "Reverter alterações" chama
     `reset()` no react-hook-form, e sem isto o editor continuaria mostrando o
     texto descartado. Comparação por JSON evita loop com o `onUpdate`. */
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    if (current === value) return;
    const incoming = parseRichText(value) ?? emptyRichTextDoc();
    if (JSON.stringify(incoming) === JSON.stringify(editor.getJSON())) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value]);

  const usedChars = editor?.storage.characterCount.characters() ?? 0;

  if (!editor) {
    // Placeholder com a MESMA caixa do editor montado — sem isso o card
    // encolhe e "pula" quando o editor termina de montar no cliente.
    return (
      <div className="min-h-[13.25rem] rounded-xl border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900" />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-300 bg-white transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-subtle dark:border-gray-700 dark:bg-gray-900 dark:focus-within:ring-blue-400/20">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="flex justify-end px-3 pb-2">
        <span
          aria-live="polite"
          className={cn(
            "text-xs tabular-nums text-gray-500 dark:text-gray-400",
            usedChars >= DESCRIPTION_MAX_CHARS && "font-semibold text-gray-900 dark:text-gray-50"
          )}
        >
          {usedChars}/{DESCRIPTION_MAX_CHARS}
        </span>
      </div>
    </div>
  );
}
