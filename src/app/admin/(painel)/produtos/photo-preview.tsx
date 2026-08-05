"use client";

import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

export type PhotoPreviewProps = {
  urls: string[];
  activeIndex: number | null;
  onClose: () => void;
  onChange: (index: number) => void;
};

export function PhotoPreview({ urls, activeIndex, onClose, onChange }: PhotoPreviewProps) {
  const url = activeIndex !== null ? urls[activeIndex] : null;

  useEffect(() => {
    if (activeIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onChange((activeIndex - 1 + urls.length) % urls.length);
      if (e.key === "ArrowRight") onChange((activeIndex + 1) % urls.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, urls.length, onClose, onChange]);

  if (activeIndex === null || !url) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-white shadow-2xl animate-slide-left flex flex-col dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4 dark:border-gray-800">
          <h2 className="font-display text-lg font-bold text-gray-900 dark:text-gray-50">
            Foto {activeIndex + 1} de {urls.length}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="relative flex-1 bg-gray-50/50 flex items-center justify-center p-2 sm:p-6 dark:bg-gray-925/40">
          {urls.length > 1 && (
            <button
              onClick={() => onChange((activeIndex - 1 + urls.length) % urls.length)}
              className="absolute left-4 z-10 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow hover:scale-110 transition-transform dark:bg-gray-800/90 dark:text-gray-50"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <div className="relative h-full w-full">
            <Image
              key={url}
              src={url}
              alt="Pré-visualização ampliada"
              fill
              className="object-contain animate-fade-zoom-in"
              sizes="480px"
              priority
            />
          </div>

          {urls.length > 1 && (
            <button
              onClick={() => onChange((activeIndex + 1) % urls.length)}
              className="absolute right-4 z-10 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow hover:scale-110 transition-transform dark:bg-gray-800/90 dark:text-gray-50"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {urls.length > 1 && (
          <div className="border-t border-gray-100 p-4 bg-white flex items-center justify-start md:justify-center gap-2 overflow-x-auto dark:border-gray-800 dark:bg-gray-900">
            {urls.map((u, i) => (
              <button
                key={u}
                onClick={() => onChange(i)}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                  i === activeIndex ? "border-primary scale-105 shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <Image src={u} alt={`Miniatura ${i + 1}`} fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
