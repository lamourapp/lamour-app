import type { Metadata } from "next";
import "./globals.css";
import { ToastContainer } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Servico — Від калькуляції послуги до виплати майстру",
  description: "Від калькуляції послуги — до виплати майстру. Облік послуг, продажів і ЗП для салонів, барбершопів і косметологів.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // iOS PWA: без viewport-fit=cover `env(safe-area-inset-bottom)` повертає 0,
  // і нижня «домашня риска» ріже bottom-nav. На Android/браузері — no-op.
  viewportFit: "cover" as const,
};

/*
 * Applies the cached brand color before React hydrates. Without this there is
 * a brief flash of the default purple while useSettings loads from Airtable.
 * The cached value is written by useSettings on every successful fetch.
 */
const THEME_INIT = `
try {
  var raw = localStorage.getItem('servico.settings');
  if (raw) {
    var c = JSON.parse(raw).brandColor;
    if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) {
      document.documentElement.style.setProperty('--brand-600', c);
    }
  }
} catch (e) {}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
