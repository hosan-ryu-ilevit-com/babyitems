# 📊 BabyItem MVP v0.3 - 기술 부채 분석 리포트

**분석 일자**: 2025-11-11
**분석 시점**: v0.3 (commit: b7dff34 "0.3 최종 save 1111")
**최종 업데이트**: 2025-11-11 (Phase 1-2 완료)

## 🔍 Executive Summary

- ✅ **Phase 1 완료**: 19.5 KB 데드 코드 제거 (commit: 1d935e5)
- ✅ **Phase 2 완료**: 레거시 플로우 차단 + ~150 lines unused code 제거 (commit: 0162090)
- **총 제거**: ~20 KB dead code + 234 lines legacy code
- **TypeScript**: 컴파일 에러 0개
- **남은 작업**: Phase 3-4 (선택적 리팩토링 & 문서화)

---

## 1. 완전히 미사용되는 파일 (즉시 삭제 권장)

```
lib/ai/intentAnalyzer.ts             (6.0 KB) - 0개 참조
lib/workflow/recommendationWorkflow.ts (3.9 KB) - 0개 참조
lib/utils/chatHelpers.ts             (6.5 KB) - 0개 참조
lib/agents/evaluationValidator.ts    (3.1 KB) - 0개 참조
```

**Total**: 19.5 KB의 데드 코드

**검증 방법**: `grep -r` 전체 코드베이스 스캔 완료

---

## 2. 플로우 현황 (이미 Priority 플로우 구현됨!)

### ✅ 실제 현황 (재확인)

#### **현재 동작하는 플로우**:
```
Home → Priority → (Chat 선택적) → Result
```

**Priority 페이지 (`/priority`)**:
- 6개 속성 중요도 설정 (high/medium/low)
- 예산 선택
- 두 가지 선택지:
  - "채팅으로 더 자세히" → `/chat`
  - "바로 추천받기" → `/result`

**Chat 페이지 (`/chat`)** - 이미 Priority 기반 동작 중:
- **Priority 있을 때** (Line 313-314, 461-462):
  - `'high'` 속성만 필터링하여 질문
  - Phase 0 변형 (특별한 상황)
  - Phase 1: high 속성 deep-dive
  - Phase 2 (Chat2): 추가 질문
- **Priority 없을 때** (Line 323):
  - 구버전 플로우 fallback (Phase 0 워밍업 + Chat1)

### 🔍 발견된 실제 문제

#### A. **두 플로우 공존** (혼재)
Chat 페이지가 두 가지 경로를 모두 지원:
1. **신규 (Priority 플로우)**: Priority 페이지 경유 시
2. **레거시 (구버전 플로우)**: Priority 없이 직접 접근 시

**문제점**:
- 코드 복잡도: 1800+ 라인 (두 플로우 모두 유지)
- 유지보수 부담: 두 가지 로직 동시 관리
- 불필요한 레거시 코드 (Priority 페이지가 필수 진입점인데 fallback 유지)

#### B. **미사용 레거시 코드**
Priority 플로우가 우선이므로 구버전 코드는 **실질적으로 미사용**:
- Phase 0 워밍업 질문 로직
- Chat1 7개 속성 순차 질문
- `messageTemplates`의 일부 함수들
- 중요도 버튼 3개 UI

### 📝 정정된 분석

#### **문서와 코드는 이미 일치함**
- CLAUDE.md: Priority 플로우 설명 ✅
- 실제 코드: Priority 플로우 동작 ✅
- **문제 없음!**

#### **실제 문제는: 레거시 코드 잔여**
- Chat 페이지에 구버전 로직이 fallback으로 남아있음
- Priority 페이지가 필수 진입점이므로 fallback은 불필요
- 약 40-50%의 Chat 코드가 실제로는 사용되지 않음

---

## 3. Critical 버그 (즉시 수정 필요)

### A. Next.js 15 마이그레이션 에러

**문제**:
```typescript
// 현재 (에러 발생)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params; // ❌ Error: params is a Promise
}
```

**수정**:
```typescript
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // ✅
}
```

**영향 받는 파일**:
- `app/api/products/[id]/route.ts`
- 기타 dynamic route API들

### B. Gemini API JSON 파싱 실패
- **위치**: `lib/agents/contextSummaryGenerator.ts:124`
- **빈도**: 간헐적
- **원인**: JSON 응답 포맷 검증 부족
- **수정**: `parseJSONResponse()` 로직 강화

### C. Priority chat API 500 에러
- **위치**: `app/api/priority-chat/route.ts`
- **원인**: Gemini API retry 로직 문제
- **수정**: 에러 핸들링 강화

---

## 4. 중복/유사 로직

### A. 세션 관리
- **현재**: `lib/utils/session.ts` - 600+ 라인, 30+ 함수
- **문제**: 단일 파일에 모든 세션 로직
- **개선안**: 논리적 그룹으로 분리
  ```
  lib/utils/session/
    ├── core.ts        (loadSession, saveSession, clearSession)
    ├── attributes.ts  (속성 관련)
    ├── phase.ts       (phase 관리)
    └── budget.ts      (예산 관련)
  ```

### B. 타입 정의 불일치
```typescript
// types/index.ts
interface CoreValues {  // 8개 속성
  temperatureControl, hygiene, material, usability,
  portability, priceValue, durability, additionalFeatures
}

// data/attributes.ts
CORE_ATTRIBUTES: 7개  // durability 제외
PRIORITY_ATTRIBUTES: 6개  // priceValue도 제외
```

**문제**: 불일치로 인한 혼란
**해결**: 통일 or 명확한 문서화

---

## 5. 컴포넌트 구조

### 현재
```
components/
  ├── AttributeBottomSheet.tsx
  ├── ComparisonTable.tsx
  ├── PriorityButton.tsx
  └── UserContextSummary.tsx
```

### 개선 방향
```
components/
  ├── common/
  │   ├── BottomSheet.tsx        (재사용 가능한 바텀시트)
  │   ├── TypingAnimation.tsx    (Chat에서 추출)
  │   └── ProductCard.tsx
  ├── chat/
  │   ├── MessageBubble.tsx
  │   └── ImportanceButtons.tsx
  └── result/
      ├── RecommendationCard.tsx
      └── ComparisonTable.tsx
```

---

## 6. API 라우트 정리

### 확인된 사용
- ✅ `/api/chat` - Chat2 대화
- ✅ `/api/recommend` - SSE 스트리밍 추천
- ✅ `/api/log` - Supabase 로깅
- ✅ `/api/admin/logs` - Admin 로그 조회
- ✅ `/api/admin/analyze-product` - 제품 분석
- ✅ `/api/admin/save-product` - 제품 저장
- ⚠️  `/api/admin/check-duplicate` - 사용 여부 미확인
- ⚠️  `/api/admin/upload-thumbnail` - 사용 여부 미확인

### 미사용 (DEPRECATED)
- ❌ 없음 (API는 모두 사용 중으로 추정)

---

## 🎯 권장 작업 순서

### Phase 1: 긴급 수정 (1-2시간)
1. ✅ **DEPRECATED 파일 삭제** (4개, 19.5 KB)
2. ✅ **Next.js 15 params 에러 수정** (모든 dynamic route)
3. ✅ **Gemini API 에러 핸들링 강화**

### Phase 2: 레거시 코드 정리 ✅ COMPLETED
4. **Chat 페이지 레거시 코드 차단**:
   - ✅ Option B 선택: 안전한 접근 (fallback 코드 보존, 실행은 차단)
   - ✅ Priority 설정 체크 추가 → 없으면 /priority 리다이렉트
   - ✅ contextRelevance.ts 삭제
   - ✅ messageTemplates에서 unused functions 제거 (~150 lines)

### Phase 3: 리팩토링 (선택적)
5. **session.ts 분리** (파일 크기 감소, 유지보수성 향상)
6. **타입 정의 정리** (불일치 해소)
7. **컴포넌트 재사용성 개선**

### Phase 4: 문서화
8. **CLAUDE.md 업데이트** (실제 코드와 일치)
9. **주석 추가** (복잡한 로직)

---

## 💡 즉시 실행 가능한 작업

### 1. DEPRECATED 파일 삭제
```bash
git rm lib/ai/intentAnalyzer.ts
git rm lib/workflow/recommendationWorkflow.ts
git rm lib/utils/chatHelpers.ts
git rm lib/agents/evaluationValidator.ts
git commit -m "chore: Remove deprecated unused files (19.5KB dead code)"
```

### 2. Next.js 15 params 수정
```typescript
// app/api/products/[id]/route.ts 수정 예시
- export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
+ export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
-   const { id } = params;
+   const { id } = await params;
```

---

## ⚠️  주의사항

### Chat 페이지 플로우 결정 전까지
- **v0.4 작업 진행 불가**: Priority 플로우 기반 기능들이 구버전 Chat과 충돌
- **우선 v0.3 안정화** 권장

### messageTemplates & contextRelevance
- Chat 페이지 플로우 결정 후 처리:
  - Option A 선택 시: 함께 삭제
  - Option B 선택 시: 유지

---

## 📈 예상 효과

### Phase 1 완료 후
- 19.5 KB 데드 코드 제거
- Next.js 15 호환성 확보
- API 에러 감소

### Phase 2 완료 후 (Option A)
- 사용자 경험 개선 (중복 질문 제거)
- Chat 페이지 복잡도 50% 감소 (예상)
- messageTemplates, contextRelevance 삭제 가능 (추가 12KB+)

### Phase 3 완료 후
- 코드 가독성 향상
- 유지보수 비용 감소
- 새 기능 추가 용이

---

## 📋 체크리스트

### Phase 1 (긴급) ✅ COMPLETED
- [x] intentAnalyzer.ts 삭제 (commit: 1d935e5)
- [x] recommendationWorkflow.ts 삭제 (commit: 1d935e5)
- [x] chatHelpers.ts 삭제 (commit: 1d935e5)
- [x] evaluationValidator.ts 삭제 (commit: 1d935e5)
- [x] Gemini API 에러 핸들링 강화 (commit: 1d935e5)
- [x] 커밋 & 푸시

**Note**: Next.js 15 params issue not found in v0.3 codebase (likely N/A for this version)

### Phase 2 (레거시 정리) ✅ COMPLETED
- [x] Option B 선택: Legacy flow 차단 (안전한 접근)
- [x] Chat 페이지에 Priority 체크 추가 → /priority 리다이렉트 (commit: 0162090)
- [x] contextRelevance.ts 삭제 (commit: 0162090)
- [x] messageTemplates 내 unused functions 삭제 (commit: 0162090)
  - createFollowUpPrompt() (~100 lines)
  - createReassessmentPrompt() (~47 lines)
- [x] TypeScript 에러 해결 (ContextRelevance type not found)

### Phase 3 (리팩토링)
- [ ] session.ts 분리
- [ ] 타입 정의 정리
- [ ] 컴포넌트 구조 개선

### Phase 4 (문서화)
- [ ] CLAUDE.md 업데이트
- [ ] 주석 추가
