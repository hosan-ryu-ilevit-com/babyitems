import type { Metadata } from "next";
import "./globals.css";
import PhoneTracker from "@/components/PhoneTracker";

export const metadata: Metadata = {
  title: "올웨이즈-아기용품 쇼핑 AI 비서",
  description: "내게 딱 맞는 아기용품을 1분만에 골라보세요",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  openGraph: {
    title: "올웨이즈-아기용품 쇼핑 AI 비서",
    description: "내게 딱 맞는 아기용품을 1분만에 골라보세요",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "올웨이즈-아기용품 쇼핑 AI 비서",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        <PhoneTracker />
        {children}
      </body>
    </html>
  );
}
