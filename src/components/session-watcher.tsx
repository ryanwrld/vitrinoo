"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/**
 * Renovação silenciosa de sessão com aviso só em falha real (AUTH-04, D-03).
 * `TOKEN_REFRESHED` nunca produz UI — renovação em segundo plano não deve
 * ser visível. `SIGNED_OUT` é o único evento que dispara aviso (a sessão
 * pode ter sido encerrada por um logout intencional OU por falha real de
 * renovação — em ambos os casos, avisar nunca é errado, conforme
 * Armadilha 1 do 01-RESEARCH.md).
 *
 * Ressalva conhecida [ASSUMED, Assumption A2]: este listener client-side
 * pode não disparar de forma confiável para renovações que falham
 * inteiramente no servidor. Mitigação: os Server Actions (Task 1) já
 * retornam erro de auth explícito na própria UI que os chama, não
 * dependendo só deste listener global.
 */
export function SessionWatcher() {
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        toast.error("Sessão expirada. Faça login novamente.", {
          duration: Infinity,
        });
      }
      // TOKEN_REFRESHED: silencioso por design (D-03) — nenhuma ação de UI aqui.
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
