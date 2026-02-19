import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0ea5e9",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Personal Knowledge Base",
  description: "Your personal AI-powered knowledge assistant",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PKB",
  },
  formatDetection: { telephone: false },
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
