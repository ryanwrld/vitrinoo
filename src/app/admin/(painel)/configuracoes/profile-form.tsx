"use client";

import { User } from "lucide-react";

export function ProfileForm({ email }: { email: string }) {
  // Apenas visual por enquanto (perfil).
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-925/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-blue-400/15 dark:text-blue-300">
            <User className="h-6 w-6" />
          </div>
          <div>
            <span className="block font-medium text-gray-900 dark:text-gray-50">Endereço de email</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{email}</span>
          </div>
        </div>
        <button
          disabled
          className="cursor-not-allowed text-sm font-medium text-gray-400 dark:text-gray-600"
        >
          Editar
        </button>
      </div>
    </div>
  );
}
