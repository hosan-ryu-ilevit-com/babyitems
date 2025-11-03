import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// 비밀번호 검증
function checkPassword(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === '1545';
}

interface CoreValuesWithComments {
  temperatureControl: { score: number; comment: string };
  hygiene: { score: number; comment: string };
  material: { score: number; comment: string };
  usability: { score: number; comment: string };
  portability: { score: number; comment: string };
  priceValue: { score: number; comment: string };
  durability: { score: number; comment: string };
  additionalFeatures: { score: number; comment: string };
}

interface SaveProductRequest {
  productData: {
    id: string;
    title: string;
    price: number;
    reviewCount: number;
    ranking: number;
    thumbnail?: string; // 썸네일 경로 추가
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
  };
  markdownContent: string;
  coreValuesComments: CoreValuesWithComments;
}

export async function POST(request: NextRequest) {
  // 비밀번호 검증
  if (!checkPassword(request)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  try {
    const body: SaveProductRequest = await request.json();
    const { productData, markdownContent, coreValuesComments } = body;

    console.log('💾 상품 저장 시작:', {
      productId: productData.id,
      thumbnail: productData.thumbnail,
      hasThumbnail: !!productData.thumbnail,
    });

    // 1. products.ts 업데이트
    await updateProductsTs(productData, coreValuesComments);

    // 2. .md 파일 생성
    await createMarkdownFile(productData.id, markdownContent);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('저장 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장 중 오류 발생' },
      { status: 500 }
    );
  }
}

/**
 * products.ts 파일에 새로운 제품 추가
 */
async function updateProductsTs(
  productData: SaveProductRequest['productData'],
  coreValuesComments: CoreValuesWithComments
) {
  const productsPath = path.join(process.cwd(), 'data', 'products.ts');
  const content = await fs.readFile(productsPath, 'utf-8');

  // 새로운 제품 객체 생성 (주석 포함)
  // 썸네일 경로가 없으면 기본값 사용 (이전 버전 호환성)
  const thumbnailPath = productData.thumbnail || `/thumbnails/${productData.id}.jpg`;

  console.log('📝 products.ts 업데이트:', {
    productId: productData.id,
    receivedThumbnail: productData.thumbnail,
    finalThumbnailPath: thumbnailPath,
  });

  const newProduct = `  {
    id: '${productData.id}',
    title: '${productData.title.replace(/'/g, "\\'")}',
    price: ${productData.price},
    reviewCount: ${productData.reviewCount},
    reviewUrl: 'https://www.coupang.com/vp/products/${productData.id}',
    ranking: ${productData.ranking},
    thumbnail: '${thumbnailPath}',
    coreValues: {
      temperatureControl: ${productData.coreValues.temperatureControl},  // ${coreValuesComments.temperatureControl.comment}
      hygiene: ${productData.coreValues.hygiene},             // ${coreValuesComments.hygiene.comment}
      material: ${productData.coreValues.material},            // ${coreValuesComments.material.comment}
      usability: ${productData.coreValues.usability},           // ${coreValuesComments.usability.comment}
      portability: ${productData.coreValues.portability},        // ${coreValuesComments.portability.comment}
      priceValue: ${productData.coreValues.priceValue},          // ${coreValuesComments.priceValue.comment}
      durability: ${productData.coreValues.durability},          // ${coreValuesComments.durability.comment}
      additionalFeatures: ${productData.coreValues.additionalFeatures}   // ${coreValuesComments.additionalFeatures.comment}
    }
  }`;

  // 기존 배열의 마지막 항목 바로 뒤에 추가
  // ];를 찾아서 그 앞에 콤마와 새 항목 추가
  const lastBracketIndex = content.lastIndexOf('];');
  if (lastBracketIndex === -1) {
    throw new Error('products.ts 파일 형식이 올바르지 않습니다.');
  }

  // 마지막 항목에 콤마가 있는지 확인
  const beforeBracket = content.substring(0, lastBracketIndex).trimEnd();
  const needsComma = !beforeBracket.endsWith(',');

  const updatedContent =
    content.substring(0, lastBracketIndex) +
    (needsComma ? ',' : '') +
    '\n' +
    newProduct +
    '\n' +
    content.substring(lastBracketIndex);

  await fs.writeFile(productsPath, updatedContent, 'utf-8');
}

/**
 * data/products/{id}.md 파일 생성
 */
async function createMarkdownFile(id: string, markdownContent: string) {
  const markdownPath = path.join(process.cwd(), 'data', 'products', `${id}.md`);
  await fs.writeFile(markdownPath, markdownContent, 'utf-8');
}
