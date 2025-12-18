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
  // 분유제조기: 다나와 + 에누리 합집합
  formula_maker: 'both',
  baby_formula_dispenser: 'both',
  // 나머지는 다나와만 사용 (기본값)
  // stroller: 'danawa',
  // car_seat: 'danawa',
  // diaper: 'danawa',
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
 * - 현재 분유제조기만 에누리 사용
 */
export const ENURI_CATEGORY_CODES: Record<string, string> = {
  formula_maker: 'formula_maker',
  baby_formula_dispenser: 'baby_formula_dispenser',
  // 아래 카테고리들은 다나와만 사용 (에누리 통합 보류)
  // stroller: 'stroller',
  // car_seat: 'car_seat',
  // diaper: 'diaper',
};

/**
 * 다나와 category_code → 에누리 spec.하위카테고리 키워드 매핑
 * - 에누리 제품의 spec.하위카테고리에서 이 키워드가 포함되면 해당 다나와 카테고리에 매칭
 */
export const SUB_CATEGORY_MAP: Record<string, Record<string, string[]>> = {
  stroller: {
    '16349368': ['디럭스'],           // 디럭스형
    '16349193': ['절충'],             // 절충형
    '16349195': ['휴대용', '기내반입'], // 휴대용
    '16349196': ['쌍둥이', '트윈'],    // 쌍둥이용
  },
  car_seat: {
    '16349200': ['일체형'],           // 일체형
    '16349201': ['분리형'],           // 분리형
    '16349202': ['바구니'],           // 바구니형
    '16353763': ['부스터'],           // 부스터형
  },
  diaper: {
    // 기저귀는 단계/타입 기반 (다나와 코드는 브랜드 기반이라 매핑이 다름)
    // 에누리: 기저귀/4단계/팬티형 형식
    // 일단 전체 포함 (하위 카테고리 필터링 없음)
  },
};

/**
 * 에누리 제품이 특정 다나와 category_code에 매칭되는지 확인
 * @param categoryKey 카테고리 키 (stroller, car_seat 등)
 * @param danawaCategoryCode 다나와 category_code
 * @param enuriSubCategory 에누리 spec.하위카테고리 값
 * @returns 매칭 여부
 */
export function matchesSubCategory(
  categoryKey: string,
  danawaCategoryCode: string,
  enuriSubCategory: string | undefined
): boolean {
  const mapping = SUB_CATEGORY_MAP[categoryKey];
  
  // 매핑이 없거나 빈 객체면 기본 통과
  if (!mapping || Object.keys(mapping).length === 0) {
    return true;
  }
  
  const keywords = mapping[danawaCategoryCode];
  
  // 해당 코드의 키워드가 없으면 통과 (필터 조건 없음)
  if (!keywords || keywords.length === 0) {
    return true;
  }
  
  // 에누리 하위카테고리가 없으면 기본 포함 (unknown 처리)
  if (!enuriSubCategory) {
    return true;
  }
  
  // 키워드 중 하나라도 포함되면 매칭
  return keywords.some(keyword => enuriSubCategory.includes(keyword));
}
