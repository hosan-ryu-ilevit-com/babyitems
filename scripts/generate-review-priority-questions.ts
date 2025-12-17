#!/usr/bin/env npx tsx
/**
 * 체감속성 분석 결과 → review_priorities 질문 자동 생성
 * 
 * 사용법:
 *   npx tsx scripts/generate-review-priority-questions.ts
 * 
 * 결과:
 *   - data/rules/manual_hard_questions.json 파일을 업데이트
 *   - 각 카테고리에 review_priorities 타입 질문 추가
 */

import * as fs from 'fs';
import * as path from 'path';

// 카테고리별 질문 텍스트
const CATEGORY_QUESTION_TEXT: Record<string, { question: string; tip: string }> = {
  stroller: {
    question: '유모차 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  car_seat: {
    question: '카시트 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  baby_bottle: {
    question: '젖병 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  milk_powder_port: {
    question: '분유포트 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  nasal_aspirator: {
    question: '코흡입기 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  thermometer: {
    question: '체온계 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  diaper: {
    question: '기저귀 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  high_chair: {
    question: '하이체어 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  baby_bed: {
    question: '아기침대 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  baby_wipes: {
    question: '물티슈 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  pacifier: {
    question: '공갈젖꼭지 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  baby_desk: {
    question: '아기책상 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
  baby_sofa: {
    question: '아기소파 선택 시 가장 중요한 점은?',
    tip: '실제 구매자 리뷰를 분석해서 뽑은 핵심 포인트예요',
  },
};

// 체감속성 이름 → 간결한 레이블로 변환
function simplifyLabel(name: string): string {
  // 괄호 안 내용 제거하고 간결하게
  const simplified = name
    .replace(/\s*\([^)]*\)/g, '')  // 괄호 제거
    .replace(/실제\s*/g, '')        // "실제" 제거
    .replace(/및\s*/g, ', ')        // "및" → ","
    .trim();
  
  return simplified;
}

// 분석 결과에서 review_priorities 질문 옵션 생성
interface HiddenCriteria {
  id: string;
  name: string;
  keywords: string[];
  importance: string;
  mentionCount: number;
  sentiment?: string;
  representativeReview?: string;
}

interface CategoryAnalysis {
  categoryKey: string;
  totalReviews: number;
  hiddenCriteria: HiddenCriteria[];
}

function generateReviewPriorityOptions(analysis: CategoryAnalysis): Array<{
  label: string;
  displayLabel: string;
  value: string;
  mentionCount: number;
  sentiment: string;
  sampleReview: string;
  filter: Record<string, unknown>;
  reviewKeywords: string[];
}> {
  // importance 기준 정렬 (high > medium > low)
  const importanceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  
  const sortedCriteria = [...analysis.hiddenCriteria]
    .sort((a, b) => {
      const orderA = importanceOrder[a.importance] ?? 3;
      const orderB = importanceOrder[b.importance] ?? 3;
      if (orderA !== orderB) return orderA - orderB;
      return b.mentionCount - a.mentionCount;
    })
    .slice(0, 6);  // 최대 6개

  return sortedCriteria.map(criteria => ({
    label: simplifyLabel(criteria.name),
    displayLabel: simplifyLabel(criteria.name),
    value: criteria.id,
    mentionCount: criteria.mentionCount,
    sentiment: criteria.sentiment || 'neutral',
    sampleReview: criteria.representativeReview || '',
    filter: {},
    reviewKeywords: criteria.keywords.slice(0, 5),
  }));
}

async function main() {
  const analysisDir = path.join(process.cwd(), 'data', 'experience-index');
  const manualQuestionsPath = path.join(process.cwd(), 'data', 'rules', 'manual_hard_questions.json');

  // 기존 manual_hard_questions.json 로드
  const existingQuestions = JSON.parse(fs.readFileSync(manualQuestionsPath, 'utf-8'));

  // 분석 파일 목록
  const analysisFiles = fs.readdirSync(analysisDir)
    .filter(f => f.endsWith('_analysis.json') && !f.includes('products'));

  console.log('🚀 체감속성 분석 결과 → review_priorities 질문 생성\n');

  for (const file of analysisFiles) {
    const categoryKey = file.replace('_analysis.json', '');
    
    // formula_maker와 baby_formula_dispenser는 이미 있으므로 스킵
    if (categoryKey === 'baby_formula_dispenser' || categoryKey === 'formula_maker') {
      console.log(`⏭️  ${categoryKey}: 이미 review_priorities 존재, 스킵`);
      continue;
    }

    const questionText = CATEGORY_QUESTION_TEXT[categoryKey];
    if (!questionText) {
      console.log(`⚠️  ${categoryKey}: 질문 텍스트 미정의, 스킵`);
      continue;
    }

    // 분석 결과 로드
    const analysisPath = path.join(analysisDir, file);
    const analysis: CategoryAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));

    if (!analysis.hiddenCriteria || analysis.hiddenCriteria.length === 0) {
      console.log(`⚠️  ${categoryKey}: 체감속성 없음, 스킵`);
      continue;
    }

    // review_priorities 질문 생성
    const totalMentions = analysis.hiddenCriteria.reduce((sum, c) => sum + c.mentionCount, 0);
    const reviewPriorityQuestion = {
      id: `${categoryKey}_review_priorities`,
      type: 'review_priorities',
      question: questionText.question,
      tip: `실제 구매자 ${analysis.totalReviews || 50}건의 리뷰를 분석해서 뽑은 핵심 포인트예요`,
      source: 'review_analysis',
      options: generateReviewPriorityOptions(analysis),
    };

    // 기존 카테고리 질문에 review_priorities 추가 (맨 앞에)
    if (!existingQuestions[categoryKey]) {
      existingQuestions[categoryKey] = { questions: [] };
    }

    // 이미 review_priorities가 있는지 확인
    const existingReviewPriorities = existingQuestions[categoryKey].questions.findIndex(
      (q: { type: string }) => q.type === 'review_priorities'
    );

    if (existingReviewPriorities >= 0) {
      // 기존 것 업데이트
      existingQuestions[categoryKey].questions[existingReviewPriorities] = reviewPriorityQuestion;
      console.log(`🔄 ${categoryKey}: review_priorities 업데이트 (${reviewPriorityQuestion.options.length}개 옵션)`);
    } else {
      // 맨 앞에 추가
      existingQuestions[categoryKey].questions.unshift(reviewPriorityQuestion);
      console.log(`✅ ${categoryKey}: review_priorities 추가 (${reviewPriorityQuestion.options.length}개 옵션)`);
    }
  }

  // 결과 저장
  fs.writeFileSync(manualQuestionsPath, JSON.stringify(existingQuestions, null, 2), 'utf-8');
  console.log(`\n💾 저장 완료: ${manualQuestionsPath}`);
}

main().catch(console.error);
