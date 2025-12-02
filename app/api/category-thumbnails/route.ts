import { NextResponse } from 'next/server';
import { getSpecsByCategory } from '@/lib/data/specLoader';
import { CATEGORIES, Category } from '@/lib/data';

export async function GET() {
  try {
    const thumbnails: Record<string, string | null> = {};

    // 각 카테고리별로 1위 상품의 썸네일 가져오기
    for (const category of CATEGORIES) {
      try {
        const specs = await getSpecsByCategory(category);

        // 순위 1위 상품 찾기
        const rank1Product = specs.find(product => product['순위'] === 1);

        if (rank1Product && rank1Product['썸네일']) {
          thumbnails[category] = rank1Product['썸네일'];
        } else {
          thumbnails[category] = null;
        }
      } catch (error) {
        console.error(`Error loading thumbnail for ${category}:`, error);
        thumbnails[category] = null;
      }
    }

    return NextResponse.json({
      success: true,
      thumbnails,
    });
  } catch (error) {
    console.error('Error in category-thumbnails API:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load category thumbnails',
        thumbnails: {},
      },
      { status: 500 }
    );
  }
}
