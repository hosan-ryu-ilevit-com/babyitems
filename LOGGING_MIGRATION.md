# 로깅 시스템 마이그레이션 가이드

## 📋 변경 사항 요약

### 기존 구조 (문제점)
```
daily_logs 테이블
├─ date (TEXT) - Primary Key
└─ events (JSONB[]) - 하루 동안의 모든 이벤트를 하나의 배열에 저장
   ❌ Row 크기 무제한 증가
   ❌ 수천 개의 이벤트가 하나의 row에 누적
   ❌ 쿼리 성능 저하 및 타임아웃
   ❌ 데이터베이스 과부하
```

### 새로운 구조 (해결책)
```
event_logs 테이블
├─ id (BIGSERIAL) - Primary Key
├─ session_id (TEXT) - 인덱스
├─ event_type (TEXT) - 인덱스
├─ timestamp (TIMESTAMPTZ) - 인덱스
├─ page, button_label, ip, user_agent (TEXT)
├─ phone, utm_campaign (TEXT) - 인덱스
└─ event_data (JSONB) - 추가 데이터
   ✅ 각 이벤트가 개별 row
   ✅ 확장 가능하고 안정적
   ✅ 빠른 쿼리 성능
   ✅ 인덱스로 최적화
```

## 🚀 적용 단계

### Step 1: Supabase에 새 테이블 생성

Supabase SQL Editor에서 실행:

```sql
-- 새로운 이벤트 로그 테이블
CREATE TABLE event_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  page TEXT,
  button_label TEXT,
  ip TEXT,
  user_agent TEXT,
  phone TEXT,
  utm_campaign TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 성능 인덱스
CREATE INDEX idx_event_logs_session_id ON event_logs(session_id);
CREATE INDEX idx_event_logs_timestamp ON event_logs(timestamp DESC);
CREATE INDEX idx_event_logs_event_type ON event_logs(event_type);
CREATE INDEX idx_event_logs_utm_campaign ON event_logs(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX idx_event_logs_date ON event_logs(DATE(timestamp));

-- 자동 정리 함수 (선택사항)
CREATE OR REPLACE FUNCTION cleanup_old_event_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM event_logs
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

### Step 2: 코드 변경사항 확인

변경된 파일:
1. ✅ `lib/logging/logger.ts` - 개별 row 저장 방식으로 변경
2. ✅ `lib/logging/query.ts` - 새로운 쿼리 유틸리티 (NEW)
3. ✅ `app/api/admin/stats/route.ts` - 새 테이블에서 데이터 조회
4. ✅ `lib/supabase/client.ts` - Supabase 활성화 (DISABLED = false)

### Step 3: 서버 재시작

```bash
# 개발 서버 재시작
npm run dev
```

### Step 4: 테스트

```bash
# 어드민 페이지 접속
open http://localhost:3000/admin

# 로그 확인
curl -X GET http://localhost:3000/api/admin/stats \
  -H "x-admin-password: 1545"
```

## 📊 성능 비교

| 항목 | 기존 (daily_logs) | 신규 (event_logs) |
|------|-------------------|-------------------|
| Row 크기 | 무제한 증가 (수MB) | 고정 (~1KB) |
| 쿼리 속도 | 느림 (타임아웃) | 빠름 (< 100ms) |
| 확장성 | 불가능 | 무제한 |
| 인덱스 | 제한적 | 완전 지원 |
| 유지보수 | 어려움 | 쉬움 |

## 🔧 유지보수

### 오래된 로그 삭제 (30일 이상)

```bash
# API 호출
curl -X POST http://localhost:3000/api/admin/cleanup-logs \
  -H "x-admin-password: 1545" \
  -H "Content-Type: application/json" \
  -d '{"action":"cleanup","daysToKeep":30}'
```

또는 Supabase에서 직접:

```sql
-- 수동 실행
SELECT cleanup_old_event_logs();

-- 또는 직접 삭제
DELETE FROM event_logs
WHERE timestamp < NOW() - INTERVAL '30 days';
```

### Cron Job 설정 (자동 정리)

Supabase Dashboard → Database → Cron Jobs:

```sql
-- 매일 자동 정리 (선택사항)
SELECT cron.schedule(
  'cleanup-old-logs',
  '0 2 * * *',  -- 매일 오전 2시
  $$
  DELETE FROM event_logs
  WHERE timestamp < NOW() - INTERVAL '30 days';
  $$
);
```

## 🗄️ 기존 데이터 마이그레이션 (선택사항)

기존 `daily_logs` 데이터를 보존하려면:

```sql
-- 기존 데이터를 새 테이블로 복사
INSERT INTO event_logs (
  session_id,
  event_type,
  timestamp,
  page,
  button_label,
  ip,
  user_agent,
  phone,
  utm_campaign,
  event_data
)
SELECT
  (event->>'sessionId')::TEXT,
  (event->>'eventType')::TEXT,
  (event->>'timestamp')::TIMESTAMPTZ,
  event->>'page',
  event->>'buttonLabel',
  event->>'ip',
  event->>'userAgent',
  event->>'phone',
  event->>'utmCampaign',
  event
FROM daily_logs,
LATERAL jsonb_array_elements(events) AS event;

-- 확인
SELECT COUNT(*) FROM event_logs;
```

## ⚠️ 주의사항

1. **테이블 생성 필수**: Supabase에 `event_logs` 테이블이 없으면 로깅 실패
2. **인덱스 중요**: 성능을 위해 인덱스 반드시 생성
3. **정기 정리**: 30일 이상 된 로그는 정기적으로 삭제 권장
4. **기존 테이블**: `daily_logs`, `daily_logs_v2`는 마이그레이션 후 삭제 가능

## 🎯 다음 단계

- [x] 새 테이블 구조 생성
- [x] 코드 마이그레이션
- [x] Supabase에 테이블 생성
- [x] 서버 재시작 및 테스트
- [x] 기존 데이터 마이그레이션 (6,483개 이벤트 완료)
- [x] 어드민 페이지 상세 로그 탭 구현
- [ ] 자동 정리 Cron Job 설정 (선택)
- [ ] 기존 테이블 삭제 (나중에 - daily_logs, daily_logs_v2)

## 📞 문제 발생 시

1. Supabase 대시보드에서 `event_logs` 테이블 존재 확인
2. 인덱스가 제대로 생성되었는지 확인
3. 서버 로그에서 에러 메시지 확인
4. 필요시 Supabase 재시작 (Pause → Resume)

---

**마이그레이션 완료 후 기존 테이블 정리:**

```sql
-- 나중에 실행 (충분히 테스트 후)
DROP TABLE IF EXISTS daily_logs;
DROP TABLE IF EXISTS daily_logs_v2;
```
