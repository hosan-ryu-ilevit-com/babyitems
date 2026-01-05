/**
 * Knowledge Agent V3 - 마크다운 파서
 *
 * 장기기억/단기기억 마크다운 파싱 및 생성
 */

import type {
  LongTermMemoryData,
  ShortTermMemoryData,
  ProductKnowledge,
  WebSearchInsight,
  CandidateProduct,
  FilterStep,
  BalanceSelection,
  Recommendation,
  Source,
  TrendData,
  BuyingGuide,
} from './types';
import { getCategoryName } from './types';

// ============================================================================
// 장기기억 파싱
// ============================================================================

/**
 * 장기기억 마크다운을 구조화된 데이터로 파싱
 */
export function parseLongTermMemory(markdown: string, categoryKey: string): LongTermMemoryData {
  const categoryName = getCategoryName(categoryKey);

  // 메타데이터 파싱
  const lastUpdatedMatch = markdown.match(/마지막 업데이트:\s*(\d{4}-\d{2}-\d{2})/);
  const productCountMatch = markdown.match(/분석 상품:\s*(\d+)개/);
  const reviewCountMatch = markdown.match(/분석 리뷰:\s*([\d,]+)개/);

  const lastUpdated = lastUpdatedMatch?.[1] || new Date().toISOString().slice(0, 10);
  const productCount = productCountMatch ? parseInt(productCountMatch[1]) : 0;
  const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, '')) : 0;

  // 트렌드 파싱
  const trends = parseTrendSection(markdown);

  // 상품 파싱
  const products = parseProductsSection(markdown);

  // 구매 가이드 파싱
  const buyingGuide = parseBuyingGuideSection(markdown);

  // 출처 파싱
  const sources = parseSourcesSection(markdown);

  return {
    categoryKey,
    categoryName,
    lastUpdated,
    productCount,
    reviewCount,
    trends,
    products,
    buyingGuide,
    sources,
  };
}

function parseTrendSection(markdown: string): TrendData {
  const items: string[] = [];
  const pros: string[] = [];
  const cons: string[] = [];
  let priceInsight = '';

  // 핵심 트렌드 파싱
  const trendMatch = markdown.match(/### 핵심 트렌드\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (trendMatch) {
    const lines = trendMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    items.push(...lines.map(l => l.replace(/^-\s*/, '').trim()));
  }

  // 만족 포인트 파싱
  const prosMatch = markdown.match(/### 구매자 만족 포인트\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (prosMatch) {
    const lines = prosMatch[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('✓'));
    pros.push(...lines.map(l => l.replace(/^[-✓]\s*/, '').trim()));
  }

  // 주의 단점 파싱
  const consMatch = markdown.match(/### 주의해야 할 단점\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (consMatch) {
    const lines = consMatch[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('⚠'));
    cons.push(...lines.map(l => l.replace(/^[-⚠]\s*/, '').trim()));
  }

  // 가격 인사이트 파싱
  const priceMatch = markdown.match(/### 가격대 인사이트\n([\s\S]*?)(?=\n---|\n##|$)/);
  if (priceMatch) {
    priceInsight = priceMatch[1].trim();
  }

  return { items, pros, cons, priceInsight };
}

function parseProductsSection(markdown: string): ProductKnowledge[] {
  const products: ProductKnowledge[] = [];

  // "## 🏆 추천 후보 상품" 섹션 찾기
  const productsSection = markdown.match(/## 🏆 추천 후보 상품[\s\S]*?(?=\n## |$)/);
  if (!productsSection) return products;

  // 각 상품 블록 파싱 (### 1. 상품명 형식)
  const productBlocks = productsSection[0].split(/### \d+\.\s+/).slice(1);

  productBlocks.forEach((block, index) => {
    const lines = block.split('\n');
    const name = lines[0]?.trim() || '';

    const brandMatch = block.match(/\*\*브랜드\*\*:\s*(.+)/);
    const priceMatch = block.match(/\*\*가격\*\*:\s*([\d,]+)/);
    const ratingMatch = block.match(/\*\*평점\*\*:\s*⭐([\d.]+)\s*\(([\d,]+)개/);
    const specsMatch = block.match(/\*\*핵심 스펙\*\*:\s*(.+)/);
    const prosMatch = block.match(/\*\*장점 요약\*\*:\s*(.+)/);
    const consMatch = block.match(/\*\*단점 요약\*\*:\s*(.+)/);
    const recommendedMatch = block.match(/\*\*추천 대상\*\*:\s*(.+)/);
    const pcodeMatch = block.match(/pcode[=:](\d+)/i);
    const urlMatch = block.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);

    const product: ProductKnowledge = {
      rank: index + 1,
      pcode: pcodeMatch?.[1] || '',
      name,
      brand: brandMatch?.[1]?.trim() || '',
      price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0,
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
      reviewCount: ratingMatch ? parseInt(ratingMatch[2].replace(/,/g, '')) : 0,
      specs: parseSpecString(specsMatch?.[1] || ''),
      specSummary: specsMatch?.[1]?.trim() || '',
      prosFromReviews: prosMatch?.[1]?.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [],
      consFromReviews: consMatch?.[1]?.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [],
      recommendedFor: recommendedMatch?.[1]?.trim() || '',
      productUrl: urlMatch?.[1] || `https://prod.danawa.com/info/?pcode=${pcodeMatch?.[1] || ''}`,
      thumbnail: null,
    };

    if (product.name) {
      products.push(product);
    }
  });

  return products;
}

function parseSpecString(specString: string): Record<string, string> {
  const specs: Record<string, string> = {};
  if (!specString) return specs;

  // "용량: 5L, 소비전력: 1400W" 또는 "용량: 5L | 소비전력: 1400W" 형식 파싱
  const parts = specString.split(/[,|]/).map(s => s.trim());
  for (const part of parts) {
    const [key, value] = part.split(':').map(s => s.trim());
    if (key && value) {
      specs[key] = value;
    }
  }

  return specs;
}

function parseBuyingGuideSection(markdown: string): BuyingGuide {
  const byUserType: Record<string, string> = {};
  const byBudget: Record<string, string> = {};
  const commonMistakes: string[] = [];

  // 사용자 유형별 추천 파싱
  const userTypeMatch = markdown.match(/### 사용자 유형별 추천\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (userTypeMatch) {
    const lines = userTypeMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    for (const line of lines) {
      const match = line.match(/\*\*(.+?)\*\*:\s*(.+)/);
      if (match) {
        byUserType[match[1].trim()] = match[2].trim();
      }
    }
  }

  // 예산별 가이드 파싱
  const budgetMatch = markdown.match(/### 예산별 가이드\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (budgetMatch) {
    const lines = budgetMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    for (const line of lines) {
      const match = line.match(/\*\*(.+?)\*\*:\s*(.+)/);
      if (match) {
        byBudget[match[1].trim()] = match[2].trim();
      }
    }
  }

  // 흔한 구매 실수 파싱
  const mistakesMatch = markdown.match(/### 흔한 구매 실수\n([\s\S]*?)(?=\n---|\n##|$)/);
  if (mistakesMatch) {
    const lines = mistakesMatch[1].split('\n').filter(l => /^\d+\.\s/.test(l.trim()));
    commonMistakes.push(...lines.map(l => l.replace(/^\d+\.\s*/, '').trim()));
  }

  return { byUserType, byBudget, commonMistakes };
}

function parseSourcesSection(markdown: string): Source[] {
  const sources: Source[] = [];

  const sourcesMatch = markdown.match(/## 📊 데이터 출처\n([\s\S]*?)$/);
  if (sourcesMatch) {
    const urlMatches = sourcesMatch[1].matchAll(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g);
    for (const match of urlMatches) {
      sources.push({ title: match[1], url: match[2] });
    }

    // 단순 URL도 파싱
    const simpleUrls = sourcesMatch[1].matchAll(/(?:다나와 검색|웹서치).*?(https?:\/\/[^\s]+)/g);
    for (const match of simpleUrls) {
      if (!sources.find(s => s.url === match[1])) {
        sources.push({ title: '다나와', url: match[1] });
      }
    }
  }

  return sources;
}

// ============================================================================
// 장기기억 생성
// ============================================================================

/**
 * 구조화된 데이터를 장기기억 마크다운으로 생성
 */
export function generateLongTermMarkdown(data: LongTermMemoryData): string {
  const lines: string[] = [];

  // 헤더
  lines.push(`# ${data.categoryName} 전문가 지식`);
  lines.push('');
  lines.push(`> 마지막 업데이트: ${data.lastUpdated}`);
  lines.push(`> 분석 상품: ${data.productCount}개 | 분석 리뷰: ${data.reviewCount.toLocaleString()}개`);
  lines.push('');

  // 트렌드 섹션
  const year = new Date().getFullYear();
  lines.push(`## 📈 ${year}년 시장 트렌드`);
  lines.push('');

  lines.push('### 핵심 트렌드');
  for (const item of data.trends.items) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('### 구매자 만족 포인트');
  for (const pro of data.trends.pros) {
    lines.push(`- ✓ ${pro}`);
  }
  lines.push('');

  lines.push('### 주의해야 할 단점');
  for (const con of data.trends.cons) {
    lines.push(`- ⚠ ${con}`);
  }
  lines.push('');

  lines.push('### 가격대 인사이트');
  lines.push(data.trends.priceInsight);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 상품 섹션
  lines.push(`## 🏆 추천 후보 상품 (Top ${data.products.length})`);
  lines.push('');

  for (const product of data.products) {
    lines.push(`### ${product.rank}. ${product.name}`);
    lines.push(`- **브랜드**: ${product.brand}`);
    lines.push(`- **가격**: ${product.price.toLocaleString()}원`);
    lines.push(`- **평점**: ⭐${product.rating} (${product.reviewCount.toLocaleString()}개 리뷰)`);
    lines.push(`- **핵심 스펙**: ${product.specSummary || Object.entries(product.specs).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    lines.push(`- **장점 요약**: ${product.prosFromReviews.join(', ') || '분석 중'}`);
    lines.push(`- **단점 요약**: ${product.consFromReviews.join(', ') || '분석 중'}`);
    lines.push(`- **추천 대상**: ${product.recommendedFor || '일반 사용자'}`);
    if (product.pcode) {
      lines.push(`- [상세보기](${product.productUrl})`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 구매 가이드 섹션
  lines.push('## 💡 구매 가이드');
  lines.push('');

  lines.push('### 사용자 유형별 추천');
  for (const [type, recommendation] of Object.entries(data.buyingGuide.byUserType)) {
    lines.push(`- **${type}**: ${recommendation}`);
  }
  lines.push('');

  lines.push('### 예산별 가이드');
  for (const [budget, guide] of Object.entries(data.buyingGuide.byBudget)) {
    lines.push(`- **${budget}**: ${guide}`);
  }
  lines.push('');

  lines.push('### 흔한 구매 실수');
  data.buyingGuide.commonMistakes.forEach((mistake, i) => {
    lines.push(`${i + 1}. ${mistake}`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');

  // 출처 섹션
  lines.push('## 📊 데이터 출처');
  for (const source of data.sources) {
    lines.push(`- [${source.title}](${source.url})`);
  }
  if (data.sources.length === 0) {
    lines.push('- 다나와 인기상품 검색 결과');
  }

  return lines.join('\n');
}

// ============================================================================
// 단기기억 파싱
// ============================================================================

/**
 * 단기기억 마크다운을 구조화된 데이터로 파싱
 */
export function parseShortTermMemory(markdown: string): ShortTermMemoryData {
  // 기본 메타데이터
  const sessionIdMatch = markdown.match(/# 세션:\s*(\S+)/);
  const startedAtMatch = markdown.match(/> 시작:\s*(.+)/);
  const categoryKeyMatch = markdown.match(/> 카테고리키:\s*(\S+)/);
  const categoryNameMatch = markdown.match(/> 카테고리:\s*(.+)/);

  const data: ShortTermMemoryData = {
    sessionId: sessionIdMatch?.[1] || '',
    startedAt: startedAtMatch?.[1]?.trim() || new Date().toISOString(),
    categoryKey: categoryKeyMatch?.[1]?.trim() || '',
    categoryName: categoryNameMatch?.[1]?.trim() || '',
    webSearchInsights: parseWebSearchInsights(markdown),
    collectedInfo: parseCollectedInfo(markdown),
    filteredCandidates: parseFilteredCandidates(markdown),
    filterHistory: parseFilterHistory(markdown),
    balanceQuestions: [],
    balanceSelections: parseBalanceSelections(markdown),
    negativeSelections: parseNegativeSelections(markdown),
    finalRecommendations: parseFinalRecommendations(markdown),
    totalProducts: 0,
    currentCandidateCount: 0,
  };

  // 후보 수 파싱
  const candidateMatch = markdown.match(/현재 후보:\s*(\d+)개\s*\(전체\s*(\d+)개/);
  if (candidateMatch) {
    data.currentCandidateCount = parseInt(candidateMatch[1]);
    data.totalProducts = parseInt(candidateMatch[2]);
  }

  return data;
}

function parseWebSearchInsights(markdown: string): WebSearchInsight[] {
  const insights: WebSearchInsight[] = [];

  // Init 단계 인사이트
  const initMatch = markdown.match(/### Init 단계\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (initMatch) {
    const queryMatch = initMatch[1].match(/쿼리:\s*(.+)/);
    const insightMatch = initMatch[1].match(/인사이트:\s*(.+)/);
    const sourceMatch = initMatch[1].match(/출처:\s*(.+)/);

    if (insightMatch) {
      insights.push({
        phase: 'init',
        query: queryMatch?.[1]?.trim() || '',
        insight: insightMatch[1].trim(),
        sources: sourceMatch ? [{ title: '웹서치', url: sourceMatch[1].trim() }] : [],
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 질문별 인사이트 파싱
  const questionMatches = markdown.matchAll(/### Q(\d+):\s*(.+?)\n([\s\S]*?)(?=\n###|\n---|\n##|$)/g);
  for (const match of questionMatches) {
    const questionId = `q${match[1]}`;
    const question = match[2].trim();
    const content = match[3];

    const answerMatch = content.match(/사용자 답변:\s*(.+)/);
    const queryMatch = content.match(/웹서치 쿼리:\s*(.+)/);
    const insightMatch = content.match(/인사이트:\s*(.+)/);

    if (insightMatch) {
      insights.push({
        phase: 'question',
        questionId,
        question,
        userAnswer: answerMatch?.[1]?.trim(),
        query: queryMatch?.[1]?.trim() || '',
        insight: insightMatch[1].trim(),
        sources: [],
        timestamp: new Date().toISOString(),
      });
    }
  }

  return insights;
}

function parseCollectedInfo(markdown: string): Record<string, string> {
  const info: Record<string, string> = {};

  const tableMatch = markdown.match(/## 👤 수집된 사용자 정보\n[\s\S]*?\|[\s\S]*?\|([\s\S]*?)(?=\n---|\n##|$)/);
  if (tableMatch) {
    const rows = tableMatch[1].split('\n').filter(l => l.includes('|') && !l.includes('---'));
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        info[cells[0]] = cells[1];
      }
    }
  }

  return info;
}

function parseFilteredCandidates(markdown: string): CandidateProduct[] {
  const candidates: CandidateProduct[] = [];

  const candidatesMatch = markdown.match(/### 후보 상품\n([\s\S]*?)(?=\n---|\n##|$)/);
  if (candidatesMatch) {
    const lines = candidatesMatch[1].split('\n').filter(l => /^\d+\.\s/.test(l.trim()));
    for (const line of lines) {
      // "1. 상품명 - 100,000원 - ⭐4.5" 형식
      const match = line.match(/^\d+\.\s+(.+?)\s+-\s+([\d,]+)원\s+-\s+⭐([\d.]+)/);
      if (match) {
        candidates.push({
          pcode: '',
          name: match[1].trim(),
          brand: '',
          price: parseInt(match[2].replace(/,/g, '')),
          rating: parseFloat(match[3]),
          reviewCount: 0,
          specs: {},
        });
      }
    }
  }

  return candidates;
}

function parseFilterHistory(markdown: string): FilterStep[] {
  const history: FilterStep[] = [];

  const historyMatch = markdown.match(/### 필터 적용 내역\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (historyMatch) {
    const lines = historyMatch[1].split('\n').filter(l => /^\d+\.\s/.test(l.trim()));
    lines.forEach((line, i) => {
      const match = line.match(/^\d+\.\s+(.+?)\s+→\s+(\d+)개/);
      if (match) {
        history.push({
          step: i + 1,
          condition: match[1].trim(),
          remainingCount: parseInt(match[2]),
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  return history;
}

function parseBalanceSelections(markdown: string): BalanceSelection[] {
  const selections: BalanceSelection[] = [];

  const tableMatch = markdown.match(/## ⚖️ 밸런스 게임 선택\n[\s\S]*?\|[\s\S]*?\|([\s\S]*?)(?=\n---|\n##|$)/);
  if (tableMatch) {
    const rows = tableMatch[1].split('\n').filter(l => l.includes('|') && !l.includes('---'));
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        selections.push({
          questionId: cells[0],
          selected: cells[1] as 'A' | 'B',
          selectedLabel: cells[1],
        });
      }
    }
  }

  return selections;
}

function parseNegativeSelections(markdown: string): string[] {
  const selections: string[] = [];

  const negativeMatch = markdown.match(/## 🚫 피하고 싶은 단점\n([\s\S]*?)(?=\n---|\n##|$)/);
  if (negativeMatch) {
    const lines = negativeMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
    selections.push(...lines.map(l => l.replace(/^-\s*/, '').trim()));
  }

  return selections;
}

function parseFinalRecommendations(markdown: string): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const recMatch = markdown.match(/## 🏆 최종 추천\n([\s\S]*?)$/);
  if (recMatch) {
    const lines = recMatch[1].split('\n').filter(l => /^\d+\.\s/.test(l.trim()));
    lines.forEach((line, i) => {
      const match = line.match(/^\d+\.\s+(.+?)\s+-\s+(.+)/);
      if (match) {
        recommendations.push({
          rank: i + 1,
          pcode: '',
          name: match[1].trim(),
          brand: '',
          price: 0,
          score: 0,
          reason: match[2].trim(),
        });
      }
    });
  }

  return recommendations;
}

// ============================================================================
// 단기기억 생성
// ============================================================================

/**
 * 구조화된 데이터를 단기기억 마크다운으로 생성
 */
export function generateShortTermMarkdown(data: ShortTermMemoryData): string {
  const lines: string[] = [];

  // 헤더
  lines.push(`# 세션: ${data.sessionId}`);
  lines.push(`> 시작: ${data.startedAt}`);
  lines.push(`> 카테고리키: ${data.categoryKey}`);
  lines.push(`> 카테고리: ${data.categoryName}`);
  lines.push('');

  // 웹서치 인사이트
  lines.push('## 🔍 웹서치 인사이트');
  lines.push('');

  const initInsights = data.webSearchInsights.filter(w => w.phase === 'init');
  if (initInsights.length > 0) {
    lines.push('### Init 단계');
    for (const insight of initInsights) {
      lines.push(`- 쿼리: ${insight.query}`);
      lines.push(`- 인사이트: ${insight.insight}`);
      if (insight.sources.length > 0) {
        lines.push(`- 출처: ${insight.sources.map(s => s.url).join(', ')}`);
      }
    }
    lines.push('');
  }

  const questionInsights = data.webSearchInsights.filter(w => w.phase === 'question');
  questionInsights.forEach((insight, i) => {
    lines.push(`### Q${i + 1}: ${insight.question || ''}`);
    lines.push(`- 사용자 답변: ${insight.userAnswer || ''}`);
    lines.push(`- 웹서치 쿼리: ${insight.query}`);
    lines.push(`- 인사이트: ${insight.insight}`);
    lines.push('');
  });

  lines.push('---');
  lines.push('');

  // 수집된 사용자 정보
  lines.push('## 👤 수집된 사용자 정보');
  lines.push('');
  lines.push('| 항목 | 답변 |');
  lines.push('|------|------|');
  for (const [key, value] of Object.entries(data.collectedInfo)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 필터링된 후보군
  lines.push('## 🎯 필터링된 후보군');
  lines.push('');
  lines.push(`현재 후보: ${data.currentCandidateCount}개 (전체 ${data.totalProducts}개 중)`);
  lines.push('');

  if (data.filterHistory.length > 0) {
    lines.push('### 필터 적용 내역');
    for (const step of data.filterHistory) {
      lines.push(`${step.step}. ${step.condition} → ${step.remainingCount}개 남음`);
    }
    lines.push('');
  }

  if (data.filteredCandidates.length > 0) {
    lines.push('### 후보 상품');
    data.filteredCandidates.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name} - ${c.price.toLocaleString()}원 - ⭐${c.rating}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 밸런스 게임 선택
  lines.push('## ⚖️ 밸런스 게임 선택');
  lines.push('');
  if (data.balanceSelections.length > 0) {
    lines.push('| 질문 | 선택 |');
    lines.push('|------|------|');
    for (const selection of data.balanceSelections) {
      lines.push(`| ${selection.questionId} | ${selection.selectedLabel} |`);
    }
  } else {
    lines.push('(아직 선택 없음)');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 피하고 싶은 단점
  lines.push('## 🚫 피하고 싶은 단점');
  lines.push('');
  if (data.negativeSelections.length > 0) {
    for (const neg of data.negativeSelections) {
      lines.push(`- ${neg}`);
    }
  } else {
    lines.push('(아직 선택 없음)');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 최종 추천
  lines.push('## 🏆 최종 추천');
  lines.push('');
  if (data.finalRecommendations.length > 0) {
    for (const rec of data.finalRecommendations) {
      lines.push(`${rec.rank}. ${rec.name} - ${rec.reason}`);
    }
  } else {
    lines.push('(아직 추천 없음)');
  }

  return lines.join('\n');
}

// ============================================================================
// 유틸리티
// ============================================================================

/**
 * 마크다운의 특정 섹션 업데이트
 */
export function updateMarkdownSection(
  markdown: string,
  sectionHeader: string,
  newContent: string
): string {
  const sectionRegex = new RegExp(
    `(${escapeRegex(sectionHeader)}\\n)([\\s\\S]*?)(?=\\n## |\\n---\\n|$)`,
    'g'
  );

  if (markdown.match(sectionRegex)) {
    return markdown.replace(sectionRegex, `$1${newContent}\n`);
  }

  // 섹션이 없으면 끝에 추가
  return `${markdown}\n\n${sectionHeader}\n${newContent}`;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
