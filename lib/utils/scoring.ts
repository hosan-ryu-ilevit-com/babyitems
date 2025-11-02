import { EvaluationGrade, ProductEvaluation, UserPersona } from '@/types';

// 등급을 숫자 점수로 변환
export const gradeToScore: Record<EvaluationGrade, number> = {
  '매우 충족': 10,
  충족: 8,
  보통: 5,
  미흡: 3,
  '매우 미흡': 1,
};

// 평가 결과를 바탕으로 최종 점수 계산
export function calculateFinalScore(
  evaluation: ProductEvaluation,
  persona: UserPersona
): number {
  let finalScore = 0;

  evaluation.evaluations.forEach((ev) => {
    const gradeScore = gradeToScore[ev.grade];
    const weight = persona.coreValueWeights[ev.attribute];
    finalScore += gradeScore * weight;
  });

  return finalScore;
}

// ImportanceLevel을 가중치 숫자로 변환
export function importanceLevelToWeight(level: '중요하지 않음' | '보통' | '중요함'): number {
  const mapping: Record<string, number> = {
    '중요하지 않음': 5,
    보통: 7,
    중요함: 10,
  };
  return mapping[level] || 7;
}
