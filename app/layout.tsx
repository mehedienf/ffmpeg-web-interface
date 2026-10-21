import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "klipr — Media Processing Studio",
  description:
    "klipr is a fast, web-based media processing studio. Convert, trim, compress videos and extract audio directly in your browser.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-zinc-950 font-sans">{children}</body>
    </html>
  );
}
