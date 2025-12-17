/**
 * 카테고리별 데이터 소스 설정
 * - 'danawa': 다나와만 사용
 * - 'enuri': 에누리만 사용
 * - 'both': 다나와 + 에누리 합산 (중복 제거)
 */

export type DataSource = 'danawa' | 'enuri' | 'both';

/**
 * 카테고리별 데이터 소스 매핑
 * - 에누리로 전환할 카테고리만 명시적으로 설정
 * - 나머지는 기본값 'danawa' 사용
 */
export const CATEGORY_DATA_SOURCE: Record<string, DataSource> = {
  // 다나와 + 에누리 합산 (두 소스 모두 데이터 있음)
  formula_maker: 'both',
  
  // TODO: 추후 전환 예정
  // stroller: 'both',
  // car_seat: 'both',
  // diaper: 'both',
};

/**
 * 카테고리의 데이터 소스 반환
 * @param categoryKey 카테고리 키
 * @returns 'danawa' | 'enuri'
 */
export function getDataSource(categoryKey: string): DataSource {
  return CATEGORY_DATA_SOURCE[categoryKey] || 'danawa';
}

/**
 * 에누리 카테고리 코드 매핑
 * - 에누리 DB에서 사용하는 category_code
 */
export const ENURI_CATEGORY_CODES: Record<string, string> = {
  formula_maker: 'formula_maker',
  stroller: 'stroller',
  car_seat: 'car_seat',
  diaper: 'diaper',
};
