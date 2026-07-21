import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email Organizer AI",
  description: "Organisez vos emails grâce à l'intelligence artificielle.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
