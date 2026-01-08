/**
 * Knowledge Agent - Generate Dynamic Questions API
 *
 * ⚠️ DEPRECATED: 밸런스 게임 제거됨
 * - 단점 질문은 이제 init API에서 맞춤 질문의 일부로 생성됨
 * - 이 API는 더 이상 사용되지 않음
 * 
 * 이전 기능: 하드컷팅된 15개 상품 기반으로 밸런스 게임/단점 필터 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  HardCutProduct,
  BalanceQuestion,
  NegativeOption,
} from '@/lib/knowledge-agent/types';

export const maxDuration = 30;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 웹서치 context 타입
interface WebSearchContext {
  marketSummary?: {
    topBrands?: string[];
    topPros?: string[];
    topCons?: string[];
    priceRange?: { min: number; max: number };
    reviewCount?: number;
  };
  trendAnalysis?: {
    top10Summary?: string;
    trends?: string[];
    pros?: string[];
    cons?: string[];
    priceInsight?: string;
    sources?: Array<{ title: string; url: string; snippet?: string }>;
  };
}

interface GenerateDynamicQuestionsRequest {
  categoryName: string;
  hardcutProducts: HardCutProduct[];
  collectedInfo: Record<string, string>;
  webSearchContext?: WebSearchContext; // 웹서치 결과 (리뷰 대신)
  reviews?: Record<string, Array<{ content: string; rating: number }>>; // deprecated but kept for compatibility
}

interface GenerateDynamicQuestionsResponse {
  success: boolean;
  balanceQuestions: BalanceQuestion[];
  negativeOptions: NegativeOption[];
  error?: string;
}

/**
 * 상품 스펙에서 트레이드오프 가능한 속성 추출 (강화 버전)
 * - 실제로 후보군에서 선택이 갈리는 스펙만 추출
 * - 수치형/범주형 스펙 모두 분석
 */
function analyzeProductSpecs(products: HardCutProduct[]): {
  specAnalysis: string;
  tradeoffCandidates: Array<{ key: string; optionA: string; optionB: string; reason: string }>;
} {
  const specMap: Record<string, Set<string>> = {};
  const priceList: number[] = [];
  const brandSet = new Set<string>();

  products.forEach(p => {
    if (p.price) priceList.push(p.price);
    if (p.brand) brandSet.add(p.brand);
    if (!p.specSummary) return;

    // specSummary 파싱 (다양한 구분자 지원)
    const parts = p.specSummary.split(/[|\/,]/).map(s => s.trim());
    parts.forEach(part => {
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        const key = part.slice(0, colonIdx).trim();
        const value = part.slice(colonIdx + 1).trim();
        if (key && value && key.length < 20 && value.length < 50) {
          if (!specMap[key]) specMap[key] = new Set();
          specMap[key].add(value);
        }
      } else if (part.length > 2 && part.length < 30) {
        // key:value 형식이 아닌 단독 스펙도 수집
        if (!specMap['기타 특징']) specMap['기타 특징'] = new Set();
        specMap['기타 특징'].add(part);
      }
    });
  });

  // 선택지가 갈리는 스펙 (2개 이상 다양한 값)
  const meaningfulSpecs = Object.entries(specMap)
    .filter(([, values]) => values.size >= 2)
    .map(([key, values]) => {
      const valuesArr = [...values];
      return `- ${key}: ${valuesArr.slice(0, 6).join(', ')}${valuesArr.length > 6 ? '...' : ''}`;
    })
    .slice(0, 12)
    .join('\n');

  // 트레이드오프 후보 자동 추출
  const tradeoffCandidates: Array<{ key: string; optionA: string; optionB: string; reason: string }> = [];

  // 가격 범위 분석
  if (priceList.length > 2) {
    const minPrice = Math.min(...priceList);
    const maxPrice = Math.max(...priceList);
    const priceDiff = maxPrice - minPrice;
    if (priceDiff > minPrice * 0.5) { // 50% 이상 가격 차이
      tradeoffCandidates.push({
        key: 'price',
        optionA: `가성비 (${(minPrice/10000).toFixed(0)}만원대)`,
        optionB: `프리미엄 (${(maxPrice/10000).toFixed(0)}만원대)`,
        reason: '가격 범위가 넓어 선택 필요'
      });
    }
  }

  // 일반적 트레이드오프 패턴 감지
  const tradeoffPatterns = [
    { keys: ['무게', '중량'], high: '가벼움', low: '튼튼함', reason: '무게 vs 내구성' },
    { keys: ['용량', '크기'], high: '대용량', low: '휴대성', reason: '용량 vs 휴대성' },
    { keys: ['소음', '소음도'], high: '저소음', low: '고성능', reason: '소음 vs 성능' },
    { keys: ['속도', '스피드'], high: '빠름', low: '정밀함', reason: '속도 vs 품질' },
  ];

  for (const pattern of tradeoffPatterns) {
    const matchKey = pattern.keys.find(k => specMap[k]?.size >= 2);
    if (matchKey) {
      tradeoffCandidates.push({
        key: matchKey,
        optionA: pattern.high,
        optionB: pattern.low,
        reason: pattern.reason
      });
    }
  }

  return {
    specAnalysis: meaningfulSpecs || '(스펙 다양성 낮음)',
    tradeoffCandidates: tradeoffCandidates.slice(0, 3),
  };
}

/**
 * 웹서치 context에서 단점/주의점 추출
 */
function extractConsFromContext(webSearchContext?: WebSearchContext): string[] {
  const cons: string[] = [];

  // marketSummary에서 단점 추출
  if (webSearchContext?.marketSummary?.topCons) {
    cons.push(...webSearchContext.marketSummary.topCons);
  }

  // trendAnalysis에서 단점/주의점 추출
  if (webSearchContext?.trendAnalysis?.cons) {
    cons.push(...webSearchContext.trendAnalysis.cons);
  }

  // 중복 제거 및 정리
  return [...new Set(cons)].slice(0, 10);
}

/**
 * 웹서치 context에서 트렌드/인사이트 추출
 */
function extractInsightsFromContext(webSearchContext?: WebSearchContext): string {
  const insights: string[] = [];

  if (webSearchContext?.trendAnalysis?.top10Summary) {
    insights.push(`📊 시장 현황: ${webSearchContext.trendAnalysis.top10Summary}`);
  }

  if (webSearchContext?.trendAnalysis?.trends?.length) {
    insights.push(`🔥 트렌드: ${webSearchContext.trendAnalysis.trends.slice(0, 3).join(', ')}`);
  }

  if (webSearchContext?.trendAnalysis?.priceInsight) {
    insights.push(`💰 가격: ${webSearchContext.trendAnalysis.priceInsight}`);
  }

  if (webSearchContext?.marketSummary?.topBrands?.length) {
    insights.push(`🏷️ 인기 브랜드: ${webSearchContext.marketSummary.topBrands.slice(0, 5).join(', ')}`);
  }

  return insights.join('\n') || '(웹서치 정보 없음)';
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateDynamicQuestionsRequest = await request.json();
    const {
      categoryName,
      hardcutProducts,
      collectedInfo,
      webSearchContext,
    } = body;

    if (!hardcutProducts || hardcutProducts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No hardcut products provided',
        balanceQuestions: [],
        negativeOptions: [],
      });
    }

    console.log(`\n🎯 [GenerateDynamicQuestions] Starting: ${hardcutProducts.length}개 상품`);
    console.log(`   - 웹서치 context: ${webSearchContext ? '있음' : '없음'}`);

    // AI 없으면 기본 질문 반환
    if (!ai) {
      return NextResponse.json({
        success: true,
        balanceQuestions: getDefaultBalanceQuestions(),
        negativeOptions: getDefaultNegativeOptions(),
      });
    }

    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2000,
      },
    });

    // 상품 스펙 분석 (강화 버전)
    const { specAnalysis, tradeoffCandidates } = analyzeProductSpecs(hardcutProducts);

    // 웹서치 context에서 인사이트 추출
    const webInsights = extractInsightsFromContext(webSearchContext);

    // 웹서치 context에서 단점 추출
    const contextCons = extractConsFromContext(webSearchContext);

    // 이전에 수집된 정보 (중복 방지용)
    const previousAnswers = Object.entries(collectedInfo)
      .map(([q, a]) => `- ${q}: ${a}`)
      .join('\n') || '(없음)';

    // 상품 요약 (상위 7개 - 더 자세히)
    const productSummary = hardcutProducts.slice(0, 7)
      .map((p, i) => `${i + 1}. ${p.brand} ${p.name} (${p.price?.toLocaleString()}원)\n   스펙: ${p.specSummary?.slice(0, 100) || '정보 없음'}`)
      .join('\n');

    // 브랜드 다양성
    const brands = [...new Set(hardcutProducts.map(p => p.brand).filter(Boolean))];
    const brandInfo = `브랜드: ${brands.slice(0, 6).join(', ')}${brands.length > 6 ? '...' : ''} (${brands.length}개)`;

    // 가격 분포
    const prices = hardcutProducts.map(p => p.price).filter(Boolean) as number[];
    const priceInfo = prices.length > 0 
      ? `가격 범위: ${Math.min(...prices).toLocaleString()}원 ~ ${Math.max(...prices).toLocaleString()}원`
      : '';

    // 자동 감지된 트레이드오프 후보
    const autoTradeoffs = tradeoffCandidates.length > 0
      ? `### 자동 감지된 트레이드오프 후보\n${tradeoffCandidates.map(t => `- ${t.reason}: "${t.optionA}" vs "${t.optionB}"`).join('\n')}`
      : '';

    const prompt = `당신은 "${categoryName}" 구매 전문 컨설턴트입니다.
사용자가 후보군을 **${hardcutProducts.length}개**로 좁힌 상태입니다.
이 ${hardcutProducts.length}개 안에서 **실제로 선택이 갈리는 트레이드오프**와 **이 후보군에서 자주 나오는 단점**을 찾아주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📋 사용자가 이미 선택한 조건 (중복 금지!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${previousAnswers}

⚠️ 위 조건은 이미 결정됨 → 다시 질문하지 마세요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🌐 웹서치 분석 결과 (시장 트렌드 & 실제 단점)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${webInsights}

${contextCons.length > 0 ? `### 웹에서 자주 언급되는 단점/주의점\n${contextCons.map(c => `- ${c}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📦 남은 후보 상품 분석 (${hardcutProducts.length}개)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${brandInfo}
${priceInfo}

### 상품 목록
${productSummary}

### 스펙에서 선택이 갈리는 항목
${specAnalysis}

${autoTradeoffs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🎯 생성 규칙 (엄격히 준수!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 밸런스 게임 (1~2개, 진짜 트레이드오프만!)

✅ **생성 조건**:
1. 위 ${hardcutProducts.length}개 후보 안에서 **실제로 선택이 나뉘는** 트레이드오프만
2. "A를 택하면 B를 포기해야 하는" 물리적/구조적 상반관계
3. 스펙 분석에서 값이 2개 이상 갈리는 항목 우선

❌ **금지**:
- "둘 다 가능한" 가짜 트레이드오프 (예: "편리함 vs 실용성")
- 이미 사용자가 선택한 조건과 겹치는 질문
- 후보군에서 한쪽으로 치우친 스펙 (선택의 의미 없음)

💡 **좋은 예시**:
- "가벼워서 휴대 편함" vs "무겁지만 내구성 좋음"
- "대용량으로 오래 사용" vs "컴팩트해서 공간 절약"
- "저렴해서 부담 없음" vs "비싸지만 기능 풍부"

### 피하고 싶은 단점 (3~5개, 실제 기능 기반!)

✅ **생성 조건**:
1. **이 ${hardcutProducts.length}개 후보군**에서 실제로 나타날 수 있는 단점
2. **웹서치에서 자주 언급**된 실제 사용자 불만
3. **구체적이고 현실적**인 단점 (추상적 표현 금지)
4. **단순한 단점 나열이 아니라, 사용자의 걱정이나 불편함이 드러나는 구체적인 문장 형태로 작성**

❌ **금지**:
- "품질이 안 좋아요" 같은 추상적 표현
- 이미 선택한 조건과 모순되는 단점
- 해당 카테고리와 무관한 일반적 단점
- **가격/비용/예산 관련 단점 (예: "너무 비싸서 부담돼요", "가성비가 떨어져요")** - 예산 질문은 별도로 처리되므로 여기서 생성하지 마세요.

💡 **좋은 예시** (${categoryName} 기준):
- "사용 시 소리가 너무 커서 아기가 깰까 봐 걱정돼요"
- "배터리 교체 시기가 잦아서 계속 신경 써야 하는 건 불편해요"
- "사용 후 닦아도 이물질이 남을까 봐 위생적으로 찝찝해요"
- "부품을 계속 구매해야 해서 추가 비용이 발생하는 건 싫어요"
- "무게가 무거워 이동할 때마다 손목에 무리가 갈까 봐 걱정돼요"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📤 JSON 응답
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "balanceQuestions": [
    {
      "id": "balance_1",
      "type": "tradeoff",
      "title": "짧고 명확한 제목 (예: 휴대성 vs 내구성)",
      "option_A": { "text": "구체적 설명 (30~50자, 트레이드오프 암시)", "target_rule_key": "portable" },
      "option_B": { "text": "구체적 설명 (30~50자, 트레이드오프 암시)", "target_rule_key": "durable" }
    }
  ],
  "negativeOptions": [
    { "id": "neg_1", "label": "구체적 단점 (예: 소음이 예상보다 커요)", "target_rule_key": "noise", "exclude_mode": "penalize" }
  ]
}

⚠️ JSON만 출력
⚠️ 밸런스: 진짜 트레이드오프 없으면 빈 배열 OK
⚠️ 단점: 3~5개 필수, 구체적으로!`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // JSON 추출
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const balanceQuestions: BalanceQuestion[] = (parsed.balanceQuestions || [])
          .slice(0, 3)
          .map((q: any, i: number) => ({
            id: q.id || `balance_${i + 1}`,
            type: q.type || 'tradeoff',
            title: q.title || '',
            option_A: {
              text: q.option_A?.text || '',
              target_rule_key: q.option_A?.target_rule_key || '',
            },
            option_B: {
              text: q.option_B?.text || '',
              target_rule_key: q.option_B?.target_rule_key || '',
            },
          }));

        const negativeOptions: NegativeOption[] = (parsed.negativeOptions || [])
          .slice(0, 5)
          .map((n: any, i: number) => ({
            id: n.id || `neg_${i + 1}`,
            label: n.label || '',
            target_rule_key: n.target_rule_key || '',
            exclude_mode: n.exclude_mode || 'penalize',
          }));

        console.log(`✅ [GenerateDynamicQuestions] 완료: ${balanceQuestions.length}개 밸런스, ${negativeOptions.length}개 단점`);

        return NextResponse.json({
          success: true,
          balanceQuestions,
          negativeOptions,
        } as GenerateDynamicQuestionsResponse);
      }
    } catch (error) {
      console.error('[GenerateDynamicQuestions] LLM error:', error);
    }

    // Fallback
    return NextResponse.json({
      success: true,
      balanceQuestions: getDefaultBalanceQuestions(),
      negativeOptions: getDefaultNegativeOptions(),
    } as GenerateDynamicQuestionsResponse);

  } catch (error) {
    console.error('[GenerateDynamicQuestions] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      balanceQuestions: [],
      negativeOptions: [],
    }, { status: 500 });
  }
}

function getDefaultBalanceQuestions(): BalanceQuestion[] {
  return [
    {
      id: 'balance_default_1',
      type: 'tradeoff',
      title: '가성비 vs 프리미엄',
      option_A: { text: '가성비가 좋은 실속 있는 제품이 좋아요', target_rule_key: 'value' },
      option_B: { text: '가격이 비싸더라도 품질이 좋은 프리미엄 제품이 좋아요', target_rule_key: 'premium' },
    },
  ];
}

function getDefaultNegativeOptions(): NegativeOption[] {
  return [
    { id: 'neg_default_1', label: '소음이 큰 편이에요', target_rule_key: 'noise', exclude_mode: 'penalize' },
    { id: 'neg_default_2', label: 'AS나 사후관리가 불편해요', target_rule_key: 'service', exclude_mode: 'penalize' },
    { id: 'neg_default_3', label: '세척/관리가 번거로워요', target_rule_key: 'cleaning', exclude_mode: 'penalize' },
  ];
}
