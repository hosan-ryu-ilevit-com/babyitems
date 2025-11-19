import fs from 'fs';
import path from 'path';
import { Product } from '@/types';
import { products as REAL_PRODUCTS_DATA } from '@/data/products';

/**
 * 제품 데이터 로더
 *
 * data/products/ 폴더의 .md 파일들을 읽어서 Product 객체 배열로 반환
 * 실제 제품 데이터는 data/products.ts에서 import
 */

const PRODUCTS_DIR = path.join(process.cwd(), 'data', 'products');

/**
 * 모든 제품 데이터 로드
 */
export async function loadAllProducts(): Promise<Product[]> {
  try {
    const files = fs.readdirSync(PRODUCTS_DIR);
    const products: Product[] = [];

    // 마크다운 파일이 있는 제품만 필터링
    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const id = file.replace('.md', '');

      // data/products.ts에서 해당 ID의 제품 찾기
      const productData = REAL_PRODUCTS_DATA.find(p => p.id === id);

      if (productData) {
        products.push(productData);
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
    const product = REAL_PRODUCTS_DATA.find(p => p.id === id);

    if (!product) {
      console.error(`Product ${id} not found in data`);
      return null;
    }

    return product;
  } catch (error) {
    console.error(`Failed to load product ${id}:`, error);
    return null;
  }
}

/**
 * 제품의 상세 분석 마크다운 내용 로드
 */
export async function loadProductDetails(id: string): Promise<string | null> {
  try {
    const mdPath = path.join(PRODUCTS_DIR, `${id}.md`);

    if (!fs.existsSync(mdPath)) {
      console.warn(`Markdown file not found for product ${id}`);
      return null;
    }

    const content = fs.readFileSync(mdPath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Failed to load product details for ${id}:`, error);
    return null;
  }
}

/**
 * 여러 제품의 상세 정보를 한번에 로드 (병렬 처리)
 */
export async function loadMultipleProductDetails(
  ids: string[]
): Promise<Record<string, string>> {
  const details: Record<string, string> = {};

  // 모든 제품의 상세 정보를 병렬로 로드
  const detailPromises = ids.map(id => loadProductDetails(id));
  const results = await Promise.all(detailPromises);

  // 결과를 Record로 변환
  ids.forEach((id, index) => {
    const content = results[index];
    if (content) {
      details[id] = content;
    }
  });

  console.log(`Loaded detailed markdown for ${Object.keys(details).length}/${ids.length} products (parallel)`);

  return details;
}
