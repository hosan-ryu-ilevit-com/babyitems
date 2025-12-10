# 홈 화면 카테고리 캐러셀 구현 계획

## 요구사항 정리

- **위치**: MP4 영상 아래
- **형태**: 두 줄 무한 루프 캐러셀
- **내용**: 카테고리 이름 + 해당 카테고리 랭킹 1위 상품 썸네일
- **디자인**: 하늘색 배경 컨테이너
- **인터랙션**:
  - 자동으로 계속 흘러가는 애니메이션
  - 손으로 스크롤 가능 (터치/드래그)
  - 클릭 시 해당 카테고리 추천 플로우 시작

---

## 구현 계획

### 1단계: CategoryMarquee 컴포넌트 생성

**파일**: `components/CategoryMarquee.tsx`

**기능**:
- 두 줄의 마키(흘러가는) 애니메이션
- Row 1: 왼쪽 → 오른쪽 방향
- Row 2: 오른쪽 → 왼쪽 방향 (시각적 다이나믹)
- 각 카드: 썸네일 이미지 + 카테고리 이름

**카드 디자인**:
```
┌─────────────────┐
│  [썸네일 이미지]  │  하늘색 배경 (#E0F2FE)
│   카테고리 이름   │  rounded-xl
└─────────────────┘
```

### 2단계: 카테고리-상품 데이터 매핑

**사용 가능한 카테고리** (specs 데이터 있음):
1. milk_powder_port (분유포트)
2. baby_bottle (젖병)
3. baby_bottle_sterilizer (젖병 소독기)
4. baby_formula_dispenser (분유 디스펜서)
5. baby_monitor (아기 모니터)
6. baby_play_mat (놀이 매트)
7. car_seat (카시트)
8. nasal_aspirator (코흡입기)
9. thermometer (체온계)

**데이터 구조**:
```typescript
interface CategoryItem {
  id: string;           // category key (e.g., 'milk_powder_port')
  name: string;         // 한글 이름 (e.g., '분유포트')
  thumbnail: string;    // 랭킹 1위 상품 썸네일 URL
  targetUrl: string;    // 클릭 시 이동할 URL
}
```

**구현 방식**:
- 각 카테고리 JSON에서 `순위: 1` 상품의 `썸네일` 추출
- 빌드 타임에 정적으로 매핑 (성능 최적화)

### 3단계: 마키 애니메이션 구현

**기술 선택**: CSS `@keyframes` + Tailwind

**이유**:
- Framer Motion보다 가볍고 부드러움
- 무한 루프에 최적화
- 터치 스크롤과 충돌 없음

**구현 방식**:
```css
@keyframes marquee-left {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes marquee-right {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}
```

**무한 루프 트릭**:
- 아이템을 2배로 복제 (A, B, C → A, B, C, A, B, C)
- 50% 이동 후 즉시 리셋 → 이음새 없는 무한 루프

### 4단계: HomeContent에 통합

**위치**: 영상(`</motion.div>`) 바로 다음, CTA 버튼 전

**코드 위치** (HomeContent.tsx):
```tsx
{/* Video Character Animation */}
<motion.div>...</motion.div>

{/* 여기에 추가 */}
<CategoryMarquee onCategoryClick={handleCategoryClick} />
```

**클릭 핸들러**:
```typescript
const handleCategoryClick = (categoryId: string) => {
  logButtonClick(`카테고리 캐러셀: ${categoryId}`, 'home');
  router.push(`/recommend-v2/${categoryId}`);
};
```

---

## 파일 변경 목록

| 파일 | 변경 내용 |
|------|----------|
| `components/CategoryMarquee.tsx` | 신규 생성 - 캐러셀 컴포넌트 |
| `app/globals.css` | 마키 keyframes 애니메이션 추가 |
| `components/HomeContent.tsx` | CategoryMarquee 컴포넌트 추가 |

---

## 상세 구현 사항

### CategoryMarquee.tsx 구조

```tsx
'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

// 카테고리별 랭킹 1위 상품 정보 (정적 매핑)
const CATEGORY_ITEMS: CategoryItem[] = [
  { id: 'milk_powder_port', name: '분유포트', thumbnail: '...', targetUrl: '/recommend-v2/formula_pot' },
  // ... 9개 카테고리
];

export function CategoryMarquee({ onCategoryClick }: Props) {
  // Row 1: 5개 카테고리
  // Row 2: 4개 카테고리 (다른 조합)

  return (
    <div className="mt-8 mb-4 overflow-hidden">
      {/* Row 1 - 왼쪽으로 흐름 */}
      <div className="flex animate-marquee-left hover:pause">
        {[...row1Items, ...row1Items].map((item, idx) => (
          <CategoryCard key={`r1-${idx}`} item={item} onClick={onCategoryClick} />
        ))}
      </div>

      {/* Row 2 - 오른쪽으로 흐름 */}
      <div className="flex animate-marquee-right hover:pause mt-3">
        {[...row2Items, ...row2Items].map((item, idx) => (
          <CategoryCard key={`r2-${idx}`} item={item} onClick={onCategoryClick} />
        ))}
      </div>
    </div>
  );
}
```

### CategoryCard 디자인

```tsx
function CategoryCard({ item, onClick }: CardProps) {
  return (
    <button
      onClick={() => onClick(item.id)}
      className="flex-shrink-0 mx-2 px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100
                 transition-colors flex items-center gap-2"
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-white">
        <Image
          src={item.thumbnail}
          alt={item.name}
          width={40}
          height={40}
          className="object-cover"
        />
      </div>
      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
        {item.name}
      </span>
    </button>
  );
}
```

---

## 카테고리 → recommend-v2 URL 매핑

| specs 카테고리 | recommend-v2 URL |
|---------------|------------------|
| milk_powder_port | `/recommend-v2/formula_pot` |
| baby_bottle | `/recommend-v2/baby_bottle` |
| baby_bottle_sterilizer | 없음 (추가 필요) |
| baby_formula_dispenser | 없음 (추가 필요) |
| baby_monitor | 없음 (추가 필요) |
| baby_play_mat | 없음 (추가 필요) |
| car_seat | `/recommend-v2/car_seat` |
| nasal_aspirator | `/recommend-v2/nasal_aspirator` |
| thermometer | `/recommend-v2/thermometer` |

**참고**: categories-v2의 CATEGORY_GROUPS에 정의된 카테고리만 recommend-v2 플로우 지원
- 현재 지원: stroller, car_seat, formula, formula_maker, formula_pot, baby_bottle, pacifier, diaper, baby_wipes, thermometer, nasal_aspirator, ip_camera, baby_bed, high_chair, baby_sofa, baby_desk

---

## 예상 결과물

```
┌────────────────────────────────────────────────┐
│                    홈 화면                      │
├────────────────────────────────────────────────┤
│     수천 개 아기용품 중 내게 딱 맞는 하나 찾기      │
│                                                │
│            [캐릭터 영상 MP4]                     │
│                                                │
│ ← [분유포트] [젖병] [카시트] [체온계] [분유포트]... →  │  (Row 1: 왼쪽 흐름)
│ → [놀이매트] [코흡입기] [소독기] [놀이매트]... ←     │  (Row 2: 오른쪽 흐름)
│                                                │
│          [    바로 추천받기 AI    ]              │
└────────────────────────────────────────────────┘
```

---

## 구현 순서

1. **globals.css**: marquee 애니메이션 keyframes 추가
2. **CategoryMarquee.tsx**: 컴포넌트 생성 + 정적 데이터 매핑
3. **HomeContent.tsx**: 컴포넌트 import 및 배치
4. **테스트**: 애니메이션 속도, 터치 스크롤, 클릭 동작 확인
