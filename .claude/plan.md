# V2 추천 스크롤 동작 개선 플랜

## 현재 상황

### 현재 스크롤 동작
```javascript
const scrollToBottom = useCallback(() => {
  setTimeout(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}, []);
```
- `messagesEndRef`는 메시지 목록 맨 끝에 위치
- 새 컴포넌트 추가 시 맨 아래로 스크롤됨

### 문제점
1. 새 컴포넌트가 화면 **하단**에 위치하게 됨
2. 헤더 바로 아래로 올라오지 않음
3. 사용자가 새 컴포넌트를 보려면 스크롤 해야 함

### 원하는 동작
- AI 채팅 앱처럼 새 메시지/컴포넌트가 **헤더 바로 아래**에 위치
- 새로 렌더링된 컴포넌트가 화면 상단에 보이도록 스크롤

---

## 접근법 비교

### 접근법 A: 마지막 메시지로 `block: 'start'` 스크롤
**방법**: 마지막 메시지 요소에 ref를 부여하고 `scrollIntoView({ block: 'start' })`
```javascript
// 마지막 메시지의 DOM 요소를 찾아서 스크롤
const lastMessageEl = document.querySelector('[data-message-id="' + lastMessageId + '"]');
lastMessageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

**장점**: 정확한 위치로 스크롤 가능
**단점**: DOM 쿼리 필요, 메시지 ID 추적 필요

---

### 접근법 B: 스페이서 div 추가 (권장)
**방법**: 메시지 목록 끝에 `min-height` 스페이서 추가
```jsx
<div className="space-y-4">
  {messages.map(renderMessage)}
</div>

{/* 스페이서: 새 컴포넌트가 상단에 오도록 충분한 여백 */}
<div className="min-h-[calc(100dvh-200px)]" />

<div ref={messagesEndRef} />
```

**장점**:
- 기존 `scrollToBottom()` 로직 그대로 사용 가능
- 구현이 간단함
- 새 컴포넌트가 자연스럽게 상단에 위치

**단점**:
- 고정 높이라 완벽하지 않을 수 있음
- 하단에 큰 여백이 생김

---

### 접근법 C: `scrollTo()` + offset 계산
**방법**: 스크롤 컨테이너의 `scrollTo()` 사용
```javascript
const scrollToNewComponent = useCallback((messageId: string) => {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (el && scrollContainerRef.current) {
    const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const offset = elTop - containerTop;
    scrollContainerRef.current.scrollTo({
      top: scrollContainerRef.current.scrollTop + offset - 20, // 20px 여백
      behavior: 'smooth'
    });
  }
}, []);
```

**장점**: 정확한 위치 제어
**단점**: 복잡한 계산 필요

---

### 접근법 D: 동적 ref 관리 (가장 정교함)
**방법**: 새로 추가된 메시지의 ref를 상태로 관리
```javascript
const [lastAddedMsgId, setLastAddedMsgId] = useState<string | null>(null);
const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

// addMessage에서 lastAddedMsgId 업데이트
const addMessage = useCallback((message, withTyping) => {
  const newId = generateId();
  // ...
  setLastAddedMsgId(newId);
  return newId;
}, []);

// 렌더링 시 ref 등록
<div ref={(el) => { if (el) messageRefs.current.set(message.id, el); }}>

// 스크롤
useEffect(() => {
  if (lastAddedMsgId) {
    const el = messageRefs.current.get(lastAddedMsgId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setLastAddedMsgId(null);
  }
}, [lastAddedMsgId]);
```

**장점**: 가장 정확하고 React스러운 방식
**단점**: 코드 복잡도 증가

---

## 권장 구현 방안: 접근법 B + D 조합

### 핵심 아이디어
1. **스페이서 추가**: 하단에 충분한 여백을 확보하여 새 컴포넌트가 상단에 올 수 있게 함
2. **스크롤 함수 개선**: 새 메시지 추가 시 해당 메시지로 `block: 'start'` 스크롤

### 구현 단계

#### Step 1: 스페이서 추가
```jsx
{/* Messages */}
<div className="space-y-4">
  {messages.map(renderMessage)}
</div>

{/* 스페이서: 마지막 컴포넌트가 헤더 아래로 올라올 수 있도록 */}
<div className="min-h-[50vh]" />

<div ref={messagesEndRef} />
```

#### Step 2: 스크롤 함수 개선
```javascript
// 기존 scrollToBottom 유지 (하위 호환)
const scrollToBottom = useCallback(() => {
  setTimeout(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}, []);

// 새 함수: 특정 메시지로 스크롤 (상단 정렬)
const scrollToMessage = useCallback((messageId: string) => {
  setTimeout(() => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}, []);
```

#### Step 3: renderMessage에 data-message-id 추가
```jsx
// 각 메시지 렌더링 시 data-message-id 속성 추가
case 'hard-filter':
  return (
    <div
      key={message.id}
      data-message-id={message.id}  // 추가
      className={...}
    >
```

#### Step 4: addMessage 후 scrollToMessage 호출
```javascript
// 예: 하드필터 다음 질문 표시
const msgId = addMessage({
  role: 'system',
  componentType: 'hard-filter',
  // ...
});
scrollToMessage(msgId);
```

---

## 수정 파일 목록

1. **`app/recommend-v2/[categoryKey]/page.tsx`**
   - 스페이서 div 추가
   - `scrollToMessage` 함수 추가
   - `renderMessage`에 `data-message-id` 속성 추가
   - 주요 스크롤 호출 지점에서 `scrollToMessage` 사용

---

## 예상 결과

| 구분 | Before | After |
|------|--------|-------|
| 새 컴포넌트 위치 | 화면 하단 | 헤더 바로 아래 |
| 스크롤 방향 | 아래로 | 위로 (새 컴포넌트가 상단에) |
| 사용자 경험 | 스크롤 필요 | 바로 확인 가능 |
