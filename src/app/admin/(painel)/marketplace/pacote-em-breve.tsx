import { Clock } from "lucide-react";

/**
 * Cartão de pacote AINDA NÃO LANÇADO — puramente visual.
 *
 * POR QUE EXISTE: com um pacote só na rota, o Marketplace parece uma loja de um
 * produto — o lojista compra (ou não) e nunca mais tem motivo para voltar. Com
 * dois lugares marcados ao lado, a mesma tela passa a dizer que isto é uma
 * prateleira que vai encher, e o motivo de voltar passa a existir.
 *
 * NÃO EXISTE NO BANCO, de propósito: não há pacote, preço, produto nem migration
 * por trás. É cenário, e mora aqui em vez de virar linha em `marketplace_packs`
 * justamente para ninguém confundir os dois — um pacote de mentira no banco
 * apareceria em contagem, em busca e em consulta como se fosse real.
 *
 * O QUE ELE NÃO PROMETE: nada de "avisaremos você". Não existe notificação de
 * lançamento no produto, e prometer aviso que não chega troca uma expectativa boa
 * por uma quebra de confiança. E o título não finge ser nome de produto: dizer
 * "V2.0" comprometeria um nome que talvez nunca saia assim. Ele marca posição na
 * fila, não batiza nada.
 */
export function PacoteEmBreve({
  titulo,
  descricao,
  distante = false,
}: {
  titulo: string;
  descricao: string;
  /**
   * O segundo da fila. Baixa um degrau o contraste do cartão inteiro.
   *
   * Sem isto os dois ficam idênticos e a fila não existe visualmente — viram dois
   * avisos repetidos em vez de uma sequência. Distância no tempo virando distância
   * no peso é o que faz o olho ler "este vem primeiro, aquele vem depois" sem
   * precisar de número nem data.
   */
  distante?: boolean;
}) {
  return (
    /*
      MESMA CASCA do cartão real (`rounded-3xl`, mesmo empilhamento
      `flex-col sm:flex-row`, mesma largura de capa) para os três lerem como uma
      prateleira só. O que muda é a BORDA TRACEJADA — o vocabulário que o painel
      já usa para "lugar reservado, ainda sem conteúdo".
    */
    <section
      aria-label={`${titulo} — em breve`}
      className={`overflow-hidden rounded-3xl border border-dashed bg-white/70 dark:bg-gray-900/50 ${
        distante
          ? "border-gray-200 opacity-75 dark:border-gray-800"
          : "border-gray-300 dark:border-gray-700"
      }`}
    >
      <div className="flex flex-col sm:flex-row">
        {/*
          A CAPA MANTÉM A LARGURA do cartão real (`sm:w-40 lg:w-56`), para as três
          colunas da esquerda ficarem alinhadas na pilha — mas não herda o
          `aspect-square`, que forçaria 224px de altura para pouco conteúdo. Ela
          estica com o cartão (`sm:h-auto` + stretch do flex).

          No celular vira uma faixa de 112px em vez do `aspect-[16/10]` do cartão
          real: sem foto para mostrar, aquele formato viraria 205px de vazio logo
          no topo da tela.
        */}
        <div className="relative h-28 w-full shrink-0 overflow-hidden bg-gray-100 sm:h-auto sm:w-40 lg:w-56 dark:bg-gray-800">
          {/*
            Trama diagonal, a MESMA do verso das cartas do sorteio
            (sorteio-amostra.tsx). Lá ela já significa "conteúdo virado para
            baixo, você ainda não viu" — repetir aqui faz o mistério ter uma
            linguagem só dentro do produto.
          */}
          <div
            className="absolute inset-0 opacity-[0.08] dark:opacity-[0.14]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 9px)",
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {/*
              O "?" É A CAPA, então ocupa a capa. Numa primeira versão ele tinha
              metade deste tamanho e ficava pequeno no meio do vazio, parecendo
              enfeite em vez de imagem do cartão.

              É a ÚNICA peça que precisa dizer "não conto o que é" — por isso o
              título não repete a interrogação em texto.
            */}
            <span
              className="font-display text-6xl font-extrabold leading-none text-gray-300 sm:text-7xl dark:text-gray-600"
              aria-hidden="true"
            >
              ?
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            {/*
              Selo CINZA, e não o azul de "Novo": azul é a cor do que já está
              disponível nesta mesma tela, e repeti-lo aqui faria o lojista tentar
              clicar. Cinza com relógio diz tempo, não novidade.
            */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <Clock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Em breve
            </span>
            {/*
              Um degrau abaixo do `text-gray-900` do cartão real, e só um. Uma
              versão anterior usava `text-gray-400`, que lia como desabilitado —
              mutar é certo, mutar tanto faz parecer defeito.
            */}
            <h2 className="mt-2 font-display text-xl font-extrabold text-gray-500 sm:text-2xl dark:text-gray-400">
              {titulo}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-gray-400 dark:text-gray-500">{descricao}</p>
          </div>

          {/*
            O MOLDE DO QUE VAI CHEGAR — a peça que faz este cartão funcionar.

            O cartão real preenche a altura com preço e botões. Sem nada aqui, o
            canto inferior direito vira um vazio e o cartão lê como inacabado, não
            como reservado. Estes blocos são a FORMA do preço e do botão, sem
            texto, sem cor e sem clique: o olho reconhece o gabarito e completa a
            lacuna sozinho.

            É o gatilho mostrado em vez de anunciado. Uma frase dizendo "vai ter
            preço e botão aqui" seria pior — e ridícula.

            `aria-hidden`: para quem ouve a tela, forma vazia não é informação. O
            selo "Em breve" e o texto já disseram tudo que existe para dizer.
          */}
          <div className="mt-auto flex items-center gap-3 pt-1" aria-hidden="true">
            {/*
              MESMA ALTURA e mesmo raio nos dois. A primeira versão copiava as
              proporções reais do cartão — o preço mais baixo, o botão mais alto e
              arredondado. Como blocos vazios, sem texto para explicar a diferença,
              aquilo não lia como "preço e botão": lia como dois retângulos
              desalinhados, ou seja, como erro. Só a LARGURA distingue os dois, que
              é o suficiente para verem-se como duas coisas e não uma barra
              repetida.
            */}
            <div className="h-8 w-24 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="h-8 w-32 rounded-full bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    </section>
  );
}
