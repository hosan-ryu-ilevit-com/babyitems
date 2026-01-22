# Variants 배치 크롤링 가이드

## 개요

다나와에서 제품의 "다른 구성" (variants) 정보를 크롤링하여 `knowledge_products_cache` 테이블에 업데이트하는 도구입니다.

## 파일 구조

```
lib/danawa/variants-crawler.ts          # Variants 전용 경량 크롤러
scripts/test-variants-batch.ts          # 소규모 테스트 스크립트
scripts/crawl-all-variants.ts           # 전체 배치 크롤링 스크립트
```

## 사용법

### 1. 테스트 (10개 샘플)

```bash
# 10개 샘플 크롤링 (DB 업데이트 X)
npx tsx scripts/test-variants-batch.ts 10

# 30개 샘플 크롤링 + DB 업데이트
npx tsx scripts/test-variants-batch.ts 30 --update-db
```

**출력 예시:**
```
🧪 [Test] Testing variants batch crawl with 10 products

✅ [1/10] 30154592 (하기스 기저귀): 5 variants
⚪ [2/10] 12345678 (에어컨): No variants
❌ [3/10] 98765432 (믹서기): Failed
...

📊 Results:
   Total processed: 10
   With variants: 3
   Without variants: 7
```

### 2. 전체 배치 크롤링 (17,000개)

```bash
# 기본 설정 (동시 4개, 배치 100개)
npx tsx scripts/crawl-all-variants.ts

# 동시성 증가 (빠르지만 차단 위험 ↑)
npx tsx scripts/crawl-all-variants.ts --concurrency=8

# 배치 크기 조정
npx tsx scripts/crawl-all-variants.ts --batch-size=50

# 딜레이 조정 (ms)
npx tsx scripts/crawl-all-variants.ts --delay=1000
```

**권장 설정:**
```bash
# 안정적 (차단 최소화)
npx tsx scripts/crawl-all-variants.ts --concurrency=4 --batch-size=100 --delay=500

# 빠른 크롤링 (차단 위험)
npx tsx scripts/crawl-all-variants.ts --concurrency=8 --batch-size=200 --delay=300
```

### 3. 진행상황 확인

크롤링 중 `logs/` 디렉토리에 다음 파일이 생성됩니다:

```
logs/
├── variants-crawl-2025-01-22.log        # 상세 로그
└── variants-crawl-progress.json         # 진행상황 (중단 시 재시작 지원)
```

**진행상황 파일 예시:**
```json
{
  "totalProducts": 17000,
  "processedProducts": 5000,
  "successCount": 4800,
  "failCount": 200,
  "variantsFoundCount": 1200,
  "lastProcessedPcode": "30154592",
  "startedAt": "2025-01-22T10:00:00Z",
  "lastUpdatedAt": "2025-01-22T11:30:00Z"
}
```

### 4. 중단 및 재시작

크롤링이 중단되면 `variants-crawl-progress.json`이 남아있어 재시작 가능:

```bash
# 중단된 시점부터 자동 재시작
npx tsx scripts/crawl-all-variants.ts
```

## 성능 예상

**17,000개 제품 기준:**

| 설정 | 예상 시간 | 안정성 |
|------|----------|--------|
| Concurrency 4, Delay 500ms | ~8-10시간 | ⭐⭐⭐ 매우 안정 |
| Concurrency 6, Delay 300ms | ~5-7시간 | ⭐⭐ 보통 |
| Concurrency 8, Delay 300ms | ~4-5시간 | ⭐ 차단 위험 |

**병목:**
- 다나와 서버 Rate Limit
- Puppeteer 브라우저 오버헤드

## 크롤링 결과

### DB 스키마

```sql
-- knowledge_products_cache.variants 컬럼 (JSONB)
[
  {
    "pcode": "29893979",
    "quantity": "52매",
    "price": 29990,
    "unitPrice": "577원/1매",
    "mallCount": 8,
    "rank": null,
    "isActive": false,
    "productUrl": "https://prod.danawa.com/info/?pcode=29893979"
  },
  {
    "pcode": "30154592",
    "quantity": "104매",
    "price": 55500,
    "unitPrice": "534원/1매",
    "mallCount": 12,
    "rank": "1위",
    "isActive": true,
    "productUrl": "https://prod.danawa.com/info/?pcode=30154592"
  }
]
```

### 통계 확인

```sql
-- Variants가 있는 제품 수
SELECT COUNT(*)
FROM knowledge_products_cache
WHERE variants IS NOT NULL AND jsonb_array_length(variants) > 0;

-- Variants 평균 개수
SELECT AVG(jsonb_array_length(variants))
FROM knowledge_products_cache
WHERE variants IS NOT NULL;

-- 가장 많은 variants를 가진 제품 Top 10
SELECT pcode, name, jsonb_array_length(variants) as variant_count
FROM knowledge_products_cache
WHERE variants IS NOT NULL
ORDER BY variant_count DESC
LIMIT 10;
```

## 에러 핸들링

### 흔한 에러

**1. Rate Limit (429)**
```
❌ [30154592] Variants crawl error: Too Many Requests
```
**해결:** `--delay` 증가 또는 `--concurrency` 감소

**2. Timeout**
```
❌ [30154592] Variants crawl error: Navigation timeout
```
**해결:** 일시적 오류, 재시작하면 자동 스킵

**3. Page Crash**
```
❌ [W2] Page error for 30154592: Page crashed!
```
**해결:** Puppeteer 메모리 이슈, 정상 (재시작 시 자동 복구)

### 수동 재시도

특정 pcode만 재크롤링:

```typescript
import { crawlVariantsOnly } from './lib/danawa/variants-crawler';

const result = await crawlVariantsOnly('30154592');
console.log(result); // ProductVariant[] | null
```

## 모니터링

### 실시간 로그 확인

```bash
# 로그 실시간 모니터링
tail -f logs/variants-crawl-2025-01-22.log

# 에러만 필터링
tail -f logs/variants-crawl-2025-01-22.log | grep "❌"

# 성공만 필터링
tail -f logs/variants-crawl-2025-01-22.log | grep "✅"
```

### 진행률 확인

```bash
# 진행상황 파일 확인
cat logs/variants-crawl-progress.json | jq
```

## 주의사항

1. **다나와 차단 위험:** 너무 빠르게 크롤링하면 IP 차단 가능
2. **긴 실행 시간:** 17,000개는 최소 4-10시간 소요
3. **네트워크 안정성:** 중간에 연결 끊기면 재시작 필요 (자동 재시작 지원)
4. **메모리:** Puppeteer가 메모리를 많이 사용하므로 최소 8GB RAM 권장

## 트러블슈팅

### 크롤링이 너무 느려요
```bash
# 동시성 증가
npx tsx scripts/crawl-all-variants.ts --concurrency=6
```

### 자주 차단되요 (429 에러)
```bash
# 딜레이 증가
npx tsx scripts/crawl-all-variants.ts --delay=1000 --concurrency=3
```

### 메모리 부족
```bash
# 배치 크기 감소
npx tsx scripts/crawl-all-variants.ts --batch-size=50
```

### 중간에 멈춰요
- 진행상황 파일이 있으면 자동 재시작 됨
- 없으면 처음부터 다시 시작

## 완료 후 확인

```sql
-- 1. Variants 있는 제품 수
SELECT COUNT(*) FROM knowledge_products_cache WHERE variants IS NOT NULL;

-- 2. 샘플 확인
SELECT pcode, name, variants
FROM knowledge_products_cache
WHERE variants IS NOT NULL
LIMIT 5;

-- 3. 카테고리별 통계
SELECT query, COUNT(*) as products_with_variants
FROM knowledge_products_cache
WHERE variants IS NOT NULL
GROUP BY query
ORDER BY products_with_variants DESC;
```

## 성공 체크리스트

- [ ] 테스트 스크립트로 10개 샘플 확인
- [ ] DB에 variants 컬럼 추가 확인
- [ ] 배치 크롤링 실행 (4-10시간 소요)
- [ ] 로그 파일에서 에러 확인
- [ ] Supabase에서 데이터 확인
- [ ] PDP 모달에서 UI 확인
