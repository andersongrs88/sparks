import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "StartB Salão",
  description: "Gestão 360° para salão de beleza",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
