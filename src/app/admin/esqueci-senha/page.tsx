"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { signUpSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/reset-actions";
import { AuthLayout, RequiredMark } from "@/components/auth-layout";

const requestResetSchema = z.object({
  email: signUpSchema.shape.email,
});

type RequestResetInput = z.infer<typeof requestResetSchema>;

/**
 * Solicitação de recuperação de senha (AUTH-05). Sempre exibe a mesma
 * mensagem de confirmação genérica retornada pelo Server Action — nunca
 * confirma/nega a existência da conta (anti-enumeração, ver
 * `src/lib/auth/reset-actions.ts`). Esta página NÃO fica atrás de gate de
 * sessão: é uma entrada pública do grupo `(admin)` (ver nota em
 * `(admin)/layout.tsx`).
 */
export default function EsqueciSenhaPage() {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestResetInput>({ resolver: zodResolver(requestResetSchema) });

  const onSubmit = (values: RequestResetInput) => {
    const formData = new FormData();
    formData.set("email", values.email);

    startTransition(async () => {
      const result = await requestPasswordReset(formData);
      toast.success(result.message);
    });
  };

  return (
    <AuthLayout
      title="Esqueci minha senha"
      subtitle="Informe o email da sua conta e enviaremos um link para redefinir sua senha."
      footer={
        <p className="text-center text-sm text-gray-500">
          Lembrou a senha?{" "}
          <Link href="/admin/login" className="font-medium text-primary hover:text-primary-hover">
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            E-mail
            <RequiredMark />
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            className="rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.email && <span className="text-sm text-error-solid">{errors.email.message}</span>}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
        >
          {isPending ? "Enviando…" : "Enviar link de recuperação"}
        </button>
      </form>
    </AuthLayout>
  );
}
