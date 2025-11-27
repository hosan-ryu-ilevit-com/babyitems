// Product spec data types (client-safe, no Node.js dependencies)

import type { Category } from './constants';

export type { Category };

export interface ProductSpec {
  카테고리: string;
  카테고리키: Category;
  브랜드: string;
  제품명: string;
  모델명: string;
  최저가: number | null;
  가격범위: string | null;
  썸네일: string | null;
  픽타입: string;
  총점: number | null;
  순위: number;
  총제품수: number;
  요약: string | null;
  검색어: string;
  productId: number;
  // Additional fields may vary by category
  [key: string]: any;
}

export interface ProductWithReviews extends ProductSpec {
  reviewCount?: number;
  avgRating?: number;
  popularityScore?: number; // reviewCount * avgRating
}
