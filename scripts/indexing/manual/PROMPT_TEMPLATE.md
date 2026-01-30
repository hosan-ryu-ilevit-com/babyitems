# AI Studio 맞춤질문 생성 프롬프트

## 사용법

1. `npx tsx scripts/indexing/manual/export-category-data.ts` 실행
2. `scripts/indexing/manual/output/categories-data.json` 열기
3. 각 카테고리별로 아래 프롬프트에 데이터 삽입
4. AI Studio에서 실행
5. 결과를 `scripts/indexing/manual/output/results/[카테고리명].json`에 저장
6. `npx tsx scripts/indexing/manual/upload-results.ts` 실행

---

## 프롬프트 템플릿

```
당신은 "{카테고리명}" 구매 결정을 돕는 전문 쇼핑 컨시어지입니다.

## 시장 데이터
- **카테고리:** {카테고리명}
- **상품 수:** {상품수}개
- **가격대:** {최저가}원 ~ {최고가}원 (평균 {평균가}원)
- **주요 브랜드:** {브랜드목록}

## 상위 제품 스펙 (상위 10개)
{상품별 스펙 목록}

## 리뷰 샘플 (긍정/부정 각 10개)
### 긍정 리뷰 (4-5점)
{긍정 리뷰 목록}

### 부정 리뷰 (1-3점)
{부정 리뷰 목록}

## 작업
1. 위 데이터를 분석하여 이 카테고리의 핵심 구매 결정 요소를 파악하세요
2. 3-5개의 맞춤질문을 생성하세요 (예산 질문 제외)
3. 각 질문은 2-4개의 상호 배타적 옵션을 가져야 합니다

## 응답 형식 (JSON만 출력)
{
  "overview": "이 카테고리에 대한 3-5문장 개요. 선택이 어려운 이유, 중요한 기준 설명",
  "questions": [
    {
      "id": "snake_case_id",
      "question": "질문 텍스트 (30-50자)",
      "reason": "이 질문이 중요한 이유 (2-3문장)",
      "options": [
        {
          "value": "option_value",
          "label": "옵션 라벨 (10-20자)",
          "description": "옵션 설명 (20-40자)",
          "isPopular": true/false
        }
      ],
      "type": "single",
      "priority": 1,
      "dataSource": "indexed",
      "completed": false
    }
  ]
}
```

---

## 예시: 이유식조리기

### 입력 데이터
```
- 카테고리: 이유식조리기
- 상품 수: 45개
- 가격대: 29,000원 ~ 189,000원 (평균 78,000원)
- 주요 브랜드: 베이비브레짜, 쿠첸, 해피콜, 보만, 엘바

상위 제품 스펙:
1. 베이비브레짜 BRZ-A1000 | 용량: 600ml, 기능: 찜+블렌딩, 재질: 트라이탄
2. 쿠첸 CIP-BM1010 | 용량: 700ml, 기능: 찜+블렌딩+저온조리, 재질: 스테인리스
...

긍정 리뷰:
- [5점] 한 번에 찜부터 블렌딩까지 되어서 정말 편해요
- [5점] 세척이 쉽고 소음이 적어서 좋아요
...

부정 리뷰:
- [2점] 용량이 작아서 금방 부족해져요
- [3점] 블렌딩 후 덩어리가 남아요
...
```

### 출력 결과
```json
{
  "overview": "이유식조리기는 찜과 블렌딩을 한 번에 할 수 있어 바쁜 육아 중 시간을 절약해줍니다. 용량, 세척 편의성, 추가 기능(저온조리, 살균 등)에 따라 가격대가 크게 달라지며, 아이의 이유식 단계와 사용 빈도에 따라 적합한 제품이 다릅니다.",
  "questions": [
    {
      "id": "capacity",
      "question": "한 번에 만들 이유식 양은 어느 정도인가요?",
      "reason": "이유식조리기의 용량은 300ml부터 1000ml까지 다양합니다. 초기 이유식은 소량씩 자주 만들고, 후기로 갈수록 양이 늘어납니다. 냉동 보관을 많이 할 계획이라면 큰 용량이 편리합니다.",
      "options": [
        {"value": "small", "label": "소량 (1-2회분)", "description": "초기 이유식용, 300-400ml", "isPopular": false},
        {"value": "medium", "label": "중간 (3-4회분)", "description": "중기 이유식용, 500-700ml", "isPopular": true},
        {"value": "large", "label": "대용량 (5회분 이상)", "description": "냉동보관용, 800ml 이상", "isPopular": false}
      ],
      "type": "single",
      "priority": 1,
      "dataSource": "indexed",
      "completed": false
    }
  ]
}
```

---

## 결과 저장 형식

파일명: `scripts/indexing/manual/output/results/{카테고리명}.json`

예: `이유식조리기.json`, `젖병.json`
