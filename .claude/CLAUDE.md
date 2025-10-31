# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered formula milk warmer recommendation service using an **Agentic Workflow** architecture with Google Gemini API. The core concept: "From the top N most popular formula milk warmers, we'll pick the perfect top 3 for you."

**Tech Stack**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript, Tailwind CSS v4, Framer Motion, Google Gemini API

## Development Commands

```bash
# Development
npm run dev         # Start dev server at http://localhost:3000

# Production
npm run build       # Build for production
npm start           # Start production server

# Code Quality
npm run lint        # Run ESLint
```

## Architecture Overview

### Page Flow (5 Pages)
1. **Home** (`/`) → "Start" button
2. **Ranking** (`/ranking`) → Product list
3. **Chat 1** (`/chat/structured`) → 8 core attribute questions with importance ratings
4. **Chat 2** (`/chat/open`) → Open conversation (80-100% accuracy progress bar)
5. **Result** (`/result`) → Top 3 personalized recommendations

### Agentic Workflow Pipeline

The recommendation workflow (`lib/workflow/recommendationWorkflow.ts`) orchestrates a multi-phase AI pipeline:

**Phase 1: Persona Generation** (`lib/agents/personaGenerator.ts`)
- Input: Chat transcript from both chat phases
- Output: `UserPersona` with weighted importance scores (1-10) for 8 core attributes
- Optional: Reflection pattern for validation (can be disabled for speed)

**Phase 2: Initial Filtering** (`lib/filtering/initialFilter.ts`)
- Code-based weighted sum: `score = Σ(product.coreValues[i] × persona.weights[i])`
- Budget filtering if specified
- Selects Top 5 candidates

**Phase 3: AI Evaluation** (`lib/agents/productEvaluator.ts`)
- Parallel evaluation of Top 5 products from persona's perspective
- Output: Grades (매우 충족 ~ 매우 미흡) with reasons per attribute
- Optional: Validation pattern (can be disabled for speed)

**Phase 4: Final Scoring** (`lib/filtering/scoreCalculator.ts`)
- Converts grades to numeric scores
- Formula: `70% attribute scores + 30% overallScore`
- Selects Top 3 products

**Phase 5: Recommendation Generation** (`lib/agents/recommendationWriter.ts`)
- Parallel generation of personalized recommendations for Top 3
- Output: Strengths, weaknesses, comparisons, additional considerations

### Core Data Types

All types defined in `types/index.ts`:

- **Product**: Product data with 8 `CoreValues` (temperatureControl, hygiene, material, usability, portability, priceValue, durability, additionalFeatures)
- **UserPersona**: AI-generated persona with `coreValueWeights` (1-10 for each attribute)
- **ProductEvaluation**: AI evaluation with grades and reasons per attribute
- **Recommendation**: Final Top 3 with personalized reasons and comparisons

### 8 Core Attributes

1. Temperature Control/Maintenance (가장 중요)
2. Hygiene/Cleaning Convenience
3. Material (Safety)
4. Usability
5. Portability (optional)
6. Price/Value (optional)
7. Durability/A/S (optional)
8. Additional Features/Design (optional)

### Product Data Structure

Products stored as markdown files in `data/products/` with:
- Product ID as filename (e.g., `7118428974.md`)
- Detailed analysis: 장점, 단점, 구매 패턴, 기타 정보
- Loaded via `lib/data/productLoader.ts`

### API Endpoints

**POST /api/recommend** (`app/api/recommend/route.ts`)
- Streaming endpoint using Server-Sent Events (SSE)
- Accepts: `{ messages: Message[] }`
- Returns: Progress updates (0-100%) and final recommendations
- Response format: `data: {"phase": "...", "progress": ..., "message": "..."}\n\n`

**POST /api/chat** (`app/api/chat/route.ts`)
- Chat interaction endpoint for structured/open conversation phases

### AI Integration

**Gemini API Client** (`lib/ai/gemini.ts`)
- Model: `gemini-flash-lite-latest`
- Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
- Helper: `callGeminiWithRetry()` wraps all API calls
- Helper: `parseJSONResponse()` extracts JSON from markdown code blocks
- All agents use retry mechanism for reliability

### Performance Optimizations

1. **Parallel Processing**: Product evaluation and recommendation generation run in parallel
2. **Hybrid Approach**: Code-based filtering (fast) + LLM evaluation (contextual)
3. **Optional Patterns**: Reflection and Evaluation patterns can be disabled for speed
4. **Streaming**: Progress updates via SSE keep users informed during 10-30s workflow

### UI/UX Guidelines

- Max width: 480px (centered, gray background beyond)
- Target audience: 30-40 year old women (simple, clean design)
- Minimum touch area: 44×44px
- Smooth animations with Framer Motion
- All user-facing text in Korean

## Environment Variables

Required in `.env.local`:
```env
GEMINI_API_KEY=your_api_key_here
```

## Key Implementation Notes

1. **Session Management**: In-memory or sessionStorage (no database required)
2. **Error Handling**: All Gemini API calls wrapped with retry logic
3. **JSON Extraction**: AI responses may contain markdown code blocks - use `parseJSONResponse()`
4. **Page Refresh**: Returns to home page
5. **Accuracy Tracking**: Chat 2 shows progress bar (80-100%) for perceived recommendation quality
6. **Speed vs Quality**: Reflection/Validation patterns can be toggled based on requirements

## Common Gotchas

- AI responses may wrap JSON in markdown code blocks (````json\n...\n````) - always parse defensively
- Product coreValues and persona weights must align on the same 8 attributes
- Grade conversion: 매우 충족=5, 충족=4, 보통=3, 미흡=2, 매우 미흡=1
- Importance levels: 매우 중요=10, 중요=7, 보통=4
- All product markdown files must be loaded before filtering
