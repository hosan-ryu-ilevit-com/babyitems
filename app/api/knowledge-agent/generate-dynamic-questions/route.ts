/**
 * Knowledge Agent - Generate Dynamic Questions API
 *
 * 하드컷팅된 15개 상품 기반으로 밸런스 게임/단점 필터 생성
 * - 상품 스펙 분석
 * - 리뷰 키워드 분석 (있을 경우)
 * - 이전 응답과 중복 방지
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

interface GenerateDynamicQuestionsRequest {
  categoryName: string;
  hardcutProducts: HardCutProduct[];
  collectedInfo: Record<string, string>;
  reviews?: Record<string, Array<{ content: string; rating: number }>>;
}

interface GenerateDynamicQuestionsResponse {
  success: boolean;
  balanceQuestions: BalanceQuestion[];
  negativeOptions: NegativeOption[];
  error?: string;
}

/**
 * 상품 스펙에서 트레이드오프 가능한 속성 추출
 */
function analyzeProductSpecs(products: HardCutProduct[]): string {
  // 스펙 분포 분석
  const specMap: Record<string, Set<string>> = {};

  products.forEach(p => {
    if (!p.specSummary) return;

    // specSummary 파싱
    const parts = p.specSummary.split(/[|\/,]/).map(s => s.trim());
    parts.forEach(part => {
      const colonIdx = part.indexOf(':');
      if (colonIdx > 0) {
        const key = part.slice(0, colonIdx).trim();
        const value = part.slice(colonIdx + 1).trim();
        if (key && value && key.length < 15 && value.length < 30) {
          if (!specMap[key]) specMap[key] = new Set();
          specMap[key].add(value);
        }
      }
    });
  });

  // 2개 이상 다양한 값이 있는 스펙만 (= 선택지가 갈리는 스펙)
  const meaningfulSpecs = Object.entries(specMap)
    .filter(([, values]) => values.size >= 2)
    .map(([key, values]) => `- ${key}: ${[...values].slice(0, 5).join(', ')}`)
    .slice(0, 10)
    .join('\n');

  return meaningfulSpecs || '(스펙 다양성 낮음)';
}

/**
 * 리뷰에서 주요 키워드 추출
 */
function analyzeReviews(reviews: Record<string, Array<{ content: string; rating: number }>>): {
  pros: string[];
  cons: string[];
} {
  const positiveKeywords = ['좋아요', '만족', '추천', '최고', '깨끗', '편리', '빠르', '조용', '예쁘', '튼튼', '가성비', '완벽', '대박'];
  const negativeKeywords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작음', '냄새', '누수'];

  const prosFound = new Set<string>();
  const consFound = new Set<string>();

  Object.values(reviews).flat().forEach(review => {
    const content = review.content.toLowerCase();
    for (const kw of positiveKeywords) {
      if (content.includes(kw)) prosFound.add(kw);
    }
    for (const kw of negativeKeywords) {
      if (content.includes(kw)) consFound.add(kw);
    }
  });

  return {
    pros: Array.from(prosFound),
    cons: Array.from(consFound),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateDynamicQuestionsRequest = await request.json();
    const {
      categoryName,
      hardcutProducts,
      collectedInfo,
      reviews,
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

    // AI 없으면 기본 질문 반환
    if (!ai) {
      return NextResponse.json({
        success: true,
        balanceQuestions: getDefaultBalanceQuestions(),
        negativeOptions: getDefaultNegativeOptions(),
      });
    }

    const model = ai.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1500,
      },
    });

    // 상품 스펙 분석
    const specAnalysis = analyzeProductSpecs(hardcutProducts);

    // 리뷰 분석 (있을 경우)
    const reviewAnalysis = reviews ? analyzeReviews(reviews) : { pros: [], cons: [] };

    // 이전에 수집된 정보 (중복 방지용)
    const previousAnswers = Object.entries(collectedInfo)
      .map(([q, a]) => `- ${q}: ${a}`)
      .join('\n') || '(없음)';

    // 상품 요약 (상위 5개)
    const productSummary = hardcutProducts.slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.brand} ${p.name} (${p.price?.toLocaleString()}원) - ${p.specSummary?.slice(0, 80) || ''}`)
      .join('\n');

    const prompt = `당신은 "${categoryName}" 구매 전문 컨설턴트입니다.
사용자가 이미 후보군을 ${hardcutProducts.length}개로 좁힌 상태입니다.
이제 최종 추천을 위해 **진짜 트레이드오프가 되는 질문**과 **피해야 할 단점**을 생성해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📋 사용자가 이미 선택한 조건 (중복 금지!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${previousAnswers}

⚠️ 위 조건과 중복되거나 이미 결정된 내용은 질문하지 마세요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📦 후보 상품 분석 (${hardcutProducts.length}개)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${productSummary}

### 스펙 다양성 분석
${specAnalysis}

${reviewAnalysis.pros.length > 0 ? `### 리뷰 긍정 키워드\n${reviewAnalysis.pros.join(', ')}` : ''}
${reviewAnalysis.cons.length > 0 ? `### 리뷰 부정 키워드\n${reviewAnalysis.cons.join(', ')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🎯 생성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 밸런스 게임 (1~3개만)
⚠️ **Rule 1. 진짜 트레이드오프만!**
- "둘 다 가능한" 가짜 트레이드오프 금지
- 물리적/구조적으로 상반되는 것만 질문
- 예: 가벼움 vs 튼튼함, 큰 용량 vs 휴대성, 빠른 속도 vs 조용함

⚠️ **Rule 2. 이전 선택과 중복 금지**
- 위 "사용자가 이미 선택한 조건"에 있는 내용은 질문하지 마세요
- 예: 이미 "가벼운 것"을 선택했으면 "가벼움 vs 튼튼함" 질문 금지

⚠️ **Rule 3. 후보군에서 실제로 갈리는 것만**
- 후보 상품들의 스펙을 분석해서 실제로 선택지가 갈리는 경우만 질문
- 15개 상품 중 한쪽으로 치우쳐 있으면 질문 불필요

### 피하고 싶은 단점 (3~5개)
⚠️ **Rule 4. 리뷰/스펙 기반 실제 단점**
- 리뷰에서 자주 언급되는 실제 단점만 포함
- 이미 선택한 조건과 상충하는 단점은 제외

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📤 JSON 응답
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "balanceQuestions": [
    {
      "id": "balance_1",
      "type": "tradeoff",
      "title": "상반 관계 제목 (예: 무게 vs 내구성)",
      "option_A": { "text": "A 선택 시 B 포기 암시 문장 (30~50자)", "target_rule_key": "light_weight" },
      "option_B": { "text": "B 선택 시 A 포기 암시 문장 (30~50자)", "target_rule_key": "durability" }
    }
  ],
  "negativeOptions": [
    { "id": "neg_1", "label": "구체적인 단점 설명 (예: 소음이 큰 편이에요)", "target_rule_key": "noise", "exclude_mode": "penalize" },
    { "id": "neg_2", "label": "세척이 번거로워요", "target_rule_key": "cleaning", "exclude_mode": "penalize" }
  ]
}

⚠️ JSON만 출력하세요.
⚠️ 밸런스 질문은 진짜 트레이드오프가 없으면 0개도 OK
⚠️ 단점은 3~5개 필수`;

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
