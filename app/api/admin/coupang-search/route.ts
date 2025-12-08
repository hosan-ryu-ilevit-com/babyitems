/**
 * 쿠팡 상품 검색 API
 * Bright Data 프록시를 통해 쿠팡 검색 결과에서 JSON-LD 파싱
 */

import { NextRequest, NextResponse } from 'next/server';

const BRIGHTDATA_BEARER_TOKEN = process.env.BRIGHTDATA_BEARER_TOKEN || 'bfa2572692b2c737ed81e8d121f85d644df9120b95acbde9e1b28f07b78e3daa';

interface CoupangProduct {
  index: number;
  product_id: string | null;
  name: string;
  thumbnail: string;
  price: string;
  rating: string | number;
  review_count: number;
  url: string;
}

async function fetchWithProxy(url: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BRIGHTDATA_BEARER_TOKEN}`,
      },
      body: JSON.stringify({
        zone: 'unblocker',
        url: url,
        method: 'GET',
        format: 'raw',
      }),
    });

    if (!response.ok) {
      console.error('Proxy request failed:', response.status);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

function extractJsonLd(html: string): CoupangProduct[] {
  // ItemList가 포함된 JSON-LD 찾기
  const pattern = /"itemListElement"\s*:\s*\[(.*?)\]\s*\}/s;
  const match = html.match(pattern);

  if (!match) {
    return [];
  }

  try {
    const itemsStr = '[' + match[1] + ']';
    const items = JSON.parse(itemsStr);

    const products: CoupangProduct[] = [];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const product = item.item || {};
      const offers = product.offers || {};
      const rating = product.aggregateRating || {};

      // URL에서 product ID 추출
      const url = product.url || '';
      const pidMatch = url.match(/\/products\/(\d+)/);
      const productId = pidMatch ? pidMatch[1] : null;

      // 가격 포맷팅
      let price = offers.price || '';
      if (price) {
        price = `${parseInt(price).toLocaleString()}원`;
      }

      products.push({
        index: idx + 1,
        product_id: productId,
        name: product.name || '-',
        thumbnail: product.image || '',
        price: price || '-',
        rating: rating.ratingValue || '-',
        review_count: rating.reviewCount || 0,
        url: url.split('?')[0] || '',
      });
    }

    return products;
  } catch (error) {
    console.error('JSON parse error:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '6');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  // 쿠팡 검색 URL 생성
  const params = new URLSearchParams({ q: query, channel: 'user' });
  const searchUrl = `https://www.coupang.com/np/search?${params.toString()}`;

  console.log(`🔍 Searching Coupang: ${query}`);

  const html = await fetchWithProxy(searchUrl);

  if (!html) {
    return NextResponse.json({ error: 'Failed to fetch Coupang page' }, { status: 500 });
  }

  const products = extractJsonLd(html);

  if (products.length === 0) {
    return NextResponse.json({ products: [], message: 'No products found' });
  }

  return NextResponse.json({
    products: products.slice(0, limit),
    total: products.length,
  });
}
