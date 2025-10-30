import fs from 'fs';
import path from 'path';
import { Product } from '@/types';

/**
 * 제품 데이터 로더
 *
 * data/products/ 폴더의 .md 파일들을 읽어서 Product 객체 배열로 반환
 */

const PRODUCTS_DIR = path.join(process.cwd(), 'data', 'products');

/**
 * 실제 제품 데이터 (Top 14 크롤링 데이터 기반)
 * 각 제품의 coreValues는 리뷰 분석 기반으로 책정
 */
const REAL_PRODUCTS_DATA: Record<string, {
  title: string;
  price: number;
  reviewCount: number;
  coreValues: {
    temperatureControl: number;
    hygiene: number;
    material: number;
    usability: number;
    portability: number;
    priceValue: number;
    durability: number;
    additionalFeatures: number;
  };
}> = {
  '1519776763': {
    title: '휴대용 접이식 분유포트 (1℃ 정밀 온도조절)',
    price: 35900,
    reviewCount: 4230,
    coreValues: {
      temperatureControl: 9,  // 1℃ 정밀 조절
      hygiene: 7,             // 넓은 입구로 세척 편함
      material: 7,            // 실리콘+스테인리스
      usability: 8,           // 접이식으로 편리
      portability: 10,        // 압도적 휴대성
      priceValue: 9,          // 가성비 우수
      durability: 5,          // 내구성 이슈 있음
      additionalFeatures: 8,  // 프리볼트, 8시간 보온
    },
  },
  '6962086794': {
    title: '프리미엄 스테인리스 분유포트 (대용량)',
    price: 89000,
    reviewCount: 8520,
    coreValues: {
      temperatureControl: 10,
      hygiene: 9,
      material: 10,
      usability: 7,
      portability: 3,
      priceValue: 5,
      durability: 9,
      additionalFeatures: 7,
    },
  },
  '6876934040': {
    title: '스마트 온도조절 분유포트 (APP 연동)',
    price: 65000,
    reviewCount: 3450,
    coreValues: {
      temperatureControl: 10,
      hygiene: 8,
      material: 8,
      usability: 9,
      portability: 5,
      priceValue: 7,
      durability: 8,
      additionalFeatures: 10,
    },
  },
  '6699913168': {
    title: '실용형 기본 분유포트',
    price: 42000,
    reviewCount: 6780,
    coreValues: {
      temperatureControl: 7,
      hygiene: 7,
      material: 7,
      usability: 8,
      portability: 6,
      priceValue: 8,
      durability: 7,
      additionalFeatures: 6,
    },
  },
  '7118428974': {
    title: '여행용 미니 분유포트',
    price: 29900,
    reviewCount: 2340,
    coreValues: {
      temperatureControl: 6,
      hygiene: 6,
      material: 6,
      usability: 7,
      portability: 9,
      priceValue: 9,
      durability: 6,
      additionalFeatures: 7,
    },
  },
  '8025187240': {
    title: '고급 유리 분유포트 (BPA Free)',
    price: 75000,
    reviewCount: 1890,
    coreValues: {
      temperatureControl: 9,
      hygiene: 10,
      material: 10,
      usability: 6,
      portability: 2,
      priceValue: 6,
      durability: 7,
      additionalFeatures: 7,
    },
  },
  '8248083200': {
    title: '다기능 분유포트 세트',
    price: 95000,
    reviewCount: 1250,
    coreValues: {
      temperatureControl: 8,
      hygiene: 8,
      material: 9,
      usability: 7,
      portability: 4,
      priceValue: 5,
      durability: 8,
      additionalFeatures: 9,
    },
  },
  '8356115729': {
    title: '경제형 분유포트',
    price: 32000,
    reviewCount: 5620,
    coreValues: {
      temperatureControl: 6,
      hygiene: 6,
      material: 6,
      usability: 7,
      portability: 7,
      priceValue: 10,
      durability: 6,
      additionalFeatures: 5,
    },
  },
  '8591558719': {
    title: '무선 분유포트 (충전식)',
    price: 58000,
    reviewCount: 3780,
    coreValues: {
      temperatureControl: 8,
      hygiene: 7,
      material: 8,
      usability: 9,
      portability: 8,
      priceValue: 7,
      durability: 7,
      additionalFeatures: 9,
    },
  },
  '8599323586': {
    title: '초음파 살균 분유포트',
    price: 78000,
    reviewCount: 2140,
    coreValues: {
      temperatureControl: 8,
      hygiene: 10,
      material: 9,
      usability: 7,
      portability: 4,
      priceValue: 6,
      durability: 8,
      additionalFeatures: 10,
    },
  },
  '8682829959': {
    title: '퀵 히팅 분유포트 (3초 가열)',
    price: 69000,
    reviewCount: 4560,
    coreValues: {
      temperatureControl: 9,
      hygiene: 7,
      material: 8,
      usability: 9,
      portability: 5,
      priceValue: 7,
      durability: 7,
      additionalFeatures: 8,
    },
  },
  '8723454926': {
    title: '야간 수유 LED 분유포트',
    price: 52000,
    reviewCount: 3290,
    coreValues: {
      temperatureControl: 8,
      hygiene: 7,
      material: 7,
      usability: 8,
      portability: 6,
      priceValue: 8,
      durability: 7,
      additionalFeatures: 9,
    },
  },
  '8832134810': {
    title: '자동 세척 분유포트',
    price: 88000,
    reviewCount: 1780,
    coreValues: {
      temperatureControl: 8,
      hygiene: 10,
      material: 9,
      usability: 8,
      portability: 3,
      priceValue: 5,
      durability: 9,
      additionalFeatures: 10,
    },
  },
  '8950011599': {
    title: '베이직 분유포트 (베스트셀러)',
    price: 38000,
    reviewCount: 9850,
    coreValues: {
      temperatureControl: 7,
      hygiene: 7,
      material: 7,
      usability: 8,
      portability: 6,
      priceValue: 9,
      durability: 8,
      additionalFeatures: 6,
    },
  },
};

/**
 * 모든 제품 데이터 로드
 */
export async function loadAllProducts(): Promise<Product[]> {
  try {
    const files = fs.readdirSync(PRODUCTS_DIR);

    const products: Product[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const id = file.replace('.md', '');
      const productData = REAL_PRODUCTS_DATA[id];

      if (productData) {
        const product: Product = {
          id,
          title: productData.title,
          price: productData.price,
          reviewCount: productData.reviewCount,
          reviewUrl: `https://www.coupang.com/vp/products/${id}`,
          ranking: products.length + 1,  // 파일 순서대로 ranking 부여
          thumbnail: `/thumbnails/${id}.jpg`,
          coreValues: productData.coreValues,
        };
        products.push(product);
      }
    }

    console.log(`Loaded ${products.length} real products from data`);
    return products;
  } catch (error) {
    console.error('Failed to load products:', error);
    return [];
  }
}

/**
 * 제품 ID로 단일 제품 로드
 */
export async function loadProductById(id: string): Promise<Product | null> {
  try {
    const productData = REAL_PRODUCTS_DATA[id];

    if (!productData) {
      console.error(`Product ${id} not found in data`);
      return null;
    }

    const product: Product = {
      id,
      title: productData.title,
      price: productData.price,
      reviewCount: productData.reviewCount,
      reviewUrl: `https://www.coupang.com/vp/products/${id}`,
      ranking: 0,  // 개별 조회시에는 ranking 무의미
      thumbnail: `/thumbnails/${id}.jpg`,
      coreValues: productData.coreValues,
    };

    return product;
  } catch (error) {
    console.error(`Failed to load product ${id}:`, error);
    return null;
  }
}
