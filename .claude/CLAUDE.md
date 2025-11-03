# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered formula milk warmer (분유포트) recommendation service using an **Agentic Workflow** architecture with Google Gemini API. Core concept: "From the top N most popular warmers, we'll pick the perfect top 3 for you."

**Tech Stack**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript, Tailwind CSS v4, Framer Motion, Google Gemini API, Supabase (logging only)

## Development Commands

```bash
npm run dev         # Start dev server at http://localhost:3000
npm run build       # Build for production
npm start           # Start production server
npm run lint        # Run ESLint
```

## Architecture Overview

### Page Flow (6 Pages)
1. **Home** (`/`) → Start button
2. **Ranking** (`/ranking`) → Product list view
3. **Chat** (`/chat`) → Conversational attribute assessment with follow-up questions
4. **Result** (`/result`) → Top 3 personalized recommendations
5. **Admin** (`/admin`) → Log viewer with conversation tracking
6. **Admin Upload** (`/admin/upload`) → Product management interface

### Conversational Chat Flow (Single Page)

The chat experience (`/chat`) runs through multiple phases in a single conversational flow:

**Phase 0: Warming Up**
- Free-form opening question to gather initial context
- User shares their situation naturally (e.g., "쌍둥이 키워요", "새벽 수유가 많아요")
- Context stored in `phase0Context` for later follow-up relevance analysis

**Phase 1-7: Attribute Assessment (7 Core Attributes)**
For each attribute, a 3-step conversational pattern:
1. **Intro**: Empathetic introduction of attribute with `conversationalIntro` from `data/attributes.ts`
2. **Importance**: User rates importance (중요함/보통/중요하지 않음) via buttons or natural language
3. **Follow-up**: AI-generated contextual question based on:
   - Phase 0 context relevance (analyzed by `assessContextRelevance()`)
   - Importance level
   - Attribute details from `data/attributes.ts`

**Natural Language Understanding**:
- `analyzeUserIntent()` classifies user messages as:
  - `importance_response`: User stating importance level
  - `follow_up_question`: User asking for clarification
  - `off_topic`: Unrelated conversation (redirected politely)
- `createFollowUpPrompt()` generates contextual questions that reference Phase 0 if relevant
- `createReassessmentPrompt()` adjusts importance based on follow-up answers

**Phase 8: Open Conversation**
- Additional context gathering (2-3 exchanges)
- Accuracy progress bar (80-100%) based on conversation depth
- AI uses `ASSISTANT_CHAT2_PROMPT` to ask about special situations

### Recommendation Workflow Pipeline

**IMPORTANT**: `lib/workflow/recommendationWorkflow.ts` is DEPRECATED. The actual workflow is in `app/api/recommend/route.ts` which streams progress via SSE.

**Phase 1: Persona Generation** (`lib/agents/personaGenerator.ts`)
- Input: Full chat history + `AttributeAssessment` object
- Output: `UserPersona` with `coreValueWeights` (1-10 scale for 7 attributes)
- Uses conversation context to infer priorities beyond button ratings

**Phase 2: Initial Filtering** (`lib/filtering/initialFilter.ts`)
- Budget filter: `filterByBudget()` if persona includes budget
- Weighted scoring: `score = Σ(product.coreValues[i] × persona.weights[i])`
- Selects Top 5 candidates via `selectTopProducts()`

**Phase 3: AI Evaluation** (`lib/agents/productEvaluator.ts`)
- Parallel evaluation of Top 5 products from persona's perspective
- Output: `ProductEvaluation` with grades per attribute (매우 충족 ~ 매우 미흡)
- Optional validation via `evaluationValidator.ts` (currently disabled for speed)

**Phase 4: Final Scoring** (`lib/filtering/scoreCalculator.ts`)
- Converts grades to numeric scores (5=매우 충족, 1=매우 미흡)
- Formula: `70% weighted attribute scores + 30% overallScore`
- Selects Top 3 via `selectTop3()`

**Phase 5: Recommendation & Context Summary** (parallel)
- `generateTop3Recommendations()`: Strengths, weaknesses, comparisons
- `generateContextSummary()`: User priority summary for result page display

### Core Data Types (`types/index.ts`)

**Product**: 7 `CoreValues` (temperatureControl, hygiene, material, usability, portability, priceValue, additionalFeatures)
**UserPersona**: AI-generated with `coreValueWeights` (1-10) and `contextualNeeds`
**ProductEvaluation**: Grades + reasons per attribute + `overallScore`
**Recommendation**: Final Top 3 with personalized explanations
**ConversationalState**: Tracks current attribute, follow-up status, intro completion

### 7 Core Attributes (`data/attributes.ts`)

Each attribute has:
- `key`: Property name in `CoreValues`
- `name`: Korean display name
- `description`: Brief explanation
- `details`: Array of sub-points
- `conversationalIntro`: Empathetic opening line
- `importanceExamples`: Sample answers for each importance level
- `isOptional`: Whether it's always required

Attributes:
1. 온도 조절/유지 성능 (Temperature Control)
2. 위생/세척 편의성 (Hygiene)
3. 소재 (안전성) (Material Safety)
4. 사용 편의성 (Usability)
5. 휴대성 (Portability) - optional
6. 가격 대비 가치 (Price/Value) - optional
7. 부가 기능 및 디자인 (Additional Features) - optional

### Product Data Structure

**Storage**: Markdown files in `data/products/` named by product ID (e.g., `7118428974.md`)
**Format**: Free-form markdown with sections:
- 장점 (Strengths)
- 단점 (Weaknesses)
- 이 제품을 산 육아 부모들의 패턴/특징 (Buyer personas)
- 기타 (Other notes)

**Loading**: `lib/data/productLoader.ts` reads markdown + frontmatter containing:
```yaml
id: "7118428974"
title: "제품명"
price: 59900
reviewCount: 1234
ranking: 1
thumbnail: "/thumbnails/7118428974.jpg"
reviewUrl: "https://..."
coreValues:
  temperatureControl: 8
  hygiene: 7
  ...
```

### API Endpoints

**POST /api/chat** (`app/api/chat/route.ts`)
Multi-purpose chat endpoint with `action` parameter:
- `action: 'generate_followup'`: Creates contextual follow-up question
- `action: 'reassess_importance'`: Re-evaluates importance based on follow-up answer
- `phase: 'chat1'`: Attribute assessment (uses `analyzeUserIntent()`)
- `phase: 'chat2'`: Open conversation

**POST /api/recommend** (`app/api/recommend/route.ts`)
- Streaming SSE endpoint for recommendation workflow
- Input: `{ messages: Message[], attributeAssessments: AttributeAssessment }`
- Output: Progress events (0-100%) + final result
- Format: `data: {"phase": "...", "progress": ..., "message": "..."}\n\n`

**Admin Endpoints** (`app/api/admin/`)
- `POST /api/log`: Save user interaction logs to Supabase
- `GET /api/admin/logs`: Retrieve logs by date range
- `POST /api/admin/analyze-product`: AI-powered product analysis from review URL
- `POST /api/admin/save-product`: Save product with thumbnail to `data/products/`
- `POST /api/admin/check-duplicate`: Check if product ID already exists

### AI Integration (`lib/ai/gemini.ts`)

**Model**: `gemini-flash-lite-latest`
**Retry Logic**: `callGeminiWithRetry()` with 3 attempts, exponential backoff (1s, 2s, 4s)
**JSON Parsing**: `parseJSONResponse<T>()` handles markdown code blocks (```json\n...\n```)
**Temperature**: Varies by agent (0.3 for intent analysis, 0.7 for generation)

**Key Agents**:
- `lib/ai/intentAnalyzer.ts`: Classifies user intent, extracts importance from natural language
- `lib/agents/personaGenerator.ts`: Creates weighted persona from conversation
- `lib/agents/productEvaluator.ts`: Evaluates products from persona perspective
- `lib/agents/recommendationWriter.ts`: Generates personalized recommendation text
- `lib/agents/contextSummaryGenerator.ts`: Summarizes user priorities for result page

### Context Relevance Analysis (`lib/utils/contextRelevance.ts`)

`assessContextRelevance()` uses LLM to determine if Phase 0 context relates to current attribute:
- Returns: `high` | `medium` | `low` | `none`
- Used by follow-up generation to decide whether to reference initial context
- Example: "쌍둥이" context is highly relevant to "용량" (capacity) but not to "디자인" (design)

### Message Templates (`lib/utils/messageTemplates.ts`)

**Follow-up Generation**:
- `createFollowUpPrompt()`: Builds prompt based on relevance level
- High relevance: References Phase 0 context explicitly
- Low/none: Generic follow-up based on attribute details
- Tone: Empathetic, conversational, Korean (공감형 톤)

**Importance Reassessment**:
- `createReassessmentPrompt()`: After follow-up answer, determines if importance should change
- Output: `{ action: 'upgrade' | 'maintain', newImportance: ImportanceLevel, reason: string }`

### Session & Logging

**Session Management**: Browser-side `sessionStorage` (no backend session)
- `SessionState` stored in `sessionStorage` key: `recommendationSession`
- Includes: messages, attributeAssessments, phase0Context, conversationalState

**Logging** (`lib/logging/`):
- `logger.ts`: Server-side Supabase logging
- `clientLogger.ts`: Client-side wrapper
- Logs stored in `daily_logs` table with structure: `{ date: string, events: LogEvent[] }`
- Admin page (`/admin`) displays logs with conversation replay and AI response history

### UI/UX Guidelines

- Max width: 480px (mobile-first, centered layout)
- Target audience: 30-40 year old Korean mothers (friendly, empathetic tone)
- Min touch area: 44×44px for mobile accessibility
- Framer Motion for smooth transitions
- All user-facing text in Korean
- Conversational tone: Clear, Concise, Casual, Respectful, Emotional (공감형)

## Environment Variables

Required in `.env.local`:
```env
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Key Implementation Notes

1. **Chat Flow**: Single-page conversational flow with dynamic phase transitions (not separate chat1/chat2 pages)
2. **Importance Detection**: AI analyzes natural language to extract importance, not just button clicks
3. **Follow-up Strategy**: Contextual questions generated by LLM based on Phase 0 relevance analysis
4. **Workflow Location**: Real workflow is in `app/api/recommend/route.ts`, NOT `lib/workflow/recommendationWorkflow.ts`
5. **JSON Parsing**: Always use `parseJSONResponse()` for AI responses - they may wrap JSON in markdown
6. **Retry Logic**: All Gemini calls wrapped with `callGeminiWithRetry()` for reliability
7. **Grade Conversion**: 매우 충족=5, 충족=4, 보통=3, 미흡=2, 매우 미흡=1
8. **Weight Mapping**: 중요함=10, 보통=7, 중요하지 않음=5 (used in persona generation)

## Common Gotchas

- **Deprecated File**: `lib/workflow/recommendationWorkflow.ts` has warning comment - do NOT use
- **Attribute Count**: Changed from 8 to 7 attributes (removed "내구성/A/S")
- **JSON in Markdown**: AI responses often wrap JSON in ````json\n...\n``` blocks
- **Product Loading**: Must load all products before filtering (uses `loadAllProducts()`)
- **Alignment**: Product `coreValues` and persona `weights` must use same 7 attributes in same order
- **Context Reference**: Follow-up questions should naturally reference Phase 0 only if relevance is high
- **Tone Consistency**: Maintain empathetic Korean tone (공감형) throughout chat flow
- **Admin Features**: Product upload includes AI-powered analysis from Coupang review URLs
