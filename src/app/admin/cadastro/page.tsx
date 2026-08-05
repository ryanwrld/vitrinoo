"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";
import { signUpAction } from "@/lib/auth/actions";
import { AuthLayout, RequiredMark } from "@/components/auth-layout";

/**
 * Cadastro (AUTH-01). Validação client-side com react-hook-form + Zod
 * (feedback inline imediato) — sempre revalidado no servidor dentro do
 * Server Action (nunca confiar só no client, Armadilha 2 do 01-RESEARCH.md).
 * Esta página NÃO fica atrás de gate de sessão: é uma entrada pública do
 * grupo `(admin)` (ver nota em `(admin)/layout.tsx`).
 */
export default function CadastroPage() {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = (values: SignUpInput) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);

    startTransition(async () => {
      const result = await signUpAction(formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <AuthLayout
      title="Criar minha vitrine grátis"
      subtitle="Pare de mandar foto por foto. Cadastre-se com email e senha para começar."
      footer={
        <p className="text-center text-sm text-gray-500">
          Já tem conta?{" "}
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
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.email && <span className="text-sm text-error-solid">{errors.email.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">
            Senha
            <RequiredMark />
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
            className="rounded-md border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.password && <span className="text-sm text-error-solid">{errors.password.message}</span>}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
        >
          {isPending ? "Criando conta…" : "Criar minha vitrine grátis"}
        </button>
      </form>
    </AuthLayout>
  );
}
