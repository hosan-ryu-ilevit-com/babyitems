# Baby Item AI Shopping Assistant - Formula Milk Warmer Recommendation Service

## Project Overview

An Agentic Workflow-based AI recommendation service using Gemini API.
**Core Concept**: "From the top N most popular formula milk warmers, we'll pick the perfect top 3 for you"

## Tech Stack

- **Frontend**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript
- **Styling**: Tailwind CSS v4
- **Animation**: Framer Motion (smooth mobile app UX)
- **AI**: Google Gemini API
- **Backend**: Session-based (Supabase is optional)

## Environment Variables

Create `.env.local`:
```env
GEMINI_API_KEY=AIzaSyBvSSRV3Kw_2H0fDUXkhWZ0FfX-Hx1-Tvk
```

## Page Structure (5 Pages)

### 1. Home (/)
- Top-left: Logo
- Top-right: "Real-time Ranking" button
- Center: Main title and subtitle
- Bottom: Floating "Start" button -> Navigate to Chat 1

### 2. Ranking (/ranking)
Display crawled product ranking list

### 3. Chat 1 (/chat/structured)
Structured questions about 8 core attributes
- AI assistant questions
- Bottom sheet multiple choice: "Normal / Important / Very Important"
- Chat input for additional questions

### 4. Chat 2 (/chat/open)
Open conversation for additional context
- Progress bar above chat input (starts at 80%, max 100%)
- "Get Recommendation" button (always active)

### 5. Result (/result)
Final Top 3 recommendations
- Top-right: "Home" button
- Product cards with personalized reasons and comparisons

## Core Attributes (8)

1. Temperature Control/Maintenance (Most Important)
2. Hygiene/Cleaning Convenience
3. Material (Safety)
4. Usability
5. Portability (optional)
6. Price/Value (optional)
7. Durability/A/S (optional)
8. Additional Features/Design (optional)

## Agentic Workflow

### Phase 1: Information Collection (Chat 1 + Chat 2)

AI assistant collects user preferences on 8 attributes + additional context

### Phase 2: Persona Generation + Reflection

**Agent 1: Persona Generator**
- Input: Chat transcript, attribute importance ratings
- Output: UserPersona with coreValueWeights (1-10 for each attribute)

**Agent 2: Persona Reflector** (Reflection pattern)
- Validates persona accuracy against original conversation
- Auto-regeneration if confidence < 80%

### Phase 3: Initial Filtering (Code-based)

Calculate fit scores using weighted sum:
```
score = sum(product.coreValues[i] * persona.weights[i])
```
Select Top 5 candidates

### Phase 4: AI Evaluation + Validation

**Agent 3: Product Evaluator**
- Evaluate each Top 5 product from persona's perspective
- Output: Grades (Very Good ~ Very Poor) with reasons

**Agent 4: Evaluation Validator** (Evaluation pattern)
- Validate logical consistency of evaluations
- Re-evaluate if validation fails

### Phase 5: Final Score Calculation

Convert grades to numeric scores, multiply by persona weights
Select Top 3 products

### Phase 6: Recommendation Generation

**Agent 5: Recommendation Writer**
- Generate personalized reasons (strengths, weaknesses)
- Comparison with other candidates
- Additional considerations

## Key Improvements

1. **Reflection Pattern**: Auto-validates and corrects persona generation
2. **Evaluation Pattern**: Ensures AI evaluation quality
3. **Hybrid Approach**: Code for speed, LLM for context understanding
4. **Error Handling**: Retry mechanisms with exponential backoff
5. **Caching**: Minimize API calls

## Development Priorities

1. Fix CLAUDE.md file
2. Install dependencies (framer-motion, @google/generative-ai)
3. Create folder structure
4. Define TypeScript types
5. Create mock product data
6. Implement pages (Home -> Ranking -> Chat 1 -> Chat 2 -> Result)
7. Implement Agentic Workflow
8. Add animations and mobile optimization

## UI/UX Guidelines

- Max width: 480px (centered)
- Gray background beyond max width
- Simple & clean design for 30-40 women
- Smooth animations with Framer Motion
- Minimum touch area: 44x44px

## Notes

- Refresh returns to Home
- Session management in memory or sessionStorage
- All Korean text in actual implementation
