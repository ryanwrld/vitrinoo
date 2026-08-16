"use client";

import { Loader2, Check, X } from "lucide-react";
import { useSlugField, type SlugAvailabilityStatus } from "./slug-field-context";

/**
 * Campo do slug da vitrine (D-01–D-04, D-08, LOJA-02) — hoje APENAS a parte
 * visual.
 *
 * O estado (valor, normalização, validação de formato, checagem de
 * disponibilidade) e o salvamento moram em `settings-form.tsx` e chegam aqui
 * pelo `SlugFieldProvider`. O componente perdeu o botão "Salvar novo link" e
 * o diálogo de confirmação próprios: a troca do link virou parte do único
 * "Salvar alterações" do formulário, para o usuário não ter que aprender dois
 * mecanismos de salvar na mesma tela.
 *
 * A confirmação NÃO foi perdida no caminho — ela virou condicional e vive no
 * submit do formulário, aparecendo só quando o slug realmente mudou.
 *
 * O valor exibido continua sendo `slugify(raw)` a cada tecla (D-01 — sem
 * acento, minúsculo, espaços viram hífen), e a validação de formato continua
 * síncrona (só a checagem de rede é debounced — 02-RESEARCH.md Open
 * Question 2).
 */
export function SlugEditor() {
  const { rawSlug, setRawSlug, slug, formatError, status } = useSlugField();

  return (
    // Sem moldura de card própria: este componente é uma SEÇÃO dentro do card
    // "Link e QR code da vitrine" (ver configuracoes/page.tsx), que reúne o
    // slug e o QR num bloco só — os dois tratam do mesmo assunto (o link
    // público).
    <div className="flex flex-col gap-1">
      <label htmlFor="slug" className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Slug
      </label>
      <input
        id="slug"
        type="text"
        value={rawSlug}
        onChange={(event) => setRawSlug(event.target.value)}
        className="rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:placeholder:text-gray-600 dark:focus:ring-blue-400/20"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">/{slug}</p>
      {formatError ? (
        <span className="text-sm text-error-fg">{formatError}</span>
      ) : (
        <StatusPill status={status} />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SlugAvailabilityStatus }) {
  if (status === "checking") {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Verificando disponibilidade…
      </span>
    );
  }

  if (status === "available") {
    return (
      <span className="flex items-center gap-1 text-xs text-success-fg">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Disponível
      </span>
    );
  }

  if (status === "taken") {
    return (
      <span className="flex items-center gap-1 text-xs text-error-fg">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Este link já está em uso.
      </span>
    );
  }

  return null;
}
