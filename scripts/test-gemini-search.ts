/**
 * Gemini Google Search Grounding 테스트 스크립트
 *
 * 목표:
 * 1. Gemini 2.0 + Google Search grounding 기능 테스트
 * 2. 카테고리별 구매 가이드, 트렌드 정보 수집
 *
 * 실행: npx tsx scripts/test-gemini-search.ts
 */

import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// .env.local 파일 로드
config({ path: '.env.local' });

// API 키 확인
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
  console.error('   .env.local 파일에 GEMINI_API_KEY를 설정해주세요.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Google Search Grounding을 사용한 웹 검색 + AI 정리
 */
async function searchWithGrounding(query: string): Promise<{
  answer: string;
  searchQueries?: string[];
  sources?: string[];
}> {
  console.log(`\n🔍 검색 중: "${query}"`);
  console.log('-'.repeat(60));

  try {
    // Gemini 2.0 Flash with Google Search grounding
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      // @ts-expect-error - tools 타입 정의가 아직 없음
      tools: [{ googleSearch: {} }],
    });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: query }],
        },
      ],
    });

    const response = result.response;
    const text = response.text();

    // grounding metadata 추출 (있는 경우)
    // @ts-expect-error - candidates 타입
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const searchQueries = groundingMetadata?.webSearchQueries || [];
    const sources: string[] = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          sources.push(chunk.web.uri);
        }
      }
    }

    return {
      answer: text,
      searchQueries,
      sources: [...new Set(sources)], // 중복 제거
    };
  } catch (error) {
    console.error('❌ 검색 오류:', error);
    throw error;
  }
}

/**
 * 카테고리별 도메인 지식 수집
 */
async function gatherCategoryKnowledge(categoryKeyword: string): Promise<{
  overview: string;
  buyingGuide: string;
  trends: string;
  sources: string[];
}> {
  console.log('='.repeat(60));
  console.log(`📚 "${categoryKeyword}" 도메인 지식 수집`);
  console.log('='.repeat(60));

  const queries = [
    `${categoryKeyword} 구매 가이드 2025년 선택 기준 핵심 포인트`,
    `${categoryKeyword} 최신 트렌드 2025년 인기 기능 브랜드`,
  ];

  const results = [];
  const allSources: string[] = [];

  for (const query of queries) {
    const result = await searchWithGrounding(query);
    results.push(result);
    allSources.push(...(result.sources || []));

    console.log(`\n✅ 답변 (${result.answer.length}자):`);
    console.log(result.answer.substring(0, 500) + '...');

    if (result.searchQueries?.length) {
      console.log(`\n📎 사용된 검색 쿼리: ${result.searchQueries.join(', ')}`);
    }

    if (result.sources?.length) {
      console.log(`\n🔗 출처 (${result.sources.length}개):`);
      result.sources.slice(0, 5).forEach((url, i) => {
        console.log(`   [${i + 1}] ${url.substring(0, 80)}...`);
      });
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return {
    overview: results[0]?.answer || '',
    buyingGuide: results[0]?.answer || '',
    trends: results[1]?.answer || '',
    sources: [...new Set(allSources)],
  };
}

/**
 * 트레이드오프 분석 (A vs B 형태)
 */
async function analyzeTradeoffs(
  categoryKeyword: string
): Promise<{ question: string; answer: string }[]> {
  console.log('\n' + '='.repeat(60));
  console.log(`⚖️ "${categoryKeyword}" 트레이드오프 분석`);
  console.log('='.repeat(60));

  // 일반적인 트레이드오프 질문들
  const tradeoffQueries = [
    `${categoryKeyword} 바스켓형 vs 오븐형 장단점 비교`,
    `${categoryKeyword} 대용량 vs 소형 어떤게 좋은지 장단점`,
    `${categoryKeyword} 가성비 vs 프리미엄 브랜드 선택 기준`,
  ];

  const results = [];

  for (const query of tradeoffQueries) {
    const result = await searchWithGrounding(query);
    results.push({
      question: query,
      answer: result.answer,
    });

    console.log(`\n📌 ${query}`);
    console.log(`   → ${result.answer.substring(0, 200)}...`);

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

// 테스트 실행
async function main() {
  console.log('='.repeat(60));
  console.log('Gemini Google Search Grounding 테스트');
  console.log('='.repeat(60));

  // 1. 기본 검색 테스트
  console.log('\n\n[테스트 1] 기본 검색 기능');
  const basicResult = await searchWithGrounding(
    '에어프라이어 구매할 때 가장 중요하게 봐야 할 스펙 3가지는?'
  );
  console.log('\n📝 전체 답변:');
  console.log(basicResult.answer);

  if (basicResult.sources?.length) {
    console.log('\n🔗 참고 출처:');
    basicResult.sources.forEach((url, i) => {
      console.log(`   [${i + 1}] ${url}`);
    });
  }

  // 2. 도메인 지식 수집 테스트
  console.log('\n\n[테스트 2] 도메인 지식 수집');
  const knowledge = await gatherCategoryKnowledge('에어프라이어');
  console.log(`\n📊 수집된 지식 요약:`);
  console.log(`   - 개요: ${knowledge.overview.substring(0, 100)}...`);
  console.log(`   - 트렌드: ${knowledge.trends.substring(0, 100)}...`);
  console.log(`   - 출처 수: ${knowledge.sources.length}개`);

  // 3. 트레이드오프 분석 테스트
  console.log('\n\n[테스트 3] 트레이드오프 분석');
  const tradeoffs = await analyzeTradeoffs('에어프라이어');
  console.log(`\n📊 트레이드오프 분석 결과: ${tradeoffs.length}개`);

  console.log('\n' + '='.repeat(60));
  console.log('테스트 완료');
  console.log('='.repeat(60));
}

main().catch(console.error);
