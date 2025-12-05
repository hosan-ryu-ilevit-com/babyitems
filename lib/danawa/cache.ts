/**
 * 다나와 데이터 캐싱 레이어 (Supabase)
 *
 * - TTL: 24시간 (가격 변동 반영)
 * - 캐시 히트 시 크롤링 skip
 * - 캐시 미스 시 크롤링 + 저장
 */

import { createClient } from '@supabase/supabase-js';
import type { DanawaProductData, DanawaCacheEntry } from '@/types/danawa';

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * 캐시에서 다나와 데이터 가져오기
 * @param productCode 다나와 상품 코드
 * @returns 캐시된 데이터 또는 null (만료되었거나 없으면 null)
 */
export async function getCachedDanawaData(productCode: string): Promise<DanawaProductData | null> {
  try {
    const { data, error } = await supabase
      .from('danawa_cache')
      .select('*')
      .eq('product_code', productCode)
      .single();

    if (error || !data) {
      console.log(`⚠️ Cache miss for product code: ${productCode}`);
      return null;
    }

    // TTL 확인 (expires_at이 현재 시간보다 이후인지)
    const now = new Date();
    const expiresAt = new Date(data.expires_at);

    if (expiresAt < now) {
      console.log(`⏰ Cache expired for product code: ${productCode}`);
      // 만료된 캐시 삭제
      await supabase.from('danawa_cache').delete().eq('product_code', productCode);
      return null;
    }

    console.log(`✅ Cache hit for product code: ${productCode}`);

    // DanawaCacheEntry → DanawaProductData 변환
    const productData: DanawaProductData = {
      productCode: data.product_code,
      url: `https://prod.danawa.com/info/?pcode=${data.product_code}`,
      name: data.product_name,
      image: data.image,
      manufacturer: data.manufacturer,
      registrationDate: data.registration_date,
      category: data.category,
      lowestPrice: data.lowest_price,
      lowestMall: data.lowest_mall,
      specs: data.specs || {},
      prices: data.prices || [],
    };

    return productData;
  } catch (error) {
    console.error('Error in getCachedDanawaData:', error);
    return null;
  }
}

/**
 * 다나와 데이터를 캐시에 저장
 * @param data 다나와 상품 데이터
 * @returns 저장 성공 여부
 */
export async function saveDanawaDataToCache(data: DanawaProductData): Promise<boolean> {
  try {
    // 현재 시간 + 24시간
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const cacheEntry: Omit<DanawaCacheEntry, 'created_at' | 'expires_at'> & {
      created_at?: string;
      expires_at?: string;
    } = {
      product_code: data.productCode,
      product_name: data.name,
      lowest_price: data.lowestPrice,
      lowest_mall: data.lowestMall,
      specs: data.specs,
      prices: data.prices,
      image: data.image,
      manufacturer: data.manufacturer,
      registration_date: data.registrationDate,
      category: data.category,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    // Upsert (있으면 업데이트, 없으면 생성)
    const { error } = await supabase.from('danawa_cache').upsert(cacheEntry, {
      onConflict: 'product_code',
    });

    if (error) {
      console.error('Error saving to cache:', error);
      return false;
    }

    console.log(`💾 Saved to cache: ${data.productCode} (${data.name})`);
    return true;
  } catch (error) {
    console.error('Error in saveDanawaDataToCache:', error);
    return false;
  }
}

/**
 * 만료된 캐시 정리 (크론 작업 또는 주기적 실행용)
 * @returns 삭제된 캐시 개수
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase.from('danawa_cache').delete().lt('expires_at', now).select('product_code');

    if (error) {
      console.error('Error cleaning up expired cache:', error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`🧹 Cleaned up ${count} expired cache entries`);
    return count;
  } catch (error) {
    console.error('Error in cleanupExpiredCache:', error);
    return 0;
  }
}

/**
 * 특정 상품 코드의 캐시 강제 삭제
 * @param productCode 다나와 상품 코드
 * @returns 삭제 성공 여부
 */
export async function invalidateCache(productCode: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('danawa_cache').delete().eq('product_code', productCode);

    if (error) {
      console.error('Error invalidating cache:', error);
      return false;
    }

    console.log(`🗑️ Invalidated cache for product code: ${productCode}`);
    return true;
  } catch (error) {
    console.error('Error in invalidateCache:', error);
    return false;
  }
}
