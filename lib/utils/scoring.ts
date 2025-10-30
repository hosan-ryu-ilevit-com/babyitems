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
export function importanceLevelToWeight(level: '보통' | '중요' | '매우 중요'): number {
  const mapping: Record<string, number> = {
    보통: 5,
    중요: 7,
    '매우 중요': 10,
  };
  return mapping[level] || 5;
}
