import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Servico — Від калькуляції послуги до виплати майстру",
  description: "Від калькуляції послуги — до виплати майстру. Облік послуг, продажів і ЗП для салонів, барбершопів і косметологів.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
