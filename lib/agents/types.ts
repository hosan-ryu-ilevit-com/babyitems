/**
 * Agent Types
 *
 * Type definitions for the AI agent system
 */

import type { BudgetRange, Recommendation } from '@/types';

export type IntentType =
  | 'REFILTER_WITH_ANCHOR'  // Re-recommend using specific product as new anchor
  | 'REFILTER'              // Re-recommend with condition changes only
  | 'PRODUCT_QA'            // Ask about specific product
  | 'COMPARE'               // Compare products
  | 'ASK_CLARIFICATION'     // Need more info from user
  | 'GENERAL';              // General/out-of-scope

export interface TagChanges {
  addProsTags?: string[];
  removeProsTags?: string[];
  addConsTags?: string[];
  removeConsTags?: string[];
}

export interface BudgetChange {
  type: 'specific' | 'clarification_needed' | 'none';
  value?: string;  // Budget range string (e.g., "0-70000")
  rawInput?: string;  // User's raw input (e.g., "7만원 이하")
}

export interface Intent {
  tool: IntentType;
  confidence: number;  // 0-100
  needsClarification: boolean;

  // Tool-specific arguments
  args?: {
    // REFILTER_WITH_ANCHOR
    productRank?: number;  // 1, 2, or 3 (from "1번", "2번", "3번" in user input)
    newAnchorProductId?: string;  // OR direct product ID (if button clicked)

    // REFILTER / REFILTER_WITH_ANCHOR
    tagChanges?: TagChanges;
    budgetChange?: BudgetChange;

    // PRODUCT_QA
    question?: string;

    // COMPARE
    productRanks?: number[];
    aspect?: 'price' | 'hygiene' | 'overall' | 'specific';
    specificAspect?: string;

    // ASK_CLARIFICATION
    clarificationQuestion?: string;
    clarificationContext?: 'budget' | 'feature' | 'product';

    // GENERAL
    message?: string;
  };

  // Reasoning (for debugging)
  reasoning?: string;
}

export interface AgentContext {
  currentRecommendations: Recommendation[];
  currentSession: {
    selectedProsTags?: string[];
    selectedConsTags?: string[];
    budget?: BudgetRange;
    anchorProduct?: {
      productId: string;
      title: string;
    };
  };
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface AgentRequest {
  userInput: string;
  sessionId: string;
  context: AgentContext;

  // If user clicked "이 상품 기반으로 재추천" button
  anchorProductId?: string;
}

export interface AgentResponse {
  type: 'intent' | 'thinking' | 'message' | 'clarification' | 'recommendations' | 'done' | 'error';
  data?: any;
  intent?: Intent;
}
