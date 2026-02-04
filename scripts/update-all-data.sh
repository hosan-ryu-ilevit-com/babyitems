#!/bin/bash

###############################################################################
# 전체 데이터 업데이트 스크립트
# 제품 → 리뷰 → 가격 순으로 순차 실행
###############################################################################

set +e  # 에러 발생해도 계속 진행

LOG_DIR="logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

echo "=========================================="
echo "🚀 전체 데이터 업데이트 시작"
echo "=========================================="
echo "시작 시간: $(date)"
echo ""

START_TIME=$(date +%s)

# ============================================================================
# 1단계: 제품 메타데이터 크롤링
# ============================================================================
echo ""
echo "=========================================="
echo "📦 [1/3] 제품 메타데이터 크롤링 시작..."
echo "=========================================="
STEP1_LOG="$LOG_DIR/products_${TIMESTAMP}.log"

npx tsx scripts/crawl-category-products.ts 2>&1 | tee "$STEP1_LOG"
STEP1_EXIT=$?

if [ $STEP1_EXIT -eq 0 ]; then
  echo "✅ [1/3] 제품 크롤링 완료"
else
  echo "⚠️ [1/3] 제품 크롤링 실패 (exit code: $STEP1_EXIT)"
fi

echo "로그: $STEP1_LOG"

# 다음 단계 전 대기
sleep 5

# ============================================================================
# 2단계: 리뷰 크롤링
# ============================================================================
echo ""
echo "=========================================="
echo "📝 [2/3] 리뷰 크롤링 시작..."
echo "=========================================="
STEP2_LOG="$LOG_DIR/reviews_${TIMESTAMP}.log"

npx tsx scripts/crawl-all-reviews-lite.ts 2>&1 | tee "$STEP2_LOG"
STEP2_EXIT=$?

if [ $STEP2_EXIT -eq 0 ]; then
  echo "✅ [2/3] 리뷰 크롤링 완료"
else
  echo "⚠️ [2/3] 리뷰 크롤링 실패 (exit code: $STEP2_EXIT)"
fi

echo "로그: $STEP2_LOG"

# 다음 단계 전 대기
sleep 5

# ============================================================================
# 3단계: 가격 업데이트
# ============================================================================
echo ""
echo "=========================================="
echo "💰 [3/3] 가격 업데이트 시작..."
echo "=========================================="
STEP3_LOG="$LOG_DIR/prices_${TIMESTAMP}.log"

npx tsx scripts/prefetch-knowledge-cache.ts --all --skip-products --skip-reviews --force-prices 2>&1 | tee "$STEP3_LOG"
STEP3_EXIT=$?

if [ $STEP3_EXIT -eq 0 ]; then
  echo "✅ [3/3] 가격 업데이트 완료"
else
  echo "⚠️ [3/3] 가격 업데이트 실패 (exit code: $STEP3_EXIT)"
fi

echo "로그: $STEP3_LOG"

# ============================================================================
# 최종 요약
# ============================================================================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
HOURS=$((ELAPSED / 3600))
MINUTES=$(((ELAPSED % 3600) / 60))
SECONDS=$((ELAPSED % 60))

echo ""
echo "=========================================="
echo "📊 최종 결과"
echo "=========================================="
echo "종료 시간: $(date)"
echo "총 소요 시간: ${HOURS}시간 ${MINUTES}분 ${SECONDS}초"
echo ""
echo "단계별 결과:"
echo "  [1/3] 제품 크롤링: $([ $STEP1_EXIT -eq 0 ] && echo '✅ 성공' || echo "⚠️ 실패 (exit: $STEP1_EXIT)")"
echo "  [2/3] 리뷰 크롤링: $([ $STEP2_EXIT -eq 0 ] && echo '✅ 성공' || echo "⚠️ 실패 (exit: $STEP2_EXIT)")"
echo "  [3/3] 가격 업데이트: $([ $STEP3_EXIT -eq 0 ] && echo '✅ 성공' || echo "⚠️ 실패 (exit: $STEP3_EXIT)")"
echo ""
echo "로그 파일:"
echo "  - $STEP1_LOG"
echo "  - $STEP2_LOG"
echo "  - $STEP3_LOG"
echo "=========================================="

# 모든 단계 성공 시에만 exit 0
if [ $STEP1_EXIT -eq 0 ] && [ $STEP2_EXIT -eq 0 ] && [ $STEP3_EXIT -eq 0 ]; then
  echo "✨ 모든 업데이트 완료!"
  exit 0
else
  echo "⚠️ 일부 단계에서 에러 발생. 로그를 확인하세요."
  exit 1
fi
