# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI 기반 제품 추천 서비스. Supabase에 저장된 다나와/에누리 데이터를 기반으로 **Context Engineering**을 통해 맞춤형 동적 질문을 생성하고, 개인화된 제품을 추천합니다.

**Tech Stack**: Next.js 16.0.7, React 19.2.1, TypeScript, Tailwind CSS v4, Framer Motion, Gemini API, Supabase

**Data Sources**:
- Supabase (메인 DB - 제품, 리뷰, 스펙 데이터)
- 다나와 (제품 스펙, 리뷰 - 사전 크롤링 후 Supabase 저장)
- 에누리 (최저가 정보)

## Development Commands

```bash
npm run dev         # Dev server (localhost:3000)
npm run build       # Production build
npm start           # Production server
npm run lint        # ESLint
```

## Architecture

### User Flow (Knowledge Agent)

**현재 시스템은 Knowledge Agent만 사용합니다.** V2 추천 플로우(`/recommend-v2`)는 더 이상 사용되지 않습니다.

```
/ (홈) → /knowledge-agent (대카테고리 선택) → /knowledge-agent/baby 또는 /living (세부 카테고리) → /knowledge-agent/[categoryKey] (4단계 플로우)
```

**대카테고리 구조**:
- `/knowledge-agent/baby` - 출산/육아용품
- `/knowledge-agent/living` - 생활/주방가전

### 4단계 추천 플로우

`/knowledge-agent/[categoryKey]` 페이지에서 진행되는 단계:

| Phase | 이름 | 설명 |
|-------|------|------|
| `loading` | 분석 중 | Supabase에서 제품/리뷰 데이터 로드 + AI 분석 |
| `questions` → `report` | 맞춤 질문 | Context Engineering으로 동적 생성된 하드필터 질문 |
| `hardcut_visual` → `balance` → `negative_filter` | 선호도 파악 | 후보 시각화 + 밸런스 게임 (A vs B) + 단점 필터 |
| `result` → `free_chat` | 추천 완료 | Top 3 추천 + 자유 채팅 |

### Core Concept: Context Engineering

**핵심 차별점**: 미리 정해진 질문이 아닌, Supabase에 저장된 제품 스펙/리뷰 데이터를 분석하여 해당 카테고리에 맞는 맞춤형 질문을 동적으로 생성합니다.

1. **데이터 로드**: Supabase에서 카테고리별 제품 + 리뷰 데이터 조회
2. **Context 분석**: Gemini API로 제품군의 주요 스펙 차이점, 리뷰에서 언급되는 주요 관심사 분석
3. **동적 질문 생성**: 분석 결과를 바탕으로 해당 카테고리에 최적화된 질문 생성
4. **스코어링**: 사용자 응답 기반으로 제품별 매칭 점수 계산

### Directory Structure

```
babyitem_MVP/
├── app/
│   ├── page.tsx                                    # 홈
│   ├── knowledge-agent/
│   │   ├── page.tsx                                # 대카테고리 선택
│   │   ├── baby/page.tsx                           # 출산/육아용품 카테고리
│   │   ├── living/page.tsx                         # 생활/주방가전 카테고리
│   │   └── [categoryKey]/page.tsx                  # 추천 플로우 (메인)
│   ├── favorites/page.tsx                          # 찜한 상품
│   ├── admin/                                      # 관리자 페이지들
│   └── api/
│       ├── knowledge-agent/                        # Knowledge Agent API
│       │   ├── init/route.ts                       # 초기화 (데이터 로드)
│       │   ├── generate-dynamic-questions/         # 동적 질문 생성
│       │   ├── hard-cut/route.ts                   # 하드컷 필터링
│       │   ├── generate-negative-options/          # 단점 옵션 생성
│       │   ├── final-recommend/route.ts            # 최종 추천
│       │   └── chat/route.ts                       # 자유 채팅
│       ├── ai-selection-helper/                    # AI 도우미 API
│       └── admin/                                  # 관리자 API
├── lib/
│   ├── knowledge-agent/                            # Knowledge Agent 핵심 로직
│   │   ├── types.ts                                # 타입 정의
│   │   ├── supabase-cache.ts                       # Supabase 데이터 캐싱
│   │   ├── memory-manager.ts                       # 장기/단기 메모리 관리
│   │   ├── markdown-parser.ts                      # 메모리 파일 파싱
│   │   └── product-enricher.ts                     # 제품 데이터 보강
│   ├── danawa/                                     # 다나와 크롤러 (오프라인 크롤링용)
│   ├── ai/gemini.ts                                # Gemini API 클라이언트
│   └── logging/                                    # 로깅 (Supabase)
├── data/
│   └── knowledge/                                  # 카테고리별 지식 베이스
│       └── [카테고리명]/
│           ├── index.md                            # 장기기억 (트렌드, 제품 지식)
│           └── session.md                          # 단기기억 (세션별 수집 정보)
├── types/
│   └── knowledge-agent.ts                          # Knowledge Agent 타입
└── components/
    └── knowledge-agent/                            # Knowledge Agent 컴포넌트
        ├── AgenticLoadingPhase.tsx                 # 로딩 단계 UI
        ├── HardcutVisualization.tsx                # 후보 시각화
        └── ChatUIComponents.tsx                    # 채팅 UI
```

## Core Types (`lib/knowledge-agent/types.ts`)

```typescript
// Phase 타입
type Phase = 'loading' | 'report' | 'questions' | 'hardcut_visual' | 'balance' | 'negative_filter' | 'final_input' | 'result' | 'free_chat';

// 장기기억 (카테고리별 지식)
interface LongTermMemoryData {
  categoryKey: string;
  trends: TrendData;           // 트렌드 정보
  products: ProductKnowledge[]; // 제품별 지식
  buyingGuide: BuyingGuide;    // 구매 가이드
}

// 단기기억 (세션별)
interface ShortTermMemoryData {
  sessionId: string;
  filteredCandidates: CandidateProduct[];  // 필터링된 후보
  balanceSelections: BalanceSelection[];    // 밸런스 게임 선택
  negativeSelections: string[];             // 단점 필터 선택
  finalRecommendations: Recommendation[];   // 최종 추천
}

// 하드컷 제품
interface HardCutProduct {
  pcode: string;
  name: string;
  brand: string;
  price: number;
  specs: Record<string, string>;
  matchScore: number;           // 스펙 매칭 점수 (0-100)
  matchedConditions: string[];  // 매칭된 조건들
}

// 최종 추천
interface FinalRecommendation {
  rank: number;
  product: HardCutProduct;
  reason: string;               // 추천 이유
  highlights: string[];         // 핵심 장점
  bestFor?: string;             // 추천 대상
}
```

## Key API Endpoints

### Knowledge Agent

- `POST /api/knowledge-agent/init` - 초기화 (Supabase에서 데이터 로드)
- `POST /api/knowledge-agent/generate-dynamic-questions` - 동적 질문 생성
- `POST /api/knowledge-agent/hard-cut` - 하드컷 필터링
- `POST /api/knowledge-agent/generate-negative-options` - 단점 옵션 생성
- `POST /api/knowledge-agent/final-recommend` - 최종 추천 생성
- `POST /api/knowledge-agent/chat` - 자유 채팅

### AI Selection Helper

- `POST /api/ai-selection-helper` - AI 선택 도우미 (자연어 입력 처리)

## Core Libraries

### `lib/knowledge-agent/`

- `supabase-cache.ts` - Supabase에서 제품/리뷰 데이터 조회 및 캐싱
- `memory-manager.ts` - 장기기억/단기기억 관리
- `types.ts` - 모든 Knowledge Agent 타입 정의

### `lib/ai/gemini.ts`

- Gemini API 클라이언트
- `callGeminiWithRetry()` - 재시도 로직 (3회, 지수 백오프)
- Temperature 설정: 0.3 (분류), 0.5 (분석), 0.7 (생성)

## Environment Variables

```env
# Gemini API
GEMINI_API_KEY=your_gemini_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Key Implementation Notes

1. **Supabase 기반 데이터**: 배포 환경에서는 실시간 크롤링 없이 Supabase에 저장된 데이터 사용
2. **Context Engineering**: 제품 스펙/리뷰 데이터를 분석하여 카테고리별 맞춤 질문 동적 생성
3. **메모리 시스템**:
   - 장기기억 (`data/knowledge/[카테고리]/index.md`): 카테고리별 트렌드, 제품 지식
   - 단기기억 (`session.md`): 세션별 사용자 선택, 필터링 결과
4. **점수 계산**: 하드필터 매칭 + 밸런스 게임 가중치 + 단점 감점 = 최종 점수
5. **로깅**: 모든 사용자 액션은 Supabase `daily_logs` 테이블에 기록

## Common Gotchas

- **Knowledge Agent만 사용**: `/recommend-v2` 등 구버전 플로우는 deprecated
- **실시간 크롤링 X**: 배포 환경에서는 Supabase 캐시 데이터만 사용
- **대카테고리 구조**: baby(출산/육아) vs living(생활/주방) 구분 필요
- **동적 질문**: 질문은 사전 정의가 아닌 Context Engineering으로 생성됨
- **categoryKey vs categoryName**: URL은 한글 카테고리명 사용 (URL 인코딩됨)

## Admin Features

- `/admin` - 통계 대시보드 & 로그 뷰어 (비밀번호: `1545`)
