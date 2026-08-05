import { getContrastTextColor } from "@/lib/color/contrast";
import { ImageWithFallback } from "./image-with-fallback";

export type StoreHeroData = {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  tagline: string | null;
};

/**
 * Hero proeminente no topo da vitrine (D-12/D-13, Server Component). Sem
 * analog direto no codebase (nenhum "hero" de loja existe hoje) — compõe a
 * partir dos campos já lidos por src/app/(admin)/configuracoes/settings-form.tsx
 * (logo_url/accent_color/tagline), mas como exibição pública, não formulário.
 *
 * Cor de destaque da loja como fundo/acento (D-12) — fallback para o verde
 * escuro de marca (#000000) quando a loja não configurou uma cor própria.
 * A frase de apresentação SÓ renderiza quando preenchida (D-13) — sem
 * elemento/espaço vazio quando ausente.
 *
 * `getContrastTextColor` escolhe texto claro/escuro conforme a luminância da
 * própria `accentColor` — sem isso, uma loja com cor de destaque clara (ex.:
 * branco, escolhida livremente no color picker de Configurações) deixa
 * nome/tagline ilegíveis (texto branco sobre fundo branco).
 */
export function StoreHero({ store }: { store: StoreHeroData }) {
  const backgroundColor = store.accentColor ?? "#000000";
  const isDarkText = getContrastTextColor(backgroundColor) === "dark";

  return (
    <div
      className={`flex w-full flex-col items-center gap-3 px-5 py-10 text-center ${
        isDarkText ? "text-gray-900" : "text-white"
      }`}
      style={{ backgroundColor }}
    >
      <div
        className={`relative h-16 w-16 overflow-hidden rounded-full ${
          isDarkText ? "bg-black/10" : "bg-white/20"
        }`}
      >
        <ImageWithFallback src={store.logoUrl} alt={store.name} />
      </div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight">{store.name}</h1>
      {store.tagline && (
        <p className={`max-w-sm text-base ${isDarkText ? "text-gray-900/85" : "text-white/85"}`}>
          {store.tagline}
        </p>
      )}
    </div>
  );
}
