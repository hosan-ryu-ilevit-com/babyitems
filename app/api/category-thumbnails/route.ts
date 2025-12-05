import { NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/data';

export async function GET() {
  try {
    const thumbnails: Record<string, string | null> = {};

    // 각 카테고리별로 public/categoryThumbnails/ 폴더의 이미지 경로 반환
    for (const category of CATEGORIES) {
      // 카테고리별 썸네일 파일 경로 (파일명은 카테고리명과 동일)
      thumbnails[category] = `/categoryThumbnails/${category}.png`;
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
