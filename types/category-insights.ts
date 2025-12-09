/**
 * Category Insights Types
 *
 * LLM의 "브레인"으로 사용되는 카테고리별 리뷰 기반 인사이트 데이터
 * - AB 질문 동적 생성
 * - 단점 질문 동적 생성
 * - Top 3 추천 이유 생성
 * - 가이드/트렌드 표시
 */

export interface ProInsight {
  id: string;
  rank: number;
  mention_rate: number;  // 0-100 (%)
  text: string;           // 사용자 친화적 텍스트
  keywords: string[];     // LLM 매칭용 키워드
  related_products?: string[];  // 관련 제품/브랜드
}

export interface ConInsight {
  id: string;
  rank: number;
  mention_rate: number;  // 0-100 (%)
  text: string;           // 사용자 친화적 텍스트
  keywords: string[];     // LLM 매칭용 키워드
  deal_breaker_for?: string;  // 어떤 상황에서 치명적인지
}

export interface Tradeoff {
  id: string;
  title: string;
  description?: string;
  option_a: {
    text: string;
    keywords: string[];
  };
  option_b: {
    text: string;
    keywords: string[];
  };
}

export interface CategoryInsights {
  category_key: string;
  category_name: string;
  guide?: {
    title: string;
    summary: string;
    key_points: string[];
    trend: string;
  };
  pros: ProInsight[];
  cons: ConInsight[];
  tradeoffs: Tradeoff[];
  // LLM 질문 생성 힌트
  question_context?: {
    typical_use_cases: string[];
    common_concerns: string[];
    decision_factors: string[];
  };
}

// 전체 인사이트 맵
export type CategoryInsightsMap = Record<string, CategoryInsights>;
