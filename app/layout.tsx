import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "올웨이즈-아기용품 쇼핑 AI 비서",
  description: "내게 딱 맞는 아기용품을 1분만에 골라보세요",
  openGraph: {
    title: "올웨이즈-아기용품 쇼핑 AI 비서",
    description: "내게 딱 맞는 아기용품을 1분만에 골라보세요",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
