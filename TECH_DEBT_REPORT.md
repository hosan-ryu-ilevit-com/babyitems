# 📊 BabyItem MVP v0.3 - 기술 부채 분석 리포트

**분석 일자**: 2025-11-11
**분석 시점**: v0.3 (commit: b7dff34 "0.3 최종 save 1111")

## 🔍 Executive Summary

- **데드 코드**: 19.5 KB (4개 파일)
- **Critical 버그**: 3개 (Next.js 15, Gemini 파싱, Priority chat API)
- **가장 큰 문제**: 플로우 불일치 (문서 vs 코드)
- **즉시 실행 가능**: Phase 1 작업 (1-2시간)

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

## 2. 플로우 불일치 (가장 큰 문제)

### 현재 상황

#### **문서 (CLAUDE.md)**: Priority 플로우
```
Home → Priority → (Chat 선택적) → Result
```
- Priority 페이지에서 6개 속성 사전 설정
- Chat은 'high' 속성만 deep-dive (3~5턴)
- 사용자는 선택: "채팅으로 더 자세히" or "바로 추천받기"

#### **실제 코드 (app/chat/page.tsx)**: 구버전 Chat1 플로우
```
Home → Ranking → Chat → Result
```
- Phase 0: warmup 질문
- Chat1: 7개 속성 순차 질문 + 중요도 버튼 3개
- Chat2: 오픈 대화

### 문제점
1. **중복 질문**: Priority 페이지와 Chat1이 같은 것을 물음
2. **사용자 혼란**: 두 가지 다른 플로우가 섞여 있음
3. **코드 복잡도**: Chat 페이지 1800+ 라인 (구버전 로직 때문)

### 해결 방안

#### **Option A: Priority 플로우로 완전 전환** (권장)
- Chat 페이지를 Priority 기반으로 리팩토링
- Phase 0 변형: 특별한 상황만 물음 (스킵 가능)
- Chat1 대체: 'high' 속성만 3~5턴 자유 대화
- Chat2 유지: 추가 질문

**장점**:
- CLAUDE.md와 일치
- 사용자 경험 개선
- 중복 제거
- messageTemplates, contextRelevance 삭제 가능 (추가 12KB+)

**단점**:
- Chat 페이지 대규모 리팩토링 필요

#### **Option B: 구버전 플로우 유지 및 문서 수정**
- CLAUDE.md를 구버전 플로우에 맞게 수정
- Priority 페이지 제거 or 선택적 진입점으로 변경

**장점**:
- 코드 변경 최소

**단점**:
- 중복 질문 문제 미해결
- 사용자 경험 저하

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

### Phase 2: 플로우 결정 (사용자 판단 필요)
4. **Chat 페이지 플로우 선택**:
   - Option A: Priority 플로우 전환 (권장, 대규모 리팩토링)
   - Option B: 구버전 유지 (문서 수정)

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

### Phase 1 (긴급)
- [ ] intentAnalyzer.ts 삭제
- [ ] recommendationWorkflow.ts 삭제
- [ ] chatHelpers.ts 삭제
- [ ] evaluationValidator.ts 삭제
- [ ] Next.js 15 params 수정 (모든 dynamic routes)
- [ ] Gemini API 에러 핸들링 강화
- [ ] 커밋 & 푸시

### Phase 2 (플로우 결정)
- [ ] Option A or B 결정
- [ ] Chat 페이지 리팩토링 (Option A) or 문서 수정 (Option B)
- [ ] messageTemplates/contextRelevance 처리

### Phase 3 (리팩토링)
- [ ] session.ts 분리
- [ ] 타입 정의 정리
- [ ] 컴포넌트 구조 개선

### Phase 4 (문서화)
- [ ] CLAUDE.md 업데이트
- [ ] 주석 추가
