import type { Metadata } from "next";
import Script from "next/script";
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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Abel&display=swap"
        />
      </head>
      <body className="antialiased">
        <Script
          id="clarity-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "unu7ohmztz");
            `,
          }}
        />
        <PhoneTracker />
        {children}
      </body>
    </html>
  );
}
