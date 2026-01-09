import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// 동적 단점 옵션 생성 API
// - 사용자가 "피하고 싶은 단점" 질문에 도달했을 때 호출
// - 카테고리 + 앞선 답변 맥락을 반영한 맞춤 옵션 생성
// ============================================================================

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

interface NegativeOption {
  value: string;
  label: string;
  description: string;
}

interface GenerateNegativeOptionsRequest {
  categoryKey: string;
  categoryName: string;
  collectedInfo?: Record<string, string>;
  balanceSelections?: Array<{
    questionId: string;
    selection: 'A' | 'B' | 'skip';
    selectedLabel: string;
  }>;
  trendCons?: string[];  // Init에서 저장해둔 트렌드 단점 키워드
}

// 카테고리별 기본 단점 옵션 (LLM 실패 시 폴백)
const CATEGORY_NEGATIVE_DEFAULTS: Record<string, NegativeOption[]> = {
  // 전자제품 계열
  '선풍기': [
    { value: 'noise', label: '작동 소리가 커서 잠자리에서 쓰기 어려울 것 같아요', description: '조용한 사용을 원하신다면' },
    { value: 'wind_quality', label: '바람이 너무 세거나 약해서 조절이 안 될 것 같아요', description: '세밀한 풍량 조절을 원하신다면' },
    { value: 'size', label: '부피가 커서 수납이나 이동이 어려울 것 같아요', description: '컴팩트한 크기를 원하신다면' },
    { value: 'cleaning', label: '분해 청소가 어려워서 위생 관리가 힘들 것 같아요', description: '간편한 청소를 원하신다면' },
  ],
  '무선청소기': [
    { value: 'battery', label: '배터리가 빨리 닳아서 청소 중간에 멈출 것 같아요', description: '긴 사용 시간을 원하신다면' },
    { value: 'suction', label: '흡입력이 약해서 청소가 잘 안 될 것 같아요', description: '강력한 흡입력을 원하신다면' },
    { value: 'weight', label: '무거워서 오래 들고 있기 힘들 것 같아요', description: '가벼운 무게를 원하신다면' },
    { value: 'noise', label: '소음이 커서 사용하기 불편할 것 같아요', description: '조용한 사용을 원하신다면' },
  ],
  '공기청정기': [
    { value: 'noise', label: '작동 소리가 커서 수면에 방해될 것 같아요', description: '조용한 사용을 원하신다면' },
    { value: 'filter_cost', label: '필터 교체 비용이 부담될 것 같아요', description: '유지비 절감을 원하신다면' },
    { value: 'size', label: '크기가 커서 공간을 많이 차지할 것 같아요', description: '컴팩트한 크기를 원하신다면' },
    { value: 'cleaning', label: '필터 청소나 관리가 번거로울 것 같아요', description: '간편한 관리를 원하신다면' },
  ],
  '모니터': [
    { value: 'eye_strain', label: '장시간 사용 시 눈이 피로할 것 같아요', description: '눈 보호 기능을 원하신다면' },
    { value: 'color', label: '색감이 정확하지 않을 것 같아요', description: '정확한 색재현을 원하신다면' },
    { value: 'response', label: '반응 속도가 느려서 게임이나 영상에 적합하지 않을 것 같아요', description: '빠른 반응을 원하신다면' },
    { value: 'stand', label: '스탠드가 불안정하거나 조절이 어려울 것 같아요', description: '안정적인 거치를 원하신다면' },
  ],
  '무선마우스': [
    { value: 'battery', label: '배터리가 빨리 닳아서 자주 충전해야 할 것 같아요', description: '긴 배터리 수명을 원하신다면' },
    { value: 'lag', label: '무선 지연이 있어서 반응이 느릴 것 같아요', description: '빠른 반응을 원하신다면' },
    { value: 'grip', label: '그립감이 안 맞아서 손이 피로할 것 같아요', description: '편안한 그립을 원하신다면' },
    { value: 'click', label: '클릭감이 안 좋을 것 같아요', description: '좋은 클릭감을 원하신다면' },
  ],
  // 비전자제품 계열
  '물티슈': [
    { value: 'moisture', label: '너무 물기가 많거나 적어서 사용이 불편할 것 같아요', description: '적당한 수분감을 원하신다면' },
    { value: 'thickness', label: '너무 얇아서 쉽게 찢어질 것 같아요', description: '튼튼한 두께를 원하신다면' },
    { value: 'scent', label: '향이 너무 강하거나 불쾌할 것 같아요', description: '은은한 향을 원하신다면' },
    { value: 'residue', label: '닦은 후 끈적임이나 잔여물이 남을 것 같아요', description: '깔끔한 마무리를 원하신다면' },
  ],
  '기저귀': [
    { value: 'leak', label: '샘이 자주 발생할 것 같아요', description: '샘 방지가 중요하시다면' },
    { value: 'rash', label: '피부 트러블이 생길 것 같아요', description: '피부 안전을 원하신다면' },
    { value: 'fit', label: '사이즈가 잘 안 맞아서 불편할 것 같아요', description: '편안한 착용감을 원하신다면' },
    { value: 'absorption', label: '흡수력이 부족해서 축축할 것 같아요', description: '뛰어난 흡수력을 원하신다면' },
  ],
  '분유': [
    { value: 'digestion', label: '소화가 잘 안 되어서 배앓이 할 것 같아요', description: '소화 편안함을 원하신다면' },
    { value: 'taste', label: '맛이 안 맞아서 아이가 안 먹을 것 같아요', description: '아이 입맛을 고려하신다면' },
    { value: 'dissolve', label: '잘 안 녹아서 뭉침이 생길 것 같아요', description: '잘 녹는 분유를 원하신다면' },
    { value: 'allergy', label: '알레르기 반응이 걱정돼요', description: '알레르기 안전을 원하신다면' },
  ],
  '유모차': [
    { value: 'weight', label: '너무 무거워서 들기 힘들 것 같아요', description: '가벼운 무게를 원하신다면' },
    { value: 'fold', label: '접기가 어렵거나 부피가 클 것 같아요', description: '간편한 폴딩을 원하신다면' },
    { value: 'ride', label: '주행감이 불안정할 것 같아요', description: '안정적인 주행을 원하신다면' },
    { value: 'canopy', label: '차양막이 작아서 햇빛 차단이 부족할 것 같아요', description: '넓은 차양막을 원하신다면' },
  ],
};

// 범용 기본 단점 옵션 (카테고리 미등록 시)
const GENERIC_NEGATIVE_OPTIONS: NegativeOption[] = [
  { value: 'quality', label: '품질이 기대에 못 미칠 것 같아요', description: '높은 품질을 원하신다면' },
  { value: 'durability', label: '내구성이 약해서 오래 못 쓸 것 같아요', description: '오래 쓰는 제품을 원하신다면' },
  { value: 'inconvenience', label: '사용하기 불편할 것 같아요', description: '편리한 사용을 원하신다면' },
  { value: 'size', label: '크기가 맞지 않을 것 같아요', description: '적당한 크기를 원하신다면' },
];

function getCategoryFallbackOptions(categoryKey: string, categoryName: string): NegativeOption[] {
  // 정확한 키 매칭
  if (CATEGORY_NEGATIVE_DEFAULTS[categoryKey]) {
    return CATEGORY_NEGATIVE_DEFAULTS[categoryKey];
  }
  // 이름으로 매칭
  if (CATEGORY_NEGATIVE_DEFAULTS[categoryName]) {
    return CATEGORY_NEGATIVE_DEFAULTS[categoryName];
  }
  // 부분 매칭
  for (const key of Object.keys(CATEGORY_NEGATIVE_DEFAULTS)) {
    if (categoryName.includes(key) || key.includes(categoryName)) {
      return CATEGORY_NEGATIVE_DEFAULTS[key];
    }
  }
  return GENERIC_NEGATIVE_OPTIONS;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: GenerateNegativeOptionsRequest = await request.json();
    const { categoryKey, categoryName, collectedInfo, balanceSelections, trendCons } = body;

    console.log(`[GenerateNegativeOptions] Starting for "${categoryName}"`);

    // AI 없으면 폴백 사용
    if (!ai) {
      console.log('[GenerateNegativeOptions] No AI, using fallback');
      return NextResponse.json({
        success: true,
        options: getCategoryFallbackOptions(categoryKey, categoryName),
        source: 'fallback',
        elapsed: Date.now() - startTime,
      });
    }

    // 사용자 맥락 정보 구성
    const userContext: string[] = [];

    // 앞선 답변들
    if (collectedInfo && Object.keys(collectedInfo).length > 0) {
      const answers = Object.entries(collectedInfo)
        .filter(([k]) => !k.startsWith('__'))
        .map(([q, a]) => `- ${q}: ${a}`)
        .join('\n');
      if (answers) {
        userContext.push(`### 사용자 답변\n${answers}`);
      }
    }

    // 밸런스 선택 (우선순위)
    if (balanceSelections && balanceSelections.length > 0) {
      const priorities = balanceSelections
        .filter(b => b.selection !== 'skip')
        .map(b => b.selectedLabel)
        .join(', ');
      if (priorities) {
        userContext.push(`### 사용자 우선순위\n${priorities}`);
      }
    }

    // 트렌드 단점 키워드
    const consKeywords = trendCons && trendCons.length > 0
      ? trendCons.slice(0, 6).join(', ')
      : '';

    // LLM 호출 (flash-lite로 빠르게)
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 600,
      }
    });

    const prompt = `"${categoryName}" 제품의 "피하고 싶은 단점" 옵션을 생성합니다.

${userContext.length > 0 ? `## 사용자 정보\n${userContext.join('\n\n')}` : ''}

${consKeywords ? `## 이 카테고리에서 자주 언급되는 단점 키워드\n${consKeywords}` : ''}

## 규칙
1. **label은 반드시 15자 이상의 완전한 문장**으로 작성
2. 문장 끝은 "싫어요", "걱정돼요", "불편해요", "부담돼요" 등으로 자연스럽게 마무리
3. 사용자의 구체적인 걱정/불편/상황이 드러나야 함
4. 키워드를 그대로 사용하지 말고 **자연스러운 문장으로 변환**
5. **금지: "가격이 비싸다", "예산이 초과된다" 등 가격/비용/예산과 관련된 단점은 절대 생성하지 마세요.** (예산은 별도로 질문합니다.)
6. **해당 카테고리에 실제로 해당되는 단점만** 생성 (예: 물티슈에 "소음" 관련 단점 금지)
7. 사용자 맥락이 있다면 그에 맞는 단점 우선 생성

## 출력 예시
[
  {"value": "noise", "label": "작동 소리가 너무 커서 밤에 사용하기 어려울 것 같아요", "description": "조용한 사용을 원하신다면"},
  {"value": "cleaning", "label": "필터 청소나 관리가 자주 필요해서 번거로울 것 같아요", "description": "간편한 관리를 원하신다면"}
]

JSON 배열만 출력하세요 (4~5개):`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ value: string; label: string; description?: string }>;
        if (parsed.length >= 3) {
          const options: NegativeOption[] = parsed.map(opt => ({
            value: opt.value || opt.label.slice(0, 10).replace(/\s/g, '_'),
            label: opt.label,
            description: opt.description || '',
          }));

          console.log(`[GenerateNegativeOptions] Generated ${options.length} options in ${Date.now() - startTime}ms`);
          return NextResponse.json({
            success: true,
            options,
            source: 'llm',
            elapsed: Date.now() - startTime,
          });
        }
      }
    } catch (llmError) {
      console.error('[GenerateNegativeOptions] LLM error:', llmError);
    }

    // LLM 실패 시 폴백
    console.log('[GenerateNegativeOptions] LLM failed, using fallback');
    return NextResponse.json({
      success: true,
      options: getCategoryFallbackOptions(categoryKey, categoryName),
      source: 'fallback',
      elapsed: Date.now() - startTime,
    });

  } catch (error) {
    console.error('[GenerateNegativeOptions] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      options: GENERIC_NEGATIVE_OPTIONS,
      source: 'error_fallback',
    }, { status: 500 });
  }
}
