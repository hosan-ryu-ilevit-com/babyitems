/**
 * Budget Adjustment Utilities
 *
 * Parse and adjust budget ranges based on user input
 */

import type { BudgetRange } from '@/types';

/**
 * Parse budget range string to min/max values
 */
export function parseBudgetRange(budget: BudgetRange): { min: number; max: number } {
  if (budget.endsWith('+')) {
    const min = parseInt(budget.replace('+', ''), 10);
    return { min, max: Infinity };
  }

  const [min, max] = budget.split('-').map(v => parseInt(v, 10));
  return { min, max };
}

/**
 * Format budget range for display
 */
export function formatBudgetRange(budget: BudgetRange): string {
  if (budget.endsWith('+')) {
    const min = parseInt(budget.replace('+', ''), 10);
    return `${(min / 10000).toFixed(0)}만원 이상`;
  }

  const [min, max] = budget.split('-').map(v => parseInt(v, 10));
  if (min === 0) {
    return `최대 ${(max / 10000).toFixed(0)}만원`;
  }
  return `${(min / 10000).toFixed(0)}-${(max / 10000).toFixed(0)}만원`;
}

/**
 * Parse user's natural language budget input
 *
 * Examples:
 * - "7만원 이하" → "0-70000"
 * - "10만원까지" → "0-100000"
 * - "5만원에서 10만원" → "50000-100000"
 * - "15만원 이상" → "150000+"
 */
export function parseBudgetFromNaturalLanguage(input: string): BudgetRange | null {
  // Remove whitespace
  const normalized = input.replace(/\s+/g, '');

  // Pattern 1: "X만원 이하/아래/까지" → "0-X0000"
  let match = normalized.match(/(\d+)만원(이하|아래|까지|미만|이내)/);
  if (match) {
    const amount = parseInt(match[1], 10) * 10000;
    return `0-${amount}`;
  }

  // Pattern 2: "최대 X만원" → "0-X0000"
  match = normalized.match(/최대(\d+)만원/);
  if (match) {
    const amount = parseInt(match[1], 10) * 10000;
    return `0-${amount}`;
  }

  // Pattern 3: "X만원 이상" → "X0000+"
  match = normalized.match(/(\d+)만원이상/);
  if (match) {
    const amount = parseInt(match[1], 10) * 10000;
    return `${amount}+`;
  }

  // Pattern 4: "X만원에서 Y만원" or "X-Y만원" → "X0000-Y0000"
  match = normalized.match(/(\d+)만원(에서|~|-)(\d+)만원/);
  if (match) {
    const min = parseInt(match[1], 10) * 10000;
    const max = parseInt(match[3], 10) * 10000;
    return `${min}-${max}`;
  }

  // Pattern 5: "X만원 정도" → "(X-1)0000-(X+1)0000"
  match = normalized.match(/(\d+)만원정도/);
  if (match) {
    const amount = parseInt(match[1], 10) * 10000;
    const min = Math.max(0, amount - 10000);
    const max = amount + 10000;
    return `${min}-${max}`;
  }

  // Pattern 6: Just number "7만원" or "70000" or "70000원"
  match = normalized.match(/(\d+)만원/) || normalized.match(/(\d+)원?$/);
  if (match) {
    const rawAmount = match[1];
    let amount: number;

    // If contains "만", multiply by 10000
    if (normalized.includes('만')) {
      amount = parseInt(rawAmount, 10) * 10000;
    } else {
      amount = parseInt(rawAmount, 10);
    }

    // Default: treat as "up to X" (0-X)
    return `0-${amount}`;
  }

  return null;
}

/**
 * Check if budget input is vague and needs clarification
 *
 * IMPORTANT: Only returns true for PURE budget-related vague phrases
 * Does NOT include quality/feature requests like "더 좋은"
 */
export function needsBudgetClarification(input: string): boolean {
  // Only match BUDGET-specific vague phrases
  const budgetVaguePhrases = [
    '더 저렴',
    '더 싸',
    '싼 걸',
    '싼거',
    '가격 낮',
    '예산 줄',
    '더 비싸',
    '비싼 걸',
    '비싼거',
    '가격 높',
    '예산 늘',
  ];

  // Only return true if:
  // 1. Contains budget vague phrase
  // 2. AND does NOT have specific number (7만원, 100000원 etc.)
  const hasBudgetVague = budgetVaguePhrases.some(phrase => input.includes(phrase));
  const hasSpecificNumber = /(\d+)만원|(\d{4,})원?/.test(input.replace(/\s+/g, ''));

  return hasBudgetVague && !hasSpecificNumber;
}

/**
 * Adjust budget based on current budget and percentage
 *
 * Used when user says "더 저렴한 걸로" after clarification
 */
export function adjustBudgetByPercentage(
  currentBudget: BudgetRange,
  percentage: number  // 70 means reduce to 70% of current max
): BudgetRange {
  const { min, max } = parseBudgetRange(currentBudget);

  if (max === Infinity) {
    // Can't reduce infinite budget, return as-is
    return currentBudget;
  }

  const newMax = Math.floor(max * (percentage / 100));

  // Ensure newMax > min
  if (newMax <= min) {
    return `0-${newMax}`;
  }

  return `${min}-${newMax}`;
}

/**
 * Compare two budget ranges
 */
export function compareBudgets(
  budget1: BudgetRange,
  budget2: BudgetRange
): 'lower' | 'higher' | 'same' {
  const { max: max1 } = parseBudgetRange(budget1);
  const { max: max2 } = parseBudgetRange(budget2);

  if (max1 < max2) return 'lower';
  if (max1 > max2) return 'higher';
  return 'same';
}

/**
 * Validate budget range
 */
export function isValidBudget(budget: BudgetRange): boolean {
  try {
    const { min, max } = parseBudgetRange(budget);
    return min >= 0 && max > min;
  } catch {
    return false;
  }
}
