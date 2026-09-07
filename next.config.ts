import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * IPs IPv4 desta máquina na rede local, descobertos em tempo de execução.
 *
 * Substitui a lista escrita à mão que existia aqui (172.20.10.12,
 * 192.168.100.116, 192.168.1.242, 192.168.1.198, 192.168.1.142,
 * 192.168.0.30). Seis endereços acumulados é o próprio sintoma: o IP da
 * máquina muda a cada DHCP novo — roteador reiniciado, outra Wi-Fi, roteamento
 * pelo celular — e no dia em que o IP atual não está na lista o Next bloqueia
 * os recursos de dev, o JS não hidrata e o celular fica com uma página onde
 * NADA clica (só `<a href>`, que não precisa de JS). Diagnosticar isso do zero
 * custa caro, porque a tela parece perfeita.
 *
 * Só afeta `next dev`; `allowedDevOrigins` é ignorado em produção.
 */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => Boolean(iface))
    // `family` já veio como "IPv4" (string) e como 4 (número) dependendo da
    // versão do Node; aceitar os dois evita a lista virar vazia em silêncio —
    // e lista vazia aqui reintroduz o bug de "nada clica no celular".
    // O `as` é necessário porque o @types/node instalado declara só `string`,
    // então comparar com o número puro é erro de tipo (TS2367) mesmo sendo um
    // valor que ocorre em runtime.
    .filter((iface) => {
      const family = iface.family as string | number;
      return (family === "IPv4" || family === 4) && !iface.internal;
    })
    .map((iface) => iface.address);
}

// Deriva o host do Supabase Storage a partir da URL do projeto para permitir
// `next/image` servir imagens públicas (logo da loja, fotos de produto) sem
// usar `images.domains` (depreciado). Ver 01-RESEARCH.md §Standard Stack.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  // Permite acessar o dev server via IP de rede local (ex.: testar em
  // celular real na mesma Wi-Fi) sem o Next bloquear os recursos de dev
  // (HMR) por origem cruzada — sem isso o JS não hidrata no celular e o
  // <form> cai no submit nativo GET, vazando credenciais na URL.
  //
  // Descoberto automaticamente (ver `lanAddresses` acima) em vez de fixado:
  // o IP muda sozinho a cada DHCP, e uma lista desatualizada derruba a
  // hidratação no celular sem nenhum erro visível na tela.
  allowedDevOrigins: lanAddresses(),
  // Server Actions limitam o corpo a 1MB por padrão — separado do limite de
  // 5MB por foto já validado em `validatePhotoFile`. Até 5 fotos comprimidas
  // a ~1MB cada (browser-image-compression, meta não-garantida) + overhead
  // de multipart facilmente passam de 1MB somadas num único saveProduct.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  /*
   * EM DEV, O NAVEGADOR NÃO PODE GUARDAR OS CHUNKS ESTÁTICOS.
   *
   * O nome do arquivo de CSS/JS que o `next dev` gera vem do caminho do
   * módulo, não do conteúdo: editar `globals.css` mantém a MESMA URL. O
   * servidor já responde `no-cache, must-revalidate`, mas navegador que não
   * revalida (o do portal de QA usado aqui, e webviews em geral) segue servindo
   * a cópia velha — a página fica com o CSS de uma versão atrás, sem nenhum
   * erro à vista. Perdemos horas nisso: classes de tamanho novas simplesmente
   * não existiam na folha carregada, e os SVGs, sem altura, esticavam.
   *
   * `no-store` corta a revalidação da conversa: nada é guardado, então nunca há
   * cópia velha para servir. Só vale em `next dev` — em produção os nomes
   * carregam hash de conteúdo e o cache longo é justamente o que se quer.
   */
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      /*
       * E, para o navegador que ignora até o `no-store`, a ordem explícita.
       *
       * O do portal de QA usado aqui guarda a folha assim mesmo e serve a cópia velha no
       * reload seguinte — a tela fica uma versão atrás do código, sem erro nenhum à vista,
       * e quem está revisando um ajuste visual vê o estado anterior. `Clear-Site-Data` na
       * navegação do painel manda descartar o que já está guardado, então cada carga de
       * página começa limpa.
       *
       * Só o escopo "cache": sessão e cookies não são tocados. E só em `next dev` — em
       * produção os nomes de arquivo carregam hash de conteúdo e o cache longo é desejado.
       */
      {
        source: "/admin/:path*",
        headers: [{ key: "Clear-Site-Data", value: '"cache"' }],
      },
    ];
  },
  images: {
    /*
     * QUANTO TEMPO A IMAGEM OTIMIZADA VALE.
     *
     * O Next deriva isso do `Cache-Control` da origem, e o Supabase Storage devolve
     * `no-cache` nas fotos do acervo — resultado: a resposta saía com
     * `max-age=0, must-revalidate` e o navegador refazia o pedido a cada visita, mesmo para
     * uma miniatura de 1KB que nunca muda.
     *
     * O piso resolve sem reenviar nada: são fotos de acervo, o nome do arquivo carrega hash
     * e uma troca de foto gera caminho novo. 30 dias é conservador o bastante para não
     * prender um erro de curadoria por muito tempo.
     */
    minimumCacheTTL: 2592000,
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
