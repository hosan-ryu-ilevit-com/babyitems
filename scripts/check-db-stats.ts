import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function check() {
  // knowledge_categories 테이블 확인
  const { data: categories, count: catCount } = await supabase
    .from('knowledge_categories')
    .select('*', { count: 'exact' });

  console.log('📁 knowledge_categories 테이블:');
  console.log(`   카테고리 수: ${catCount}개`);
  if (categories && categories.length > 0) {
    console.log('   샘플:', categories.slice(0, 5).map((c: any) => c.query || c.name || c.category_key));
  }

  // 전체 제품 수
  const { count: totalProducts } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true });

  // 고유 pcode 수
  const { data: pcodes } = await supabase
    .from('knowledge_products_cache')
    .select('pcode')
    .limit(20000);

  const uniquePcodes = [...new Set(pcodes?.map(p => p.pcode) || [])];

  console.log('\n📦 knowledge_products_cache:');
  console.log(`   총 제품: ${totalProducts}개`);
  console.log(`   고유 pcode: ${uniquePcodes.length}개`);

  // 리뷰 통계
  const { count: totalReviews } = await supabase
    .from('knowledge_reviews_cache')
    .select('*', { count: 'exact', head: true });

  const { count: photoReviews } = await supabase
    .from('knowledge_reviews_cache')
    .select('*', { count: 'exact', head: true })
    .not('image_urls', 'is', null);

  console.log('\n📝 knowledge_reviews_cache:');
  console.log(`   총 리뷰: ${totalReviews}개`);
  console.log(`   포토 리뷰: ${photoReviews}개 (${((photoReviews || 0) / (totalReviews || 1) * 100).toFixed(1)}%)`);
}

check();
