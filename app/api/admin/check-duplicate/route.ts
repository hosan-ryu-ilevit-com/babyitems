import { NextRequest, NextResponse } from 'next/server';
import { products } from '@/data/products';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID가 필요합니다.' }, { status: 400 });
  }

  const existingProduct = products.find((p) => p.id === id);

  if (existingProduct) {
    return NextResponse.json({
      exists: true,
      ranking: existingProduct.ranking,
    });
  }

  return NextResponse.json({ exists: false });
}
