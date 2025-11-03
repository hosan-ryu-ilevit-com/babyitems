import { NextRequest, NextResponse } from 'next/server';
import { analyzeReviews } from '@/lib/agents/reviewAnalyzer';

// 비밀번호 검증
function checkPassword(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === '1545';
}

export async function POST(request: NextRequest) {
  // 비밀번호 검증
  if (!checkPassword(request)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { coupangId, productTitle, price, reviewCount, ranking, reviewData } = body;

    // 유효성 검사
    if (!coupangId || !productTitle || !price || !reviewCount || !ranking || !reviewData) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    // AI 분석 실행
    const analysisResult = await analyzeReviews({
      coupangId,
      productTitle,
      price,
      reviewCount,
      ranking,
      reviewData,
    });

    // products.ts 형식으로 변환
    const productData = {
      id: coupangId,
      title: productTitle,
      price: price,
      reviewCount: reviewCount,
      ranking: ranking,
      coreValues: analysisResult.coreValues,
    };

    // .md 파일 내용 생성
    const markdownContent = generateMarkdown(
      analysisResult.markdownSections.strengths,
      analysisResult.markdownSections.weaknesses,
      analysisResult.markdownSections.buyerPatterns,
      analysisResult.markdownSections.additionalInfo
    );

    // 응답 반환 (미리보기용)
    return NextResponse.json({
      productData,
      markdownContent,
      coreValuesComments: analysisResult.coreValuesComments, // 나중에 products.ts에 주석으로 추가하기 위함
    });
  } catch (error) {
    console.error('분석 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '분석 중 오류 발생' },
      { status: 500 }
    );
  }
}

// Markdown 파일 내용 생성
function generateMarkdown(
  strengths: string[],
  weaknesses: string[],
  buyerPatterns: string[],
  additionalInfo: string[]
): string {
  let md = '';

  // 장점
  md += '#### **장점:**\n\n';
  strengths.forEach((strength) => {
    md += `- ${strength}\n`;
  });
  md += '\n';

  // 단점
  md += '#### **단점 (고려해야 할 우려점):**\n\n';
  weaknesses.forEach((weakness) => {
    md += `- ${weakness}\n`;
  });
  md += '\n';

  // 구매 패턴
  md += '#### **이 제품을 산 육아 부모들의 패턴/특징:**\n\n';
  buyerPatterns.forEach((pattern) => {
    md += `- ${pattern}\n`;
  });
  md += '\n';

  // 기타
  md += '#### **기타:**\n\n';
  additionalInfo.forEach((info) => {
    md += `- ${info}\n`;
  });

  return md;
}
