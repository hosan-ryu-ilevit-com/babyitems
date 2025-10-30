import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Product } from '@/types';

/**
 * 제품 데이터 로더
 *
 * data/products/ 폴더의 .md 파일들을 읽어서 Product 객체 배열로 반환
 */

const PRODUCTS_DIR = path.join(process.cwd(), 'data', 'products');

/**
 * 목 제품 데이터 생성 (frontmatter가 없는 경우 사용)
 */
function generateMockProduct(id: string, index: number): Product {
  const mockProducts = [
    { title: '휴대용 접이식 분유포트', price: 35900, temp: 9, hygiene: 7, portability: 10 },
    { title: '프리미엄 스테인리스 분유포트', price: 89000, temp: 10, hygiene: 9, portability: 3 },
    { title: '스마트 온도조절 분유포트', price: 65000, temp: 10, hygiene: 8, portability: 5 },
    { title: '실용형 기본 분유포트', price: 42000, temp: 7, hygiene: 7, portability: 6 },
    { title: '여행용 미니 분유포트', price: 29900, temp: 6, hygiene: 6, portability: 9 },
    { title: '고급 유리 분유포트', price: 75000, temp: 9, hygiene: 10, portability: 2 },
    { title: '다기능 분유포트 세트', price: 95000, temp: 8, hygiene: 8, portability: 4 },
    { title: '경제형 분유포트', price: 32000, temp: 6, hygiene: 6, portability: 7 },
  ];

  const mockData = mockProducts[index % mockProducts.length];

  return {
    id,
    title: mockData.title,
    price: mockData.price,
    reviewCount: Math.floor(Math.random() * 5000) + 100,
    reviewUrl: `https://www.coupang.com/vp/products/${id}`,
    ranking: index + 1,
    thumbnail: `/thumbnails/${id}.jpg`,
    coreValues: {
      temperatureControl: mockData.temp,
      hygiene: mockData.hygiene,
      material: 7,
      usability: 7,
      portability: mockData.portability,
      priceValue: Math.floor((100000 - mockData.price) / 10000),
      durability: 6,
      additionalFeatures: 6,
    },
  };
}

/**
 * 모든 제품 데이터 로드
 */
export async function loadAllProducts(): Promise<Product[]> {
  try {
    const files = fs.readdirSync(PRODUCTS_DIR);

    const products: Product[] = [];
    let index = 0;

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const id = file.replace('.md', '');

      // 임시로 목 데이터 사용 (frontmatter가 없으므로)
      const product = generateMockProduct(id, index);
      products.push(product);
      index++;
    }

    // 랭킹 순으로 정렬
    products.sort((a, b) => a.ranking - b.ranking);

    console.log(`Loaded ${products.length} products with mock data`);
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
    const filePath = path.join(PRODUCTS_DIR, `${id}.md`);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(fileContents);

    const product: Product = {
      id: data.id || id,
      title: data.title || '',
      price: data.price || 0,
      reviewCount: data.reviewCount || 0,
      reviewUrl: data.reviewUrl || '',
      ranking: data.ranking || 0,
      thumbnail: data.thumbnail || `/thumbnails/${id}.jpg`,
      coreValues: data.coreValues || {
        temperatureControl: 5,
        hygiene: 5,
        material: 5,
        usability: 5,
        portability: 5,
        priceValue: 5,
        durability: 5,
        additionalFeatures: 5,
      },
    };

    return product;
  } catch (error) {
    console.error(`Failed to load product ${id}:`, error);
    return null;
  }
}
