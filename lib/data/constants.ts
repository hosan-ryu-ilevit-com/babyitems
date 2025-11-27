// Client-safe constants (no Node.js dependencies)

export type Category =
  | 'baby_bottle'
  | 'baby_bottle_sterilizer'
  | 'baby_formula_dispenser'
  | 'baby_monitor'
  | 'baby_play_mat'
  | 'car_seat'
  | 'milk_powder_port'
  | 'nasal_aspirator'
  | 'thermometer';

export const CATEGORIES: Category[] = [
  'baby_bottle',
  'baby_bottle_sterilizer',
  'baby_formula_dispenser',
  'baby_monitor',
  'baby_play_mat',
  'car_seat',
  'milk_powder_port',
  'nasal_aspirator',
  'thermometer',
];

export const CATEGORY_NAMES: Record<Category, string> = {
  baby_bottle: '젖병',
  baby_bottle_sterilizer: '젖병 소독기',
  baby_formula_dispenser: '분유 디스펜서',
  baby_monitor: '아기 모니터',
  baby_play_mat: '아기 놀이 매트',
  car_seat: '카시트',
  milk_powder_port: '분유포트',
  nasal_aspirator: '코흡기',
  thermometer: '체온계',
};
