import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  // 카시트 데이터 확인
  const { data: carSeatData } = await supabase
    .from('enuri_products')
    .select('model_no, title, spec, spec_raw, filter_attrs, category_path')
    .ilike('category_path', '%카시트%')
    .limit(1);

  if (carSeatData && carSeatData.length > 0) {
    const p = carSeatData[0];
    console.log('=== 카시트 샘플 ===');
    console.log('title:', p.title);
    console.log('category_path:', p.category_path);
    console.log('\nspec:', JSON.stringify(p.spec, null, 2));

    // spec_raw 확인
    const rawData = p.spec_raw;
    if (Array.isArray(rawData)) {
      console.log('\nspec_raw (배열, 처음 5개):', JSON.stringify(rawData.slice(0, 5), null, 2));
    } else if (typeof rawData === 'object' && rawData) {
      const entries = Object.entries(rawData).slice(0, 5);
      console.log('\nspec_raw (객체, 처음 5개):', JSON.stringify(entries, null, 2));
    }

    console.log('\nfilter_attrs:', JSON.stringify(p.filter_attrs, null, 2));
  } else {
    console.log('카시트 데이터 없음');
  }

  // 유모차 데이터 확인
  const { data: strollerData } = await supabase
    .from('enuri_products')
    .select('model_no, title, spec, spec_raw, filter_attrs, category_path')
    .ilike('category_path', '%유모차%')
    .limit(1);

  if (strollerData && strollerData.length > 0) {
    const p = strollerData[0];
    console.log('\n\n=== 유모차 샘플 ===');
    console.log('title:', p.title);
    console.log('category_path:', p.category_path);
    console.log('\nspec:', JSON.stringify(p.spec, null, 2));

    const rawData = p.spec_raw;
    if (Array.isArray(rawData)) {
      console.log('\nspec_raw (배열, 처음 5개):', JSON.stringify(rawData.slice(0, 5), null, 2));
    } else if (typeof rawData === 'object' && rawData) {
      const entries = Object.entries(rawData).slice(0, 5);
      console.log('\nspec_raw (객체, 처음 5개):', JSON.stringify(entries, null, 2));
    }

    console.log('\nfilter_attrs:', JSON.stringify(p.filter_attrs, null, 2));
  }

  // 기저귀 데이터 확인
  const { data: diaperData } = await supabase
    .from('enuri_products')
    .select('model_no, title, spec, spec_raw, filter_attrs, category_path')
    .ilike('category_path', '%기저귀%')
    .limit(1);

  if (diaperData && diaperData.length > 0) {
    const p = diaperData[0];
    console.log('\n\n=== 기저귀 샘플 ===');
    console.log('title:', p.title);
    console.log('category_path:', p.category_path);
    console.log('\nspec:', JSON.stringify(p.spec, null, 2));

    const rawData = p.spec_raw;
    if (Array.isArray(rawData)) {
      console.log('\nspec_raw (배열, 처음 5개):', JSON.stringify(rawData.slice(0, 5), null, 2));
    } else if (typeof rawData === 'object' && rawData) {
      const entries = Object.entries(rawData).slice(0, 5);
      console.log('\nspec_raw (객체, 처음 5개):', JSON.stringify(entries, null, 2));
    }

    console.log('\nfilter_attrs:', JSON.stringify(p.filter_attrs, null, 2));
  }
}

check();
