/**
 * Knowledge Agent Finalize API
 *
 * 세션 종료 시 단기기억을 장기기억에 병합하는 엔드포인트
 *
 * 사용:
 * - 사용자가 결과 페이지에서 세션을 종료할 때
 * - 페이지 언로드 시 (beforeunload)
 * - 명시적인 "세션 종료" 버튼 클릭 시
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadShortTermMemory,
  mergeToLongTermMemory,
  deleteShortTermMemory,
  getCategoryMemoryStatus,
} from '@/lib/knowledge-agent/memory-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryKey, sessionId, skipMerge = false } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { error: 'categoryKey required' },
        { status: 400 }
      );
    }

    console.log(`[Finalize] Starting session finalization for ${categoryKey}`);

    // 단기기억 확인
    const shortTermMemory = loadShortTermMemory(categoryKey);
    if (!shortTermMemory) {
      return NextResponse.json({
        success: true,
        message: 'No short-term memory found to finalize',
        merged: false,
      });
    }

    // sessionId 검증 (옵션)
    if (sessionId && shortTermMemory.sessionId !== sessionId) {
      console.warn(`[Finalize] Session ID mismatch: expected ${sessionId}, got ${shortTermMemory.sessionId}`);
      // 경고만 하고 계속 진행 (다른 세션의 데이터일 수 있음)
    }

    // 병합 스킵 옵션 (단순 삭제만 원하는 경우)
    if (skipMerge) {
      deleteShortTermMemory(categoryKey);
      console.log(`[Finalize] Short-term memory deleted without merge for ${categoryKey}`);
      return NextResponse.json({
        success: true,
        message: 'Short-term memory deleted without merge',
        merged: false,
      });
    }

    // 단기기억 → 장기기억 병합
    const mergeResult = await mergeToLongTermMemory(categoryKey);

    if (!mergeResult.success) {
      console.error(`[Finalize] Merge failed for ${categoryKey}:`, mergeResult.error);

      // 병합 실패해도 단기기억은 삭제하지 않음 (재시도 가능)
      return NextResponse.json({
        success: false,
        error: mergeResult.error || 'Merge failed',
        merged: false,
      }, { status: 500 });
    }

    console.log(`[Finalize] Session finalized successfully for ${categoryKey}:`, {
      updatedSections: mergeResult.updatedSections,
      newInsightsCount: mergeResult.newInsightsCount,
      productUpdates: mergeResult.productUpdates,
    });

    // 병합 후 상태 확인
    const memoryStatus = getCategoryMemoryStatus(categoryKey);

    return NextResponse.json({
      success: true,
      message: 'Session finalized and merged successfully',
      merged: true,
      mergeResult: {
        updatedSections: mergeResult.updatedSections,
        newInsightsCount: mergeResult.newInsightsCount,
        productUpdates: mergeResult.productUpdates,
      },
      memoryStatus,
    });

  } catch (error) {
    console.error('[Finalize] Error:', error);
    return NextResponse.json(
      { error: 'Finalization failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET: 카테고리의 메모리 상태 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryKey = searchParams.get('categoryKey');

    if (!categoryKey) {
      return NextResponse.json(
        { error: 'categoryKey required' },
        { status: 400 }
      );
    }

    const memoryStatus = getCategoryMemoryStatus(categoryKey);
    const shortTermMemory = loadShortTermMemory(categoryKey);

    return NextResponse.json({
      success: true,
      categoryKey,
      ...memoryStatus,
      shortTermSummary: shortTermMemory ? {
        sessionId: shortTermMemory.sessionId,
        startedAt: shortTermMemory.startedAt,
        questionsAnswered: Object.keys(shortTermMemory.collectedInfo).length,
        webSearchInsights: shortTermMemory.webSearchInsights.length,
        balanceSelections: shortTermMemory.balanceSelections.length,
        negativeSelections: shortTermMemory.negativeSelections.length,
        hasRecommendations: shortTermMemory.finalRecommendations.length > 0,
      } : null,
    });

  } catch (error) {
    console.error('[Finalize GET] Error:', error);
    return NextResponse.json(
      { error: 'Status check failed' },
      { status: 500 }
    );
  }
}
