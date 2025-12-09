/**
 * 카테고리 관련 유틸리티 (클라이언트에서도 사용 가능)
 */

// 카테고리 키 → 다나와 카테고리 코드 매핑
export const CATEGORY_CODE_MAP: Record<string, string[]> = {
  stroller: ['16349368', '16349193', '16349195', '16349196'],
  car_seat: ['16349200', '16349201', '16349202', '16353763'],
  formula: ['16249091'],
  formula_maker: ['16349381'],
  formula_pot: ['16330960'],
  baby_bottle: ['16349219'],
  pacifier: ['16349351'],
  diaper: ['16349108', '16349109', '16356038', '16349110', '16356040', '16356042'],
  baby_wipes: ['16349119'],
  thermometer: ['17325941'],
  nasal_aspirator: ['16349248'],
  ip_camera: ['11427546'],
  baby_bed: ['16338152'],
  high_chair: ['16338153', '16338154'],
  baby_sofa: ['16338155'],
  baby_desk: ['16338156'],
};

/**
 * 세부 카테고리 선택이 필요한지 확인
 * - 유모차: 디럭스형/절충형/휴대용/쌍둥이용 (category_code로 필터)
 * - 카시트: 일체형/분리형/바구니형/부스터형 (category_code로 필터)
 * - 기저귀: 브랜드별 (category_code로 필터)
 */
export function requiresSubCategorySelection(categoryKey: string): boolean {
  const categoriesWithSubCategories = ['stroller', 'car_seat', 'diaper'];
  return categoriesWithSubCategories.includes(categoryKey);
}
