import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 상품 ID로 상세 마크다운 내용 로드
 * 서버 사이드에서만 사용 가능
 */
export function getProductDetail(productId: string): string | null {
  try {
    const filePath = join(process.cwd(), 'data', 'products', `${productId}.md`);
    const content = readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Failed to load product detail for ${productId}:`, error);
    return null;
  }
}

/**
 * 여러 상품의 상세 정보를 한 번에 로드
 */
export function getMultipleProductDetails(productIds: string[]): Record<string, string> {
  const details: Record<string, string> = {};

  productIds.forEach((id) => {
    const detail = getProductDetail(id);
    if (detail) {
      details[id] = detail;
    }
  });

  return details;
}

/**
 * 상품 정보와 마크다운을 결합하여 LLM용 텍스트 생성
 */
export function formatProductForEvaluation(
  productId: string,
  title: string,
  price: number,
  coreValues: Record<string, number>
): string {
  const detail = getProductDetail(productId);

  let formatted = `## ${title}\n\n`;
  formatted += `**가격**: ${price.toLocaleString()}원\n\n`;
  formatted += `**Core Values 점수**:\n`;
  formatted += `- 온도 조절/유지: ${coreValues.temperatureControl}/10\n`;
  formatted += `- 위생/세척: ${coreValues.hygiene}/10\n`;
  formatted += `- 소재/안전성: ${coreValues.material}/10\n`;
  formatted += `- 사용 편의성: ${coreValues.usability}/10\n`;
  formatted += `- 휴대성: ${coreValues.portability}/10\n`;
  formatted += `- 가격/가성비: ${coreValues.priceValue}/10\n`;
  formatted += `- 내구성/A/S: ${coreValues.durability}/10\n`;
  formatted += `- 부가기능/디자인: ${coreValues.additionalFeatures}/10\n\n`;

  if (detail) {
    formatted += `**상세 정보**:\n${detail}\n\n`;
  } else {
    formatted += `*상세 정보 없음*\n\n`;
  }

  formatted += `---\n\n`;

  return formatted;
}
