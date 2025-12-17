# Enuri V2 추천 플로우 통합 계획

## 현재 시스템 구조

### 데이터 소스 (혼합 구조)
| 용도 | 데이터 소스 | 위치 |
|------|------------|------|
| 앵커 제품 조회 | Supabase | `danawa_products` 테이블 |
| 제품 스펙 + 점수 | 로컬 JSON | `data/specs/{category}.json` |
| 리뷰 데이터 | 로컬 JSONL | `data/reviews/{category}.jsonl` |

### 핵심 파일들
- `lib/data/constants.ts` - Category 타입 정의 (9개 카테고리)
- `data/rules/logic_map.json` - 카테고리 → 다나와 코드 매핑 + 스코어링 규칙
- `data/categoryAttributes.ts` - 카테고리별 평가 속성 정의
- `lib/data/specLoader.ts` - 로컬 JSON에서 스펙 로드
- `lib/review/analyzer.ts` - 로컬 JSONL에서 리뷰 로드

### ProductSpec 필수 필드
```typescript
{
  "카테고리키": "stroller",      // Category 타입
  "브랜드": "싸이벡스",
  "모델명": "에이톤 M i-Size",
  "최저가": 350000,
  "썸네일": "https://...",
  "순위": 1,
  "productId": 46256330,        // 에누리 model_no
  "specs": { ... },              // 상세 스펙
  "attributeScores": {           // ⚠️ 핵심! 태그 스코어링에 필수
    "safety": 88,
    "comfort": 72,
    ...
  }
}
```

---

## 통합 계획 (4단계)

### Phase 1: 카테고리 타입 추가
**파일**: `lib/data/constants.ts`

```typescript
// Category 타입에 추가
export type Category =
  | ... 기존 9개 ...
  | 'stroller'
  | 'diaper';

// CATEGORIES 배열에 추가
export const CATEGORIES: Category[] = [..., 'stroller', 'diaper'];

// CATEGORY_NAMES 추가
stroller: '유모차',
diaper: '기저귀',

// CATEGORY_BUDGET_OPTIONS 추가
stroller: [
  { label: '최대 30만원', value: '0-300000', desc: '휴대용' },
  { label: '최대 70만원', value: '0-700000', desc: '절충형', popular: true },
  { label: '최대 120만원', value: '0-1200000', desc: '디럭스' },
  { label: '120만원+', value: '1200000+', desc: '프리미엄' },
],
diaper: [
  { label: '최대 2만원', value: '0-20000', desc: '기본' },
  { label: '최대 4만원', value: '0-40000', desc: '인기', popular: true },
  { label: '최대 6만원', value: '0-60000', desc: '프리미엄' },
  { label: '6만원+', value: '60000+', desc: '최고급' },
],
```

---

### Phase 2: 카테고리 속성 정의
**파일**: `data/categoryAttributes.ts`

유모차(stroller) 속성:
- `safety_certification` - 안전인증 (KCMARKS, UN R129 등)
- `folding_convenience` - 접이식 편의성 (한손접이, 접었을 때 크기)
- `weight_portability` - 무게 및 휴대성
- `suspension_ride` - 서스펜션 및 승차감
- `canopy_coverage` - 캐노피 커버리지
- `storage_basket` - 수납공간
- `handlebar_adjustment` - 핸들바 조절

기저귀(diaper) 속성:
- `absorbency` - 흡수력
- `leak_prevention` - 샘방지
- `skin_gentleness` - 피부 자극 (무향, 저자극)
- `fit_comfort` - 착용감
- `wetness_indicator` - 소변선 표시
- `value_per_piece` - 장당 가격

---

### Phase 3: 데이터 내보내기 스크립트
**생성할 파일**: `scripts/exportEnuriToV2.ts`

#### 3-1. 제품 스펙 내보내기 (JSON)
```
Supabase enuri_products
  → data/specs/stroller.json
  → data/specs/diaper.json
```

**변환 로직**:
```typescript
// Enuri → ProductSpec 변환
{
  카테고리: categoryName,
  카테고리키: categoryKey,
  브랜드: brand,
  모델명: title,
  최저가: price,
  썸네일: thumbnail || imageUrl,
  순위: rank,
  productId: parseInt(model_no),  // 에누리 모델번호를 숫자로
  specs: spec || {},
  attributeScores: generateAttributeScores(product),  // ⚠️ 생성 필요
}
```

#### 3-2. attributeScores 생성
**방법 A**: 규칙 기반 (빠름, 정확도 보통)
- `category_path`, `features`, `spec`에서 키워드 매칭
- 예: "360도 회전" → rotation_score += 20

**방법 B**: LLM 기반 (느림, 정확도 높음)
- 리뷰 + 스펙을 Gemini에 전달
- 각 속성별 0-100 점수 생성

**권장**: 규칙 기반으로 시작, 필요시 LLM 보완

#### 3-3. 리뷰 내보내기 (JSONL)
```
Supabase enuri_reviews
  → data/reviews/stroller.jsonl
  → data/reviews/diaper.jsonl
```

**변환 로직**:
```typescript
// Enuri Review → V2 Review 형식
{
  content: review.content,
  custom_metadata: {
    productId: review.model_no,  // 문자열
    rating: review.rating,
    source: review.source,       // 쇼핑몰명
    author: review.author,
  }
}
```

---

### Phase 4: API 수정

#### 4-1. logic_map.json 추가
```json
{
  "stroller": {
    "category_name": "유모차",
    "target_categories": ["100401"],  // 에누리 코드
    "data_source": "enuri",           // NEW: 데이터 소스 구분
    "rules": { ... }
  },
  "diaper": {
    "category_name": "기저귀",
    "target_categories": ["100729"],
    "data_source": "enuri",
    "rules": { ... }
  }
}
```

#### 4-2. anchor-products API 수정
**파일**: `app/api/v2/anchor-products/route.ts`

```typescript
// 데이터 소스에 따라 다른 테이블 쿼리
const dataSource = categoryLogic.data_source || 'danawa';

if (dataSource === 'enuri') {
  // enuri_products 테이블에서 조회
  const { data: products } = await supabase
    .from('enuri_products')
    .select('model_no, title, brand, price, rank, thumbnail, ...')
    .eq('category_code', targetCategories[0])
    .gt('review_count', 0)
    .order('rank', { ascending: true })
    .limit(limit);

  // 응답 형식 변환 (productId = model_no)
} else {
  // 기존 danawa_products 로직
}
```

---

## 작업 순서

1. **Phase 1**: `lib/data/constants.ts` 수정 (카테고리 추가)
2. **Phase 2**: `data/categoryAttributes.ts` 수정 (속성 정의)
3. **Phase 3-1**: `scripts/exportEnuriToV2.ts` 생성 (내보내기 스크립트)
4. **Phase 3-2**: attributeScores 생성 로직 구현
5. **Phase 3-3**: 스크립트 실행 → JSON/JSONL 파일 생성
6. **Phase 4-1**: `logic_map.json` 수정
7. **Phase 4-2**: `anchor-products/route.ts` 수정
8. **테스트**: `/categories-v2` → 유모차/기저귀 선택 → 추천 플로우

---

## 예상 시간
- Phase 1-2: 30분 (타입/설정 추가)
- Phase 3: 2시간 (내보내기 스크립트 + attributeScores)
- Phase 4: 1시간 (API 수정)
- 테스트: 30분

**총: 약 4시간**

---

## 대안: Supabase 직접 연동 (나중에)

로컬 파일 대신 Supabase에서 직접 로드하도록 변경할 수 있음:
- `specLoader.ts` 수정 → enuri_products에서 로드
- `review/analyzer.ts` 수정 → enuri_reviews에서 로드

장점: 실시간 데이터, 파일 동기화 불필요
단점: 코드 변경 많음, 속도 저하 가능

**권장**: Phase 3의 파일 기반 접근으로 먼저 검증 후, 필요시 Supabase 직접 연동
