import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lamour — CRM для сервісного бізнесу",
  description: "Облік послуг, розподіл доходу, аналітика",
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
