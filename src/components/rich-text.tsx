import type { ReactNode } from "react";
import type { RichTextBlock, RichTextDoc, RichTextText } from "@/lib/rich-text/document";

/**
 * Renderiza a descrição formatada do produto como elementos React.
 *
 * Nunca usa `dangerouslySetInnerHTML`: cada nó do documento (já validado por
 * `richTextDocSchema`) vira uma tag conhecida, então não existe caminho para
 * injeção de HTML/script vindo do texto do revendedor — ver a decisão em
 * `src/lib/rich-text/document.ts`.
 *
 * A tipografia sai dos mesmos tokens do resto da vitrine (tamanho/cor de
 * corpo do painel de produto), não de um tema de editor — a descrição precisa
 * parecer parte da página, não um bloco colado de outro lugar.
 */
const alignClass: Record<string, string> = {
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};

function renderText(nodes: RichTextText[] | undefined): ReactNode {
  return (nodes ?? []).map((node, index) => {
    let element: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") element = <strong className="font-semibold">{element}</strong>;
      if (mark.type === "italic") element = <em>{element}</em>;
    }
    return <span key={index}>{element}</span>;
  });
}

function renderBlock(block: RichTextBlock, key: number): ReactNode {
  if (block.type === "bulletList" || block.type === "orderedList") {
    const ListTag = block.type === "bulletList" ? "ul" : "ol";
    return (
      <ListTag
        key={key}
        className={
          block.type === "bulletList"
            ? "list-disc space-y-1 pl-5 marker:text-gray-400"
            : "list-decimal space-y-1 pl-5 marker:text-gray-400"
        }
      >
        {(block.content ?? []).map((item, itemIndex) => (
          <li key={itemIndex}>
            {(item.content ?? []).map((paragraph, paragraphIndex) => (
              <span key={paragraphIndex} className="block">
                {renderText(paragraph.content)}
              </span>
            ))}
          </li>
        ))}
      </ListTag>
    );
  }

  const align = block.attrs?.textAlign ? alignClass[block.attrs.textAlign] : undefined;

  if (block.type === "heading") {
    const HeadingTag = block.attrs.level === 2 ? "h3" : "h4";
    /* Os dois títulos usam a cor forte do texto (o corpo herda o cinza do
       painel), então destacam do parágrafo mesmo no tamanho pequeno. O
       subtítulo se separa do título pelo tamanho + versalete: só "menor e
       negrito" ficava quase idêntico ao corpo em negrito. `mt-1` dá o
       respiro que marca início de seção sem virar um gap solto. */
    return (
      <HeadingTag
        key={key}
        className={[
          "font-display text-gray-900",
          block.attrs.level === 2
            ? "mt-1 text-base font-bold"
            : "mt-1 text-xs font-bold uppercase tracking-wide",
          align,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {renderText(block.content)}
      </HeadingTag>
    );
  }

  // Parágrafo vazio = linha em branco intencional do revendedor.
  if (!block.content || block.content.length === 0) {
    return <p key={key} className="h-3" aria-hidden="true" />;
  }

  return (
    <p key={key} className={align}>
      {renderText(block.content)}
    </p>
  );
}

export function RichText({ doc, className }: { doc: RichTextDoc; className?: string }) {
  return (
    /* `overflow-wrap: anywhere` (não `break-word`): o texto vem do revendedor e
       pode conter uma "palavra" gigante sem espaço (link colado, "kkkkkk…").
       Sem isso ela não quebra, ESTICA o container (o min-content cresce
       junto) e cria rolagem horizontal no popup — proibido no projeto.
       `break-word` não resolve: ele quebra a palavra mas não encolhe o
       min-content, então a caixa continua esticando. */
    <div
      className={["flex min-w-0 flex-col gap-2 text-sm leading-relaxed [overflow-wrap:anywhere]", className]
        .filter(Boolean)
        .join(" ")}
    >
      {(doc.content ?? []).map((block, index) => renderBlock(block, index))}
    </div>
  );
}
