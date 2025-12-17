/**
 * 에누리 가격/리뷰 추출 테스트
 */

import * as cheerio from 'cheerio';

async function test() {
  console.log('=== 에누리 가격/리뷰 추출 테스트 ===\n');
  console.log('모델번호: 125892666 (조이 아이스핀 360)\n');

  const response = await fetch('https://www.enuri.com/detail.jsp?modelno=125892666', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  // 가격 추출
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 가격 추출 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const prices: any[] = [];

  // 디버깅: 테이블 존재 여부 확인
  const tableExists = $('table.tb-compare__list').length;
  console.log(`DEBUG: table.tb-compare__list 존재? ${tableExists}`);

  const tbodyRows = $('table.tb-compare__list tbody tr').length;
  console.log(`DEBUG: tbody tr 개수: ${tbodyRows}`);

  // 첫 번째 tr의 클래스 확인
  const firstTrClass = $('table.tb-compare__list tbody tr').first().attr('class');
  console.log(`DEBUG: 첫 번째 tr 클래스: ${firstTrClass}`);

  // 더 간단한 선택자 사용: tr.is-minline, tr.is-specialline
  $('tr.is-minline, tr.is-specialline').each((i, tr) => {
    const $tr = $(tr);
    // 쇼핑몰: .lowest__logo img의 alt
    const mallImg = $tr.find('.lowest__logo img').first();
    const mallName = mallImg.attr('alt')?.trim() || '';
    // 가격: .tx-price strong
    const priceStrong = $tr.find('.tx-price strong').first();
    const priceText = priceStrong.text().replace(/,/g, '').trim();
    const price = parseInt(priceText) || 0;

    // 배송비
    const deliCell = $tr.find('.col--delifee');
    const deliText = deliCell.text().trim();
    const isFree = deliText.includes('무료');

    if (price >= 10000 && mallName) {
      prices.push({ mallName, price, delivery: isFree ? '무료' : deliText });
    }
  });

  console.log(`DEBUG: tr.is-minline, tr.is-specialline 개수: ${$('tr.is-minline, tr.is-specialline').length}\n`);

  console.log(`추출된 가격: ${prices.length}개\n`);
  prices.slice(0, 8).forEach((p, i) => {
    console.log(`[${i+1}] ${p.mallName}: ${p.price.toLocaleString()}원 (배송: ${p.delivery})`);
  });

  // 리뷰 추출
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 리뷰 추출 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const seoScript = $('#SEOSCRIPT').html();
  if (seoScript) {
    try {
      const productData = JSON.parse(seoScript);
      console.log(`리뷰 수 (JSON-LD): ${productData.review?.length || 0}개`);
      console.log(`평균 평점: ${productData.aggregateRating?.ratingValue || 'N/A'}`);
      console.log(`총 리뷰 수 (표시): ${productData.aggregateRating?.reviewCount || 'N/A'}`);

      if (productData.review?.[0]) {
        console.log('\n샘플 리뷰:');
        console.log(`  평점: ${productData.review[0].reviewRating?.ratingValue}`);
        console.log(`  내용: ${productData.review[0].reviewBody?.slice(0, 100)}...`);
      }
    } catch (e) {
      console.log('JSON-LD 파싱 오류:', e);
    }
  } else {
    console.log('SEOSCRIPT를 찾을 수 없습니다.');
  }

  // 이미지 추출
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖼️  리뷰 이미지 추출 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const images: string[] = [];
  $('[class*="review"] img, [class*="Review"] img, .mall-review img').each((_, img) => {
    let src = $(img).attr('src') || $(img).attr('data-src');
    if (src && !src.includes('icon') && !src.includes('profile') && !src.includes('star') &&
        !src.includes('logo') && !src.includes('btn') && !src.includes('noImg') &&
        !src.includes('storage.enuri.info/logo')) {
      images.push(src);
    }
  });

  console.log(`추출된 이미지: ${images.length}개`);
  images.slice(0, 3).forEach((src, i) => {
    console.log(`[${i+1}] ${src.slice(0, 80)}...`);
  });

  console.log('\n✅ 테스트 완료!');
}

test().catch(console.error);
