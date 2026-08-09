/**
 * Trava de rolagem da página, compartilhada por TODOS os overlays do produto
 * (pop-up do QR, modal de produto, gavetas de filtro, busca do painel,
 * diálogos nativos de confirmação).
 *
 * O PROBLEMA ORIGINAL
 *
 * Cada overlay fazia `document.body.style.overflow = "hidden"` por conta
 * própria. Isso trava a rolagem — e junto REMOVE a barra de rolagem da janela.
 * Como a barra ocupa largura real (~15px no desktop), a área de conteúdo
 * alargava nesses 15px no instante em que o overlay abria: cabeçalho, grade e
 * filtros pulavam para o lado, e pulavam de volta ao fechar.
 *
 * POR QUE NÃO BASTA COMPENSAR COM PADDING
 *
 * A primeira correção devolveu a largura em `padding-right` no `<body>`. O
 * salto sumiu, mas apareceu um efeito colateral: aquela faixa de 15px fica
 * VAZIA. Antes ela era ocupada pela barra de rolagem; com a barra removida e o
 * conteúdo empurrado para dentro, sobra um vão pintado com o fundo do body,
 * visível como uma tira clara ao lado da capa escura da loja.
 *
 * A SOLUÇÃO: NÃO DEIXAR A BARRA SUMIR
 *
 * Enquanto a trava está ativa, forçamos `overflow-y: scroll` no `<html>` — a
 * barra continua desenhada, ocupando exatamente o mesmo espaço de sempre. Não
 * há salto (a largura útil não muda) e não há vão (nada foi empurrado para
 * dentro). A barra fica inerte, porque quem impede a rolagem é o passo
 * seguinte.
 *
 * O forçar só acontece quando JÁ EXISTIA uma barra (`gap > 0`). No celular, e
 * em desktops com barra sobreposta, a medida é zero — forçar ali criaria do
 * nada a barra que hoje não existe, ou seja, exatamente o salto que queremos
 * evitar.
 *
 * COMO A ROLAGEM É BLOQUEADA
 *
 * O `<body>` sai do fluxo (`position: fixed`) deslocado pelo tanto que já
 * estava rolado, e a posição exata é devolvida ao destravar. Isso vale para
 * todas as plataformas, não só iOS: é o único jeito que também funciona no
 * Safari do iPhone, onde `overflow: hidden` no body não segura a página (ela
 * continua deslizando por baixo do overlay). Um caminho só, testado em um
 * lugar só.
 *
 * ELEMENTOS FIXOS
 *
 * Com a barra preservada, a largura do viewport não muda em nenhum momento —
 * então a barra fixa da loja, o CTA de pedido e os avisos do canto continuam
 * exatamente onde estavam, sem precisar de compensação própria.
 *
 * CONTAGEM DE TRAVAS
 *
 * Overlays podem se sobrepor (abrir um produto e, dele, o compartilhar). A
 * trava é contada: a primeira aplica, a última restaura. Sem isso, fechar o
 * overlay de cima destravaria a página com o de baixo ainda aberto.
 */

let lockCount = 0;
let releaseCurrentLock: (() => void) | null = null;

/**
 * Largura real da barra de rolagem NESTE momento. Zero quando não há barra
 * (celular, ou desktop com barra sobreposta).
 */
function measureScrollbarGap(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function applyLock(): () => void {
  const body = document.body;
  const root = document.documentElement;

  const hadScrollbar = measureScrollbarGap() > 0;
  const scrollY = window.scrollY;

  // Guarda os valores INLINE anteriores (não os computados): restaurar o
  // computado escreveria no elemento um valor que antes vinha da folha de
  // estilo, e ele ficaria grudado depois que o overlay fechasse.
  const previous = {
    rootOverflowY: root.style.overflowY,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
  };

  if (hadScrollbar) {
    root.style.overflowY = "scroll";
  }

  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";

  return () => {
    root.style.overflowY = previous.rootOverflowY;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.width = previous.width;

    // `position: fixed` no body zera a rolagem do documento; sem isto a página
    // voltaria para o topo ao fechar o overlay.
    window.scrollTo(0, scrollY);
  };
}

/**
 * Trava a rolagem e devolve a função que destrava. Chamar a função devolvida
 * mais de uma vez é seguro (a segunda chamada não faz nada) — importante
 * porque efeitos do React podem limpar duas vezes em Strict Mode.
 */
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  lockCount += 1;
  if (lockCount === 1) {
    releaseCurrentLock = applyLock();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      releaseCurrentLock?.();
      releaseCurrentLock = null;
    }
  };
}
