import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface SearchResult {
  type: string;
  text: string;
  queries: string[];
  sources: Array<{ title: string; uri: string }>;
  supports: Array<{ text: string; startIndex: number; endIndex: number; chunkIndices: number[] }>;
}

async function searchWithGrounding(prompt: string, label: string): Promise<SearchResult> {
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const elapsed = Date.now() - startTime;
  console.log(`  ✓ ${label} 완료 (${elapsed}ms)`);

  const metadata = response.candidates?.[0]?.groundingMetadata;

  // groundingSupports로 인용 정보 추출
  const supports = metadata?.groundingSupports || [];
  const chunks = metadata?.groundingChunks || [];

  // 텍스트에 출처 링크 추가
  let textWithCitations = response.text || "";

  // 출처 인덱스별 URL 맵
  const sourceMap = new Map<number, { title: string; uri: string }>();
  chunks.forEach((c: any, i: number) => {
    if (c.web) {
      sourceMap.set(i, { title: c.web.title || "", uri: c.web.uri || "" });
    }
  });

  return {
    type: label,
    text: textWithCitations,
    queries: metadata?.webSearchQueries || [],
    sources: chunks.map((c: any) => ({
      title: c.web?.title || "",
      uri: c.web?.uri || ""
    })),
    supports: supports.map((s: any) => ({
      text: s.segment?.text || "",
      startIndex: s.segment?.startIndex || 0,
      endIndex: s.segment?.endIndex || 0,
      chunkIndices: s.groundingChunkIndices || []
    }))
  };
}

async function searchProductReviews() {
  const productName = "수오미 순둥이 베이직 무향 플러스 물티슈 캡형 100매 + 휴대 캡형 20매";

  console.log("🔍 Gemini Grounding - 단일 검색 (최적화)");
  console.log("📦 검색 상품:", productName);
  console.log("🤖 모델: gemini-2.5-flash-lite");
  console.log("-----------------------------------\n");

  const startTime = Date.now();

  // 단일 프롬프트로 모든 정보 요청 (grounding 활성화를 위해 구체적으로)
  const result = await searchWithGrounding(
    `"${productName}" 제품의 실제 사용자 후기를 네이버 블로그, 쿠팡, 다나와 등에서 검색하여 정리해주세요.

## 판매 현황
- 쿠팡, 네이버쇼핑, 다나와 등에서의 판매 랭킹이나 인기 순위 (있는 경우)
- 누적 리뷰 수, 평점 (찾을 수 있는 경우)

## 장점
각 장점을 2-3문장으로 설명해주세요. (4-5개)

## 단점
각 단점을 2-3문장으로 설명해주세요. 특히 별점이 낮은 후기에서 언급된 불만사항 위주로. (4-5개)

## 추천 대상
이 제품이 적합한 사용자 (1-2문장)

## 비추천 대상
이 제품이 부적합한 사용자 (1-2문장)

광고성 글 제외, 실제 사용 후기만 참고해주세요.`,
    "통합 검색"
  );

  const totalTime = Date.now() - startTime;
  console.log(`\n⏱️ 검색 완료: ${totalTime}ms (${(totalTime/1000).toFixed(1)}초)\n`);
  console.log("===================================\n");

  // 문장 끝에만 인용 번호 추가
  let textWithCitations = result.text;

  if (result.supports.length > 0 && result.sources.length > 0) {
    // 문장 끝 위치 찾기 (마침표, 느낌표, 물음표 + 공백 또는 줄바꿈)
    const sentenceEndRegex = /[.!?다요음됩니까]+(?=\s|\n|$)/g;
    const sentenceEnds: number[] = [];
    let match;
    while ((match = sentenceEndRegex.exec(textWithCitations)) !== null) {
      sentenceEnds.push(match.index + match[0].length);
    }

    // 각 support의 endIndex를 가장 가까운 문장 끝으로 매핑
    const citationsBySentenceEnd = new Map<number, Set<number>>();

    for (const support of result.supports) {
      if (support.endIndex > 0 && support.chunkIndices.length > 0) {
        // 가장 가까운 문장 끝 찾기 (endIndex 이후)
        let nearestEnd = sentenceEnds.find(end => end >= support.endIndex);
        if (!nearestEnd) {
          // 문장 끝이 없으면 가장 마지막 문장 끝 사용
          nearestEnd = sentenceEnds[sentenceEnds.length - 1] || support.endIndex;
        }

        if (!citationsBySentenceEnd.has(nearestEnd)) {
          citationsBySentenceEnd.set(nearestEnd, new Set());
        }
        support.chunkIndices.forEach(i => citationsBySentenceEnd.get(nearestEnd!)!.add(i));
      }
    }

    // 문장 끝 위치 역순 정렬 후 인용 삽입
    const sortedEnds = [...citationsBySentenceEnd.keys()].sort((a, b) => b - a);

    for (const endPos of sortedEnds) {
      const indices = citationsBySentenceEnd.get(endPos)!;
      const citationNumbers = [...indices]
        .filter(i => i < result.sources.length)
        .sort((a, b) => a - b)
        .map(i => `[${i + 1}]`)
        .join("");

      if (citationNumbers) {
        textWithCitations =
          textWithCitations.slice(0, endPos) +
          " " + citationNumbers +
          textWithCitations.slice(endPos);
      }
    }
  }

  console.log(textWithCitations);

  // 출처 목록
  if (result.sources.length > 0) {
    console.log("\n─────────────────────────────────────");
    console.log("📚 출처:");
    result.sources.forEach((s, i) => {
      console.log(`  [${i + 1}] ${s.title}: ${s.uri}`);
    });
  }

  console.log("\n===================================");
  console.log("📈 검색 통계:");
  console.log(`  - 검색 쿼리: ${result.queries.length}개`);
  console.log(`  - 출처: ${result.sources.length}개`);
  console.log(`  - 인용: ${result.supports.length}개`);
  console.log(`  - 총 소요 시간: ${totalTime}ms`);
}

searchProductReviews().catch(console.error);
