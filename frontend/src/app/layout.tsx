import type { Metadata } from "next";
import { Vollkorn } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Providers } from "./Providers";
import "./globals.css";

const vollkorn = Vollkorn({
  variable: "--font-vollkorn",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Knowledge Base",
  description: "Your personal AI-powered knowledge assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${vollkorn.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
