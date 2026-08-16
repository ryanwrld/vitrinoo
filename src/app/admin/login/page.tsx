"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { signInAction } from "@/lib/auth/actions";
import { AuthLayout, RequiredMark } from "@/components/auth-layout";

/**
 * Login (AUTH-02). Mesma convenção de validação/feedback do cadastro. Esta
 * página NÃO fica atrás de gate de sessão: é uma entrada pública do grupo
 * `(admin)` (ver nota em `(admin)/layout.tsx`).
 */
export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = (values: SignInInput) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);

    startTransition(async () => {
      const result = await signInAction(formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <AuthLayout
      title="Entrar na sua conta"
      subtitle="Acesse o painel para gerenciar sua vitrine."
      footer={
        <p className="text-center text-sm text-gray-500">
          Ainda não tem conta?{" "}
          <Link href="/admin/cadastro" className="font-medium text-primary hover:text-primary-hover">
            Criar minha vitrine grátis
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

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">
            Senha
            <RequiredMark />
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className="rounded-xl border border-gray-300 bg-white px-3 h-11 text-base text-gray-900 outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary-subtle placeholder:text-gray-400"
          />
          {errors.password && <span className="text-sm text-error-solid">{errors.password.message}</span>}
          <Link href="/admin/esqueci-senha" className="mt-1 inline-block text-sm text-primary hover:text-primary-hover">
            Esqueci minha senha
          </Link>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-hover active:bg-primary-active active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:pointer-events-none"
        >
          {isPending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </AuthLayout>
  );
}
