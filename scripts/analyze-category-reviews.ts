/**
 * 카테고리 리뷰 분석 스크립트
 * 목적: 리뷰에서 "숨겨진 구매 기준" 추출
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as readline from 'readline';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 환경변수가 필요합니다');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface Review {
  text: string;
  custom_metadata: {
    productId: string;
    category: string;
    rating: number;
  };
}

// JSONL 파일에서 리뷰 로드
async function loadReviews(category: string): Promise<Review[]> {
  const filePath = `./data/reviews/${category}.jsonl`;
  const reviews: Review[] = [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      reviews.push(JSON.parse(line));
    }
  }

  return reviews;
}

// 감정별 샘플링 (고평점/저평점 분리)
function sampleBalanced(reviews: Review[], highCount: number, lowCount: number) {
  const high = reviews
    .filter(r => r.custom_metadata.rating >= 4)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, highCount);

  const low = reviews
    .filter(r => r.custom_metadata.rating <= 2)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, lowCount);

  return { high, low };
}

// LLM 분석
async function analyzeWithLLM(reviews: Review[], categoryName: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const reviewsText = reviews.map((r, i) =>
    `[리뷰 ${i + 1}] (별점: ${r.custom_metadata.rating}점)\n${r.text.slice(0, 800)}`
  ).join('\n\n---\n\n');

  const prompt = `당신은 육아용품 구매 전문가입니다.

## 분석 대상
카테고리: ${categoryName}
리뷰 수: ${reviews.length}개

## 리뷰 데이터
${reviewsText}

## 분석 요청
위 리뷰들을 분석하여 **제조사 스펙에서는 알 수 없지만, 실제 구매 시 중요한 "숨겨진 구매 기준"**을 추출해주세요.

## 출력 형식 (JSON)
\`\`\`json
{
  "categoryKey": "${categoryName}",
  "hiddenCriteria": [
    {
      "id": "durability_glass",
      "name": "유리 포트 내구성",
      "description": "유리 포트가 충격에 얼마나 잘 견디는지",
      "importance": "high",
      "mentionCount": 5,
      "sentiment": "negative",
      "keywords": ["깨짐", "깨졌", "유리", "충격"],
      "sampleEvidence": ["세척 후 부딪혔는데 바로 깨졌어요", "한 달만에 깨졌어요"],
      "questionForUser": "유리 포트 내구성이 걱정되시나요?",
      "filterOptions": ["내구성 강한 제품만", "상관없음"]
    }
  ],
  "specVsRealityGaps": [
    {
      "specClaim": "쾌속쿨링",
      "realityFromReviews": "실제로는 1~2시간 소요",
      "mentionCount": 3
    }
  ],
  "unexpectedUseCases": [
    {
      "useCase": "병원 입원 시 활용",
      "mentionCount": 2,
      "quote": "병원입원할때마다 이거 꼭 가지고 입원했어요"
    }
  ]
}
\`\`\`

## 주의사항
- 스펙에서 이미 알 수 있는 것(가격, 용량, 브랜드 등)은 제외
- 실제 사용자만 알 수 있는 체감 정보에 집중
- importance는 리뷰에서 언급 빈도와 감정 강도 기반으로 판단
- 최소 5개 이상의 hiddenCriteria 추출`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // JSON 추출 (여러 패턴 시도)
  let jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
  if (!jsonMatch) {
    jsonMatch = response.match(/\{[\s\S]*"hiddenCriteria"[\s\S]*\}/);
  }

  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // JSON 수정 시도 (trailing comma 제거 등)
      const cleaned = jsonStr
        .replace(/,(\s*[}\]])/g, '$1')  // trailing comma 제거
        .replace(/\n/g, ' ')  // 줄바꿈 제거
        .replace(/\t/g, ' '); // 탭 제거
      try {
        return JSON.parse(cleaned);
      } catch {
        console.error('JSON 파싱 실패. 원본 응답 저장...');
        fs.writeFileSync('./data/experience-index/raw_response.txt', response, 'utf-8');
        throw new Error('JSON 파싱 실패');
      }
    }
  }

  console.error('JSON 매칭 실패. 원본 응답 저장...');
  fs.writeFileSync('./data/experience-index/raw_response.txt', response, 'utf-8');
  throw new Error('JSON 매칭 실패');
}

async function main() {
  const category = process.argv[2] || 'baby_formula_dispenser';
  console.log(`\n📊 카테고리 리뷰 분석: ${category}\n`);

  // 1. 리뷰 로드
  console.log('1️⃣ 리뷰 로드 중...');
  const allReviews = await loadReviews(category);
  console.log(`   총 ${allReviews.length}개 리뷰`);

  // 2. 샘플링
  console.log('\n2️⃣ 샘플링 중...');
  const { high, low } = sampleBalanced(allReviews, 30, 20);
  console.log(`   고평점(4-5별): ${high.length}개`);
  console.log(`   저평점(1-2별): ${low.length}개`);

  const sampledReviews = [...high, ...low];

  // 3. LLM 분석
  console.log('\n3️⃣ LLM 분석 중... (약 10-20초 소요)');
  const startTime = Date.now();
  const analysis = await analyzeWithLLM(sampledReviews, category);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   완료! (${elapsed}초)`);

  // 4. 결과 저장
  const outputPath = `./data/experience-index/${category}_analysis.json`;

  // 디렉토리 생성
  if (!fs.existsSync('./data/experience-index')) {
    fs.mkdirSync('./data/experience-index', { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf-8');
  console.log(`\n4️⃣ 결과 저장: ${outputPath}`);

  // 5. 결과 요약 출력
  console.log('\n' + '='.repeat(60));
  console.log('📋 분석 결과 요약');
  console.log('='.repeat(60));

  console.log(`\n🔍 숨겨진 구매 기준 (${analysis.hiddenCriteria?.length || 0}개):`);
  analysis.hiddenCriteria?.forEach((c: { name: string; importance: string; sentiment: string; questionForUser: string }, i: number) => {
    console.log(`   ${i + 1}. ${c.name} [${c.importance}] - ${c.sentiment}`);
    console.log(`      → "${c.questionForUser}"`);
  });

  if (analysis.specVsRealityGaps?.length) {
    console.log(`\n⚠️ 스펙 vs 실제 괴리 (${analysis.specVsRealityGaps.length}개):`);
    analysis.specVsRealityGaps.forEach((g: { specClaim: string; realityFromReviews: string }) => {
      console.log(`   - "${g.specClaim}" → 실제: ${g.realityFromReviews}`);
    });
  }

  if (analysis.unexpectedUseCases?.length) {
    console.log(`\n💡 예상 외 활용 사례 (${analysis.unexpectedUseCases.length}개):`);
    analysis.unexpectedUseCases.forEach((u: { useCase: string }) => {
      console.log(`   - ${u.useCase}`);
    });
  }
}

main().catch(console.error);
