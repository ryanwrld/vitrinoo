import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/app-toaster";
import { DialogScrollGuard } from "@/components/dialog-scroll-guard";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vitrinoo",
  description:
    "Seu catálogo de chuteiras em português, funcionando 24h.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <AppToaster />
          {/* Compensa a barra de rolagem que o navegador remove ao abrir um
              `<dialog>` nativo — sem isto o layout salta ~15px. Ver
              dialog-scroll-guard.tsx. */}
          <DialogScrollGuard />
        </ThemeProvider>
      </body>
    </html>
  );
}
