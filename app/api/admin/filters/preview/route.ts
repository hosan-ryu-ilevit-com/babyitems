/**
 * 하드필터 미리보기 API
 * GET /api/admin/filters/preview?category=xxx
 *
 * 특정 카테고리의 현재 적용 중인 하드필터 질문들을 반환
 * - 옵션별 제품 개수 포함
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateHardFiltersForCategory, loadDanawaProducts } from '@/lib/recommend-v2/danawaFilters';
import { CATEGORY_CODE_MAP } from '@/lib/recommend-v2/categoryUtils';

const ADMIN_PASSWORD = '1545';

// 카테고리 이름 매핑
const CATEGORY_NAMES: Record<string, string> = {
  stroller: '유모차',
  car_seat: '카시트',
  formula: '분유',
  formula_maker: '분유제조기',
  formula_pot: '분유포트',
  baby_bottle: '젖병',
  pacifier: '쪽쪽이/노리개',
  diaper: '기저귀',
  baby_wipes: '아기물티슈',
  thermometer: '체온계',
  nasal_aspirator: '코흡입기',
  ip_camera: '홈캠/IP카메라',
  baby_bed: '유아침대',
  high_chair: '유아의자/식탁의자',
  baby_sofa: '유아소파',
  baby_desk: '유아책상',
};

// features 배열에 포함되는 필터들
const FEATURES_ARRAY_FILTERS = ['안전기능', '기능', '특징', '부가기능'];

// 인증 확인
function checkAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === ADMIN_PASSWORD;
}

// 옵션별 제품 개수 계산
function countProductsForOption(
  products: Array<{ filter_attrs?: Record<string, string>; spec?: { features?: string[] } }>,
  filterName: string,
  optionLabel: string
): number {
  const isFeatureFilter = FEATURES_ARRAY_FILTERS.includes(filterName);

  return products.filter(product => {
    if (isFeatureFilter) {
      const features = product.spec?.features || [];
      return features.some(f => f.toLowerCase().includes(optionLabel.toLowerCase()));
    } else {
      const attrValue = product.filter_attrs?.[filterName];
      return attrValue === optionLabel;
    }
  }).length;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    if (!category) {
      // 카테고리가 없으면 전체 카테고리 목록 반환
      return NextResponse.json({
        success: true,
        data: {
          categories: Object.entries(CATEGORY_NAMES).map(([key, name]) => ({
            key,
            name,
          })),
        },
      });
    }

    if (!CATEGORY_NAMES[category]) {
      return NextResponse.json(
        { success: false, error: `Unknown category: ${category}` },
        { status: 400 }
      );
    }

    // 해당 카테고리의 하드필터 질문 생성 (어드민용: 숨긴 질문도 포함)
    const questions = await generateHardFiltersForCategory(category, undefined, { forAdmin: true });

    // 제품 데이터 로드하여 옵션별 제품 개수 계산
    const allProducts = await loadDanawaProducts();
    const categoryCodes = CATEGORY_CODE_MAP[category] || [];
    const categoryProducts = allProducts.filter(p => categoryCodes.includes(p.category_code));
    const totalProductCount = categoryProducts.length;

    // 각 질문의 옵션에 제품 개수 추가
    const questionsWithCounts = questions.map(q => {
      // question.id에서 filter_name 추출
      const prefix = `hf_${category}_`;
      const idWithoutPrefix = q.id.slice(prefix.length);
      const lastUnderscoreIdx = idWithoutPrefix.lastIndexOf('_');
      const filterName = idWithoutPrefix.slice(0, lastUnderscoreIdx).replace(/_/g, ' ');

      const optionsWithCounts = q.options.map(opt => ({
        ...opt,
        productCount: opt.value === 'any' || opt.label === '상관없어요'
          ? totalProductCount
          : countProductsForOption(categoryProducts, filterName, opt.label),
      }));

      return {
        ...q,
        filterName, // 필터명도 반환
        options: optionsWithCounts,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        category,
        categoryName: CATEGORY_NAMES[category],
        questions: questionsWithCounts,
        questionCount: questionsWithCounts.length,
        totalProductCount,
      },
    });
  } catch (error) {
    console.error('Failed to generate preview:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}
