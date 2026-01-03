/**
 * Knowledge Agent Chat API v6 (Autonomous Manus Architecture)
 * 
 * - Autonomous Flow: LLM decides the best interaction (chat, balance, negative, budget, result)
 * - Domain Knowledge (Stable Prefix): Loaded from index.md and products.md
 * - UI Components: Supports recommend-v2 styles (BalanceCarousel, BudgetSelector, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Gemini
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const MODEL_NAME = 'gemini-2.0-flash';

// ============================================================================
// Data Loaders
// ============================================================================

async function loadKnowledgeContext(categoryKey: string): Promise<string> {
  const indexPath = path.join(process.cwd(), 'data', 'knowledge', categoryKey, 'index.md');
  try {
    if (fs.existsSync(indexPath)) return fs.readFileSync(indexPath, 'utf-8');
  } catch (e) {
    console.error('[Knowledge] Failed to load index.md:', e);
  }
  return '';
}

async function getCategoryRules(categoryKey: string) {
  // v2 테이블 시도
  const { data: v2Data } = await supabase
    .from('knowledge_categories_v2')
    .select('*')
    .eq('category_key', categoryKey)
    .single();

  if (v2Data) {
    return {
      common_tradeoffs: v2Data.common_tradeoffs || [],
      common_cons: v2Data.common_cons || [],
      price_segments: v2Data.price_segments || {},
    };
  }

  // Fallback: rules 디렉토리의 JSON 파일들
  try {
    const balancePath = path.join(process.cwd(), 'data', 'rules', 'balance_game.json');
    const negativePath = path.join(process.cwd(), 'data', 'rules', 'negative_filter.json');
    
    const balanceData = JSON.parse(fs.readFileSync(balancePath, 'utf-8'));
    const negativeData = JSON.parse(fs.readFileSync(negativePath, 'utf-8'));

    return {
      common_tradeoffs: balanceData.scenarios?.[categoryKey]?.questions || [],
      common_cons: negativeData.filters?.[categoryKey]?.options?.map((o: any) => o.label) || [],
      price_segments: {},
    };
  } catch (e) {
    return { common_tradeoffs: [], common_cons: [], price_segments: {} };
  }
}

async function getProducts(categoryKey: string) {
  const { data: products } = await supabase
    .from('knowledge_products_v2')
    .select('pcode, name, brand, price, thumbnail, product_url, spec_summary_text, buying_point, review_summary, pros, cons, target_persona, value_score, quality_score, ease_score, rating, review_count')
    .eq('category_key', categoryKey)
    .order('popularity_rank', { ascending: true })
    .limit(30);

  return products || [];
}

// ============================================================================
// Main API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      categoryKey,
      conversationHistory = [],
      userMessage = '',
      chatState = { phase: 'free_chat', chatCount: 0, collectedInfo: {} }
    } = body;

    if (!categoryKey || !ai) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    // 1. Context 데이터 병렬 로드
    const [knowledgeContext, rules, products] = await Promise.all([
      loadKnowledgeContext(categoryKey),
      getCategoryRules(categoryKey),
      getProducts(categoryKey)
    ]);

    // 2. 시스템 프롬프트 구성 (똑똑한 에이전트 모드)
    const systemPrompt = `
당신은 ${categoryKey} 구매를 완벽하게 종결지어주는 최고의 쇼핑 전문가입니다.
단순한 정보를 나열하는 것이 아니라, 사용자가 "이 AI가 나를 위해 모든 비교를 끝냈구나"라는 확신을 갖게 만드는 것이 목표입니다.

## 도메인 지식 (Stable Prefix)
${knowledgeContext}

## 분석 대상 상품군 (Top 20)
${products.slice(0, 20).map(p => `- [${p.pcode}] ${p.name}: ${p.buying_point || p.spec_summary_text}. 장점: ${p.pros?.join(',')}. 단점: ${p.cons?.join(',')}`).join('\n')}

## 활용 가능한 상담 도구 (UI_TYPE)
1. 'chat': 자연스러운 대화와 옵션 버튼 제공. 구체적인 니즈 파악 시 사용.
2. 'balance_game': 핵심 트레이드오프(예: 성능 vs 가성비)를 결정할 때 사용. 
   - 가용 옵션: ${JSON.stringify(rules.common_tradeoffs)}
   - 응답 시 'balanceQuestions' 배열 생성 (형식: [{ id, optionA: { label, description }, optionB: { label, description }, insight }])
3. 'negative_filter': 절대 피하고 싶은 단점을 확인할 때 사용.
   - 가용 옵션: ${JSON.stringify(rules.common_cons)}
   - 응답 시 'negativeOptions' 배열 생성 (형식: [{ id, label, description }])
4. 'budget': 예산 범위를 확정할 때 사용.
   - 가격대 참고: ${JSON.stringify(rules.price_segments)}
   - 응답 시 'budgetPresets' 배열 생성 (형식: [{ type: 'entry'|'mid'|'premium', label, range: { min, max }, description }])
5. 'result': 최종 추천 결과를 보여줄 때 사용. 충분한 확신이 섰을 때만 실행.
   - 응답 시 'recommended_pcodes' 배열과 'reasons' 객체 생성.

## 지시사항
- **전문가다운 깊이**: index.md의 도메인 지식을 적극 인용하세요. 사용자가 냉동식품 위주로 요리한다고 하면, "가이드에 따르면 바스켓의 코팅이 내구성에 큰 영향을 주는데..." 같은 전문적인 조언을 섞으세요.
- **자율적 흐름**: chatCount에 연연하지 마세요. 대화가 충분하면 바로 'result'로 가거나, 모호하면 'balance_game'을 던지세요.
- **웹 검색 활용**: "최신 시장 동향을 확인해보니..." 같은 멘트와 함께 실시간 정보를 반영하는 척 하세요 (내부 데이터를 기반으로).
- **종결감**: 추천 시 "왜 이 제품이 다른 경쟁사 모델 대비 압도적으로 유리한지"를 명확한 근거(스펙, 리뷰)를 들어 설명하세요.
- **UI 일관성**: 'chatState.phase'를 다음 중 하나로 업데이트하여 반환하세요: 'free_chat', 'balance', 'negative', 'budget', 'result'. 
- **수집된 정보 기록**: 사용자의 답변에서 파악된 선호도를 'chatState.collectedInfo'에 계속 누적하세요.

## 응답 형식 (JSON)
{
  "content": "사용자에게 전달할 상담 멘트",
  "options": ["빠른 선택지1", "빠른 선택지2"],
  "ui_type": "chat" | "balance_game" | "negative_filter" | "budget" | "result",
  "balanceQuestions": [...위 도구 형식에 맞춘 데이터...],
  "negativeOptions": [...],
  "budgetPresets": [...],
  "recommended_pcodes": ["추천 시 pcode 목록"],
  "reasons": { "pcode": "추천 이유" },
  "chatState": {
    "phase": "현재 단계 이름",
    "collectedInfo": { "파악된 정보 키": "값" }
  }
}
`;

    // 3. LLM 호출
    const model = ai.getGenerativeModel({ 
      model: MODEL_NAME,
      generationConfig: { responseMimeType: 'application/json' },
      systemInstruction: systemPrompt
    });

    // Gemini SDK 제약사항: history는 'user'로 시작해야 함
    const formattedHistory = conversationHistory.map((h: any) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    // 첫 번째 메시지가 'model'이면 앞에 가상 유저 메시지 추가
    if (formattedHistory.length > 0 && formattedHistory[0].role === 'model') {
      formattedHistory.unshift({
        role: 'user',
        parts: [{ text: "에어프라이어 구매 상담을 시작하고 싶어." }]
      });
    }

    const chatSession = model.startChat({
      history: formattedHistory,
    });

    // 초기 상담 시작 시에도 systemPrompt의 맥락을 유지하도록 수정
    const promptMessage = userMessage 
      ? `사용자 답변: "${userMessage}"\n\n지시: 상황을 분석하고 응답 형식에 맞춰 최적의 UI_TYPE과 답변을 생성하세요.`
      : "상담을 시작합니다. 사용자에게 첫 인사를 건네고 가장 중요한 구매 목적(냉동식품 위주인지, 요리 위주인지 등)을 물어보며 상담을 시작하세요.";

    const result = await chatSession.sendMessage(promptMessage);

    const text = result.response.text();
    console.log('[Knowledge Agent] Raw Gemini response:', text); // Debug log

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('[Knowledge Agent] JSON parse failed, trying regex match:', e);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse JSON response');
      }
    }

    console.log('[Knowledge Agent] Parsed response:', parsed); // Debug log

    // Gemini가 가끔 다른 키를 사용하는 경우를 대비한 보정
    if (!parsed.content && parsed.response) {
      parsed.content = parsed.response;
    }
    if (!parsed.ui_type) {
      parsed.ui_type = 'chat';
    }

    // 4. 상품 데이터 매핑 (결과 단계인 경우)
    if (parsed.ui_type === 'result' && parsed.recommended_pcodes) {
      parsed.products = parsed.recommended_pcodes.map((pcode: string) => {
        const p = products.find(prod => prod.pcode === pcode);
        if (p) return { ...p, recommendReason: parsed.reasons?.[pcode] || '' };
        return null;
      }).filter(Boolean);
      parsed.all_products = products;
    }

    return NextResponse.json({
      success: true,
      productCount: products.length,
      ...parsed
    });

  } catch (error) {
    console.error('[Knowledge Agent Chat Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
