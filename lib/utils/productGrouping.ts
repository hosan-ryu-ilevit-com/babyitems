/**
 * 제품 그룹핑 유틸리티
 *
 * 같은 제품의 다른 옵션(용량/개수/연도)을 그룹핑하여
 * Top 3 추천에서 중복을 제거하고, PDP에서 옵션 선택을 가능하게 합니다.
 */

// 그룹핑에 필요한 최소 제품 인터페이스
export interface ProductLike {
  pcode: string;
  title: string;
  price?: number | null;
  rank?: number | null;
  brand?: string | null;
  thumbnail?: string | null;
}

// 제품 변형 (옵션) 정보
export interface ProductVariant {
  pcode: string;
  title: string;
  optionLabel: string;  // "150ml", "2개입", "2024년" 등
  price: number | null;
  rank: number | null;
}

// 그룹핑된 제품
export interface ProductGroup<T extends ProductLike> {
  groupKey: string;           // 정규화된 타이틀
  representative: T;          // 대표 제품 (rank 기준)
  variants: ProductVariant[]; // 변형 제품들 (대표 포함)
  optionCount: number;        // 총 옵션 수
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

/**
 * 타이틀 정규화 - 연도, 수량, 용량 등 제거
 */
export function normalizeTitle(title: string): string {
  let base = title;

  // 1. 연도 제거: 2020, 2021, 2022, 2023, 2024, 2025 등
  base = base.replace(/20\d{2}\s*/g, '');

  // 2. 수량/용량 제거: 60ml, 2개입, 150g, 3팩 등
  base = base.replace(/\d+\s*(ml|ML|g|kg|KG|매|개|팩|장|입|p|P|ea|EA)/gi, '');

  // 3. [숫자...], (숫자...) 패턴 제거: [132매], (3개입) 등
  base = base.replace(/\[\d+[^\]]*\]/g, '');
  base = base.replace(/\(\d+[^)]*\)/g, '');

  // 4. 연속 공백 정리
  base = base.replace(/\s+/g, ' ').trim();

  return base;
}

/**
 * 옵션 라벨 추출 - 정규화 전후 차이에서 옵션 정보 추출
 * 예: "헤겐 애착젖병 PPSU 150ml" → "150ml"
 */
export function extractOptionLabel(title: string): string {
  const labels: string[] = [];

  // 연도 추출
  const yearMatch = title.match(/20(\d{2})/);
  if (yearMatch) {
    labels.push(`20${yearMatch[1]}년`);
  }

  // 용량/수량 추출
  const quantityMatch = title.match(/(\d+)\s*(ml|ML|g|kg|KG|매|개|팩|장|입|p|P|ea|EA)/gi);
  if (quantityMatch) {
    labels.push(...quantityMatch.map(m => m.trim()));
  }

  // [숫자...] 패턴 추출
  const bracketMatch = title.match(/\[(\d+[^\]]*)\]/);
  if (bracketMatch) {
    labels.push(bracketMatch[1]);
  }

  // 라벨이 없으면 기본값
  if (labels.length === 0) {
    return '기본';
  }

  return labels.join(' ');
}

/**
 * 대표 제품 선정 - rank 우선, 없으면 최저가
 */
export function selectRepresentative<T extends ProductLike>(products: T[]): T {
  return [...products].sort((a, b) => {
    // rank가 있으면 rank 기준 (낮을수록 좋음)
    if (a.rank != null && b.rank != null) {
      return a.rank - b.rank;
    }
    // rank가 있는 쪽 우선
    if (a.rank != null) return -1;
    if (b.rank != null) return 1;

    // rank 없으면 가격 기준 (낮을수록 좋음)
    const priceA = a.price ?? Infinity;
    const priceB = b.price ?? Infinity;
    return priceA - priceB;
  })[0];
}

/**
 * 제품 배열을 그룹핑
 */
export function groupProducts<T extends ProductLike>(products: T[]): ProductGroup<T>[] {
  // 1. 정규화된 타이틀로 그룹핑
  const groupMap = new Map<string, T[]>();

  for (const product of products) {
    const groupKey = normalizeTitle(product.title);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push(product);
  }

  // 2. 각 그룹에서 대표 선정 및 변형 정보 생성
  const groups: ProductGroup<T>[] = [];

  for (const [groupKey, groupProducts] of groupMap) {
    const representative = selectRepresentative(groupProducts);

    // 변형 정보 생성 (가격 오름차순 정렬)
    const variants: ProductVariant[] = [...groupProducts]
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
      .map(p => ({
        pcode: p.pcode,
        title: p.title,
        optionLabel: extractOptionLabel(p.title),
        price: p.price ?? null,
        rank: p.rank ?? null,
      }));

    // 가격 범위 계산
    const prices = groupProducts
      .map(p => p.price)
      .filter((p): p is number => p != null && p > 0);

    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : null,
      max: prices.length > 0 ? Math.max(...prices) : null,
    };

    groups.push({
      groupKey,
      representative,
      variants,
      optionCount: variants.length,
      priceRange,
    });
  }

  return groups;
}

/**
 * 제품 배열에서 그룹별 대표만 추출 (중복 제거)
 * 원본 배열의 순서(점수순 등)를 유지하면서 같은 그룹은 첫 번째만 남김
 */
export function deduplicateProducts<T extends ProductLike>(
  products: T[],
  limit?: number
): T[] {
  const seenGroups = new Set<string>();
  const result: T[] = [];

  for (const product of products) {
    const groupKey = normalizeTitle(product.title);

    if (!seenGroups.has(groupKey)) {
      seenGroups.add(groupKey);
      result.push(product);

      if (limit && result.length >= limit) {
        break;
      }
    }
  }

  return result;
}

/**
 * 제품 배열에 variants 정보를 추가
 * 추천 API 결과에 옵션 정보를 덧붙일 때 사용
 */
export function enrichWithVariants<T extends ProductLike>(
  products: T[],
  allProducts: T[]
): Array<T & { variants: ProductVariant[]; optionCount: number; priceRange: { min: number | null; max: number | null } }> {
  // 전체 제품을 그룹핑
  const groups = groupProducts(allProducts);
  const groupMap = new Map(groups.map(g => [g.groupKey, g]));

  return products.map(product => {
    const groupKey = normalizeTitle(product.title);
    const group = groupMap.get(groupKey);

    if (group && group.optionCount > 1) {
      return {
        ...product,
        variants: group.variants,
        optionCount: group.optionCount,
        priceRange: group.priceRange,
      };
    }

    // 옵션이 1개면 variants는 빈 배열
    return {
      ...product,
      variants: [],
      optionCount: 1,
      priceRange: {
        min: product.price ?? null,
        max: product.price ?? null,
      },
    };
  });
}

/**
 * 그룹 내에서 특정 pcode의 변형 정보 조회
 */
export function findVariantByPcode<T extends ProductLike>(
  allProducts: T[],
  pcode: string
): { product: T; variants: ProductVariant[]; optionCount: number } | null {
  const product = allProducts.find(p => p.pcode === pcode);
  if (!product) return null;

  const groupKey = normalizeTitle(product.title);
  const groupProducts = allProducts.filter(p => normalizeTitle(p.title) === groupKey);

  const variants: ProductVariant[] = groupProducts
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    .map(p => ({
      pcode: p.pcode,
      title: p.title,
      optionLabel: extractOptionLabel(p.title),
      price: p.price ?? null,
      rank: p.rank ?? null,
    }));

  return {
    product,
    variants,
    optionCount: variants.length,
  };
}
