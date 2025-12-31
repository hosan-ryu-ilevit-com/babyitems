# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI 기반 아기용품 추천 서비스. Supabase + 다나와/에누리 크롤링 데이터 기반으로 동적 질문/필터링을 통해 개인화된 제품을 추천합니다.

**Tech Stack**: Next.js 16.0.1, React 19.2.0, TypeScript, Tailwind CSS v4, Framer Motion, Gemini API, Supabase

**Data Sources**:

- Supabase (메인 DB)
- 다나와 (제품 스펙, 리뷰)
- 에누리 (최저가 정보)
- Coupang (리뷰, 가격)

## Development Commands

```bash
npm run dev         # Dev server (localhost:3000)
npm run build       # Production build
npm start           # Production server
npm run lint        # ESLint
```

## Architecture

### User Flow (V2 Only)

**현재 시스템은 V2만 사용합니다.** Priority, result, anchor 등 구버전 페이지들은 더 이상 사용되지 않습니다.

```
/ (홈) → /categories-v2 (카테고리 선택) → /recommend-v2/[categoryKey] (6단계 플로우) → /recommend-v2/[categoryKey]/result (결과)
```

**보조 페이지**: `/favorites` (찜한 상품)

### 6단계 추천 플로우

`/recommend-v2/[categoryKey]` 페이지에서 진행되는 단계:

| Step | 이름          | 컴포넌트                        | 설명                           |
| ---- | ------------- | ------------------------------- | ------------------------------ |
| 0    | 트렌드 브리핑 | `scan-animation`, `guide-cards` | 카테고리 트렌드 소개           |
| 1    | 환경 체크     | `hard-filter`                   | 필수 스펙 질문 (단답형/다답형) |
| 2    | 후보 분석     | `checkpoint`                    | 필터링된 제품 시각화           |
| 3    | 취향 선택     | `balance-carousel`              | 밸런스 게임 (A vs B 선택)      |
| 4    | 단점 필터     | `negative-filter`               | 피하고 싶은 단점 선택          |
| 5    | 예산 & 추천   | `budget-slider`, `result-cards` | 예산 설정 후 Top 3 추천        |

### Directory Structure

```
babyitem_MVP/
├── app/
│   ├── page.tsx                                    # 홈
│   ├── categories-v2/page.tsx                      # 카테고리 선택
│   ├── recommend-v2/[categoryKey]/page.tsx         # 추천 플로우 (메인)
│   ├── recommend-v2/[categoryKey]/result/page.tsx  # 결과 페이지
│   ├── favorites/page.tsx                          # 찜한 상품
│   ├── admin/                                      # 관리자 페이지들
│   └── api/
│       ├── v2/                                     # V2 API 엔드포인트
│       ├── ai-selection-helper/                    # AI 도우미 API
│       └── admin/                                  # 관리자 API
├── lib/
│   ├── recommend-v2/                               # 추천 로직 (필터링, 점수계산)
│   ├── data/                                       # 데이터 로더 (제품, 리뷰)
│   ├── danawa/                                     # 다나와 크롤러
│   ├── enuri/                                      # 에누리 크롤러
│   ├── review/                                     # 리뷰 분석
│   ├── ai/                                         # Gemini API 클라이언트
│   └── logging/                                    # 로깅 (Supabase)
├── data/
│   └── rules/                                      # 추천 규칙 JSON 파일
│       ├── hard_filters.json                       # 하드 필터 설정
│       ├── balance_game.json                       # 밸런스 게임 질문
│       ├── negative_filter.json                    # 단점 필터 옵션
│       ├── logic_map.json                          # 룰 키 매핑
│       └── sub_categories.json                     # 세부 카테고리
├── types/
│   ├── recommend-v2.ts                             # V2 플로우 타입
│   └── ...
└── components/
    └── recommend-v2/                               # V2 플로우 컴포넌트
```

## Core Types (`types/recommend-v2.ts`)

```typescript
// 플로우 단계
export type FlowStep = 0 | 1 | 2 | 3 | 4 | 5;

// 컴포넌트 타입
export type ComponentType =
  | "scan-animation" // 스캔 애니메이션
  | "guide-cards" // 가이드 카드
  | "sub-category" // 세부 카테고리 선택
  | "hard-filter" // 하드 필터 질문
  | "checkpoint" // 중간 점검 시각화
  | "balance-carousel" // 밸런스 게임 캐러셀
  | "negative-filter" // 단점 필터 체크박스
  | "budget-slider" // 예산 슬라이더
  | "result-cards"; // 추천 결과

// 하드 필터 질문 타입
export type HardFilterQuestionType = "single" | "multi" | "review_priorities";

// 밸런스 게임 질문 타입
export type BalanceQuestionType = "tradeoff" | "priority";
```

## Key API Endpoints

### V2 추천 플로우

- `GET /api/v2/rules` - 전체 룰 조회
- `GET /api/v2/rules/[categoryKey]` - 카테고리별 룰 조회
- `GET /api/v2/filters/[categoryCode]` - 다나와 필터 조회
- `POST /api/v2/products` - 제품 조회 (필터링 포함)
- `GET /api/v2/anchor-products` - 앵커 제품 조회
- `POST /api/v2/result` - 추천 결과 생성
- `POST /api/v2/recommend-final` - 최종 추천 (점수 계산 포함)
- `POST /api/v2/score` - 제품 점수 계산
- `GET /api/v2/real-reviews` - 실제 리뷰 조회
- `POST /api/v2/comparison-analysis` - 제품 비교 분석
- `POST /api/v2/highlight-review` - 리뷰 하이라이팅
- `POST /api/v2/generate-questions` - 동적 질문 생성
- `POST /api/v2/generate-summary` - 요약 생성
- `POST /api/v2/parse-conditions` - 조건 파싱

### AI Selection Helper

- `POST /api/ai-selection-helper` - AI 선택 도우미 (자연어 입력 처리)
- `POST /api/ai-selection-helper/generate-examples` - 예시 생성
- `POST /api/ai-selection-helper/budget` - 예산 파싱
- `POST /api/ai-selection-helper/budget/generate-examples` - 예산 예시 생성

### 카테고리 & 데이터

- `GET /api/categories-v2` - 카테고리 목록 조회 (Supabase)
- `GET /api/category-thumbnails` - 카테고리 썸네일 조회
- `GET /api/product-reviews` - 제품 리뷰 조회
- `POST /api/analyze-reviews` - 리뷰 분석

### 관리자

- `GET /api/admin/stats` - 통계 조회
- `GET /api/admin/logs` - 로그 조회
- `POST /api/admin/filters` - 필터 관리
- `POST /api/admin/filters/preview` - 필터 프리뷰
- `GET /api/admin/coupang-search` - 쿠팡 검색
- `GET /api/admin/danawa-products` - 다나와 제품 조회

## Core Libraries

### `lib/recommend-v2/`

- `dynamicQuestions.ts` - 동적 질문 생성, 필터링, 점수 계산
  - `filterRelevantRuleKeys()` - 관련 룰 키 필터링
  - `generateDynamicBalanceQuestions()` - 밸런스 게임 질문 생성
  - `generateDynamicNegativeOptions()` - 단점 옵션 생성
  - `applyHardFilters()` - 하드 필터 적용
  - `calculateBalanceScore()` - 밸런스 점수 계산
  - `calculateNegativeScore()` - 단점 점수 계산
  - `calculateHardFilterScore()` - 하드 필터 점수 계산
- `danawaFilters.ts` - 다나와 필터 매핑 및 변환
- `categoryUtils.ts` - 카테고리 유틸리티
- `insightsLoader.ts` - 인사이트 데이터 로딩
- `labelNormalizer.ts` - 레이블 정규화

### `lib/data/`

- 제품 데이터 로딩
- 리뷰 데이터 처리
- 캐싱 로직

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

# Data Sources (Optional)
DANAWA_API_KEY=your_danawa_key
ENURI_API_KEY=your_enuri_key
```

## Key Implementation Notes

1. **Supabase 기반**: 모든 카테고리, 제품 데이터는 Supabase에서 조회
2. **동적 질문 생성**: 하드 필터, 밸런스 게임, 단점 필터 모두 `data/rules/` JSON 파일 기반으로 동적 생성
3. **Rule Key 시스템**: `logic_map.json`에 정의된 룰 키로 제품 속성 매핑
4. **점수 계산 로직**:
   - 하드 필터: 매칭 여부 (0 or 1)
   - 밸런스 게임: 선택된 룰 키에 가중치 부여
   - 단점 필터: 선택된 단점 감점
   - 최종 점수 = 가중 합산
5. **타이핑 애니메이션**: 모든 어시스턴트 메시지에 타이핑 효과 적용 (`AssistantMessage` 컴포넌트)
6. **세션 관리**: `sessionStorage` 사용 (키: `recommend-v2-session`)
7. **로깅**: 모든 사용자 액션은 Supabase `daily_logs` 테이블에 기록

## Common Gotchas

- **V2만 사용**: Priority, result, anchor 등 구버전 페이지는 사용 안 함
- **Rule Key 매핑**: `logic_map.json`에서 룰 키 → 다나와 필터 매핑 확인
- **하드 필터 타입**:
  - `single`: 단일 선택 (라디오)
  - `multi`: 다중 선택 (체크박스)
  - `review_priorities`: 리뷰 기반 우선순위 선택
- **밸런스 게임 타입**:
  - `tradeoff`: 트레이드오프 질문 (A vs B)
  - `priority`: 우선순위 질문
- **카테고리 코드 vs 키**:
  - `category_code`: 다나와 카테고리 코드 (숫자)
  - `categoryKey`: 프론트엔드 카테고리 키 (문자열)
- **점수 정규화**: 최종 점수는 0-100 범위로 정규화
- **Supabase RLS**: Row Level Security 정책 확인 필요

## Debugging

### 일반적인 문제

**제품이 안 뜨는 경우**:

1. Supabase 연결 확인
2. 카테고리 코드 매핑 확인 (`data/rules/hard_filters.json`)
3. 필터 조건 로그 확인 (Console)

**질문이 생성 안 되는 경우**:

1. `data/rules/` JSON 파일 확인
2. 룰 키 매핑 확인 (`logic_map.json`)
3. API 응답 확인 (`/api/v2/rules/[categoryKey]`)

**점수 계산 이상**:

1. `lib/recommend-v2/dynamicQuestions.ts` 점수 계산 로직 확인
2. 룰 키 가중치 확인
3. Console 로그에서 점수 계산 과정 확인

### 개발 팁

- **캐시 클리어**: `/api/admin/clear-cache` 호출
- **로그 확인**: `/admin` 페이지에서 실시간 로그 확인
- **필터 프리뷰**: `/admin/filters` 페이지에서 필터 테스트
- **DB 테스트**: `/api/admin/test-db` 호출로 Supabase 연결 확인

## Admin Features

- `/admin` - 통계 대시보드 & 로그 뷰어 (비밀번호: `1545`)
- `/admin/upload` - 제품 업로드 (쿠팡 URL 기반)
- `/admin/filters` - 필터 관리 및 프리뷰
- `/admin/coupang-mapping` - 쿠팡 제품 매핑

## 최근 주요 변경사항

- **0.9.1**: "뭘 고를지 모르겠어요" 기능 개선
- **0.9**: 카테고리-추천 플로우 로딩 속도 개선
- 리뷰 띵킹 추가
- 체감 속성/리뷰 부여 시스템 추가
- 다나와/에누리 통합
- AI 선택 도우미 추가
