import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    // 이미지 캐싱 최적화
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30일 캐시 (초 단위)
    deviceSizes: [640, 750, 828, 1080, 1200], // 모바일 중심
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // 썸네일 크기들
    formats: ['image/webp'], // WebP 우선 사용
  },
};

export default nextConfig;
