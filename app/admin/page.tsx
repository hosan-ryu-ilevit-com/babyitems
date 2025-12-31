'use client';

import { useState } from 'react';
import type { SessionSummary, CampaignFunnelStats, V2FunnelStats, CategoryAnalytics, V2ProductRecommendationRanking, V2NewFlowFunnelStats } from '@/types/logging';
import { ChatCircleDots, Lightning } from '@phosphor-icons/react/dist/ssr';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_dates, _setDates] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [expandedRecommendation, setExpandedRecommendation] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([]); // 전체 날짜 세션

  // Main Flow (Priority) 퍼널 통계
  const [campaigns, setCampaigns] = useState<CampaignFunnelStats[]>([]);
  const [availableCampaigns, setAvailableCampaigns] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [funnelLoading, setFunnelLoading] = useState(false);

  // V2 Flow (Category) 퍼널 통계 - Legacy
  const [v2Campaigns, setV2Campaigns] = useState<V2FunnelStats[]>([]);
  const [selectedV2Campaign, setSelectedV2Campaign] = useState<string>('all');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_categoryAnalytics, setCategoryAnalytics] = useState<CategoryAnalytics[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_v2ProductRankings, setV2ProductRankings] = useState<V2ProductRecommendationRanking[]>([]);

  // V2 New Flow (recommend-v2 with hard filters, balance game)
  const [v2NewFlowCampaigns, setV2NewFlowCampaigns] = useState<V2NewFlowFunnelStats[]>([]);
  const [selectedV2NewFlowCampaign, setSelectedV2NewFlowCampaign] = useState<string>('all');

  // Flow 선택 (V2 New가 메인)
  const [selectedFlow, setSelectedFlow] = useState<'v2new' | 'v2' | 'main'>('v2new');

  // 액션 로그 필터
  const [filterUtm, setFilterUtm] = useState<string>('all'); // 'all' | 'none' | 캠페인명
  const [filterCompleted, setFilterCompleted] = useState<string>('all'); // 'all' | 'completed' | 'incomplete'
  const [filterDetail, setFilterDetail] = useState<string>(''); // 자연어 검색 필터
  const [filterPage, setFilterPage] = useState<string>('all'); // 'all' | 페이지명 (home, result, etc.)
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [phoneWithCountCopied, setPhoneWithCountCopied] = useState(false);
  const [sortBy, setSortBy] = useState<'time' | 'eventCount'>('time'); // 정렬 기준

  // 추가 입력 섹션 상태
  const [isUserInputExpanded, setIsUserInputExpanded] = useState(false);

  // 리텐션 대시보드 상태
  const [isRetentionExpanded, setIsRetentionExpanded] = useState(false);
  const [retentionPeriod, setRetentionPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [retentionCriteria, setRetentionCriteria] = useState<'access' | 'completed'>('access');

  // 비밀번호 검증
  const handleLogin = () => {
    if (password === '1545') {
      setIsAuthenticated(true);
      setError('');
      // 퍼널 통계 및 상세 로그 가져오기
      fetchFunnelStats();
      fetchDetailedLogs(30); // 최근 30일
    } else {
      setError('비밀번호가 올바르지 않습니다.');
    }
  };

  // 상세 로그 가져오기 (event_logs 테이블 사용)
  const fetchDetailedLogs = async (days: number = 30) => {
    setLoading(true);
    try {
      console.log(`[Admin] Fetching detailed logs (${days} days)`);
      const response = await fetch(`/api/admin/logs?days=${days}`, {
        headers: {
          'x-admin-password': '1545',
        },
      });
      const data = await response.json();

      if (response.ok) {
        console.log(`[Admin] Loaded ${data.totalSessions} sessions, ${data.totalEvents} events`);
        setSessions(data.sessions || []);
        setAllSessions(data.sessions || []); // 필터링용 원본 데이터
        setSelectedDate('all'); // 전체 보기로 초기화
      } else {
        setError('로그를 불러오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('[Admin] Failed to fetch logs:', error);
      setError('로그를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // UTM 퍼널 통계 가져오기
  const fetchFunnelStats = async () => {
    setFunnelLoading(true);
    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          'x-admin-password': '1545',
        },
      });
      const data = await response.json();

      if (response.ok) {
        // Main Flow data
        setCampaigns(data.mainFlow?.campaigns || []);

        // V2 Flow data (legacy)
        setV2Campaigns(data.v2Flow?.campaigns || []);
        setCategoryAnalytics(data.v2Flow?.categoryAnalytics || []);
        setV2ProductRankings(data.v2Flow?.productRecommendationRankings || []);

        // V2 New Flow data (recommend-v2)
        setV2NewFlowCampaigns(data.v2NewFlow?.campaigns || []);

        // Available campaigns (shared)
        setAvailableCampaigns(data.availableCampaigns || []);
        setSelectedCampaign(data.availableCampaigns?.[0] || 'all');
        setSelectedV2Campaign(data.availableCampaigns?.[0] || 'all');
        setSelectedV2NewFlowCampaign(data.availableCampaigns?.[0] || 'all');
      }
    } catch (error) {
      console.error('Failed to fetch funnel stats:', error);
    } finally {
      setFunnelLoading(false);
    }
  };


  // 로그 새로고침
  const handleRefreshLogs = () => {
    fetchDetailedLogs(30); // 최근 30일 다시 로드
  };

  // 이벤트 타입 한글 변환
  const getEventTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      page_view: '페이지 뷰',
      button_click: '버튼 클릭',
      user_input: '사용자 입력',
      ai_response: 'AI 응답',
      recommendation_received: '추천 결과',
      product_chat_message: '상품 채팅',
      favorite_added: '찜 추가',
      favorite_removed: '찜 제거',
      favorites_compare_clicked: '찜 비교하기',
      comparison_chat_message: '비교 채팅',
      comparison_product_action: '비교표 액션',
      // V2 Flow events
      category_selected: '카테고리 선택',
      anchor_product_selected: '앵커 제품 선택',
      anchor_product_changed: '앵커 제품 변경',
      tag_selected: '태그 선택',
      custom_tag_created: '커스텀 태그 생성',
      result_v2_received: 'V2 추천 결과',
      result_v2_regenerated: 'V2 재추천',
      // V2 Flow (new) events
      v2_page_view: 'V2 페이지뷰',
      v2_subcategory_selected: '하위카테고리 선택',
      v2_hard_filter_answer: '하드필터 답변',
      v2_hard_filter_custom_input: '하드필터 직접입력',
      v2_hard_filter_completed: '하드필터 완료',
      v2_checkpoint_viewed: '체크포인트',
      v2_balance_selection: '밸런스 선택',
      v2_balance_skipped: '밸런스 스킵',
      v2_balance_completed: '밸런스 완료',
      v2_negative_toggle: '피할 단점',
      v2_negative_completed: '단점 완료',
      v2_budget_changed: '예산 변경',
      v2_budget_preset_clicked: '예산 프리셋',
      v2_recommendation_requested: '추천 요청',
      v2_recommendation_received: 'V2 추천 결과',
      v2_step_back: '이전 단계',
      // 🆕 새로운 기능 로깅 이벤트
      ai_helper_clicked: '💜 AI 도움 요청',
      example_question_clicked: '💡 예시 질문 클릭',
      example_question_applied: '✅ AI 추천 적용',
      review_tab_opened: '📖 리뷰 탭 열람',
      criteria_detail_viewed: '🔎 체감속성 상세',
      // 직접 입력 & 추가 질문 로깅
      direct_input_button_clicked: '✏️ 직접 추가 클릭',
      direct_input_registered: '📝 직접 입력 등록',
      followup_question_answered: '💬 추가 질문 응답',
      followup_question_other_input: '✍️ 추가 질문 직접입력',
      final_natural_input_submitted: '📋 마지막 자연어 입력',
      skip_to_recommendation_clicked: '⏭️ 건너뛰기',
      recommend_with_natural_input_clicked: '🎯 자연어 추천받기',
      // 결과 채팅 로깅
      result_chat_message: '💬 결과 채팅',
      result_chat_full_history: '📜 채팅 전체 내역',
    };
    return labels[type] || type;
  };

  // 페이지 이름 한글 변환
  const getPageLabel = (page?: string): string => {
    const labels: Record<string, string> = {
      home: '홈',
      ranking: '랭킹',
      'chat/structured': '구조화 챗',
      'chat/open': '자유 챗',
      result: '결과',
      compare: '비교',
      // V2 Flow pages
      categories: '카테고리',
      anchor: '앵커 선택',
      tags: '태그 선택',
      'result-v2': 'V2 결과',
    };
    return page ? labels[page] || page : '-';
  };

  // 시간 포맷팅
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 날짜+시간 포맷팅
  const formatDateTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(/\. /g, '/').replace('.', '');
  };

  // 체크박스 토글
  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  // 세션 삭제
  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('이 세션을 삭제하시겠습니까?')) {
      return;
    }

    try {
      console.log(`[Admin] Deleting session: ${sessionId}`);

      const response = await fetch(
        `/api/admin/logs?sessionId=${sessionId}`,
        {
          method: 'DELETE',
          headers: {
            'x-admin-password': '1545',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`[Admin] Deleted ${data.deletedCount} events`);

        // 삭제 성공 시 로그 다시 불러오기
        await fetchDetailedLogs(30);

        // 선택 목록에서 제거
        const newSelected = new Set(selectedSessions);
        newSelected.delete(sessionId);
        setSelectedSessions(newSelected);
      } else {
        setError('세션 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('[Admin] Delete error:', error);
      setError('세션 삭제 중 오류가 발생했습니다.');
    }
  };

  // 선택된 세션 일괄 삭제
  const handleDeleteSelectedSessions = async () => {
    if (selectedSessions.size === 0) {
      alert('삭제할 세션을 선택해주세요.');
      return;
    }

    if (!window.confirm(`선택한 ${selectedSessions.size}개의 세션을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      console.log(`[Admin] Batch deleting ${selectedSessions.size} sessions`);

      // 각 세션 삭제 요청
      const deletePromises = Array.from(selectedSessions).map(sessionId => {
        return fetch(`/api/admin/logs?sessionId=${sessionId}`, {
          method: 'DELETE',
          headers: {
            'x-admin-password': '1545',
          },
        });
      });

      await Promise.all(deletePromises);
      console.log('[Admin] Batch delete completed');

      // 삭제 성공 시 로그 다시 불러오기
      await fetchDetailedLogs(30);
      setSelectedSessions(new Set());
    } catch (error) {
      console.error('[Admin] Batch delete error:', error);
      setError('세션 삭제 중 오류가 발생했습니다.');
    }
  };

  // 선택된 세션의 phone 번호를 엑셀 컬럼 형식으로 복사
  const copyPhoneNumbers = async () => {
    // 선택된 세션이 있으면 선택된 것만, 없으면 필터된 전체
    const targetSessions = selectedSessions.size > 0
      ? filteredSessions.filter(s => selectedSessions.has(s.sessionId))
      : filteredSessions;

    const phoneNumbers = targetSessions
      .map(session => session.phone)
      .filter(Boolean); // phone이 있는 세션만

    if (phoneNumbers.length === 0) {
      alert('전화번호가 있는 세션이 없습니다.');
      return;
    }

    const textToCopy = phoneNumbers.join('\n'); // 줄바꿈으로 구분

    try {
      await navigator.clipboard.writeText(textToCopy);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2000); // 2초 후 상태 리셋
    } catch (error) {
      console.error('복사 실패:', error);
      alert('복사에 실패했습니다.');
    }
  };

  // 선택된 세션의 phone + 이벤트 개수를 CSV 형식으로 복사
  const copyPhoneWithEventCount = async () => {
    // 선택된 세션이 있으면 선택된 것만, 없으면 필터된 전체
    const targetSessions = selectedSessions.size > 0
      ? filteredSessions.filter(s => selectedSessions.has(s.sessionId))
      : filteredSessions;

    const sessionsWithPhone = targetSessions.filter(s => s.phone); // phone이 있는 세션만

    if (sessionsWithPhone.length === 0) {
      alert('전화번호가 있는 세션이 없습니다.');
      return;
    }

    // phone + 탭 + 이벤트 개수 형식으로 변환
    const textToCopy = sessionsWithPhone
      .map(session => `${session.phone}\t${session.events.length}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setPhoneWithCountCopied(true);
      setTimeout(() => setPhoneWithCountCopied(false), 2000); // 2초 후 상태 리셋
    } catch (error) {
      console.error('복사 실패:', error);
      alert('복사에 실패했습니다.');
    }
  };

  // IP 주소 포맷팅
  const formatIpAddress = (ip: string | undefined) => {
    if (!ip) return 'unknown';
    if (ip === '211.53.92.162') {
      return (
        <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
          [레브잇 테크]
        </span>
      );
    }
    if (ip === '::1' || ip === '::ffff:172.16.230.123') {
      return (
        <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
          [로컬 테스트]
        </span>
      );
    }
    return ip;
  };

  // 추천 방식에 따른 태그 렌더링 (여러 개 가능)
  const renderRecommendationTags = (session: SessionSummary) => {
    const methods = session.recommendationMethods || [];
    if (methods.length === 0) return null;

    return (
      <>
        {methods.includes('quick') && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-white border-2 border-gray-300 text-gray-700 font-medium">
            <Lightning weight="fill" className="w-4 h-4" />
            바로 추천받기
          </span>
        )}
        {methods.includes('chat') && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-gray-900 text-white font-medium">
            <ChatCircleDots weight="fill" className="w-4 h-4" />
            채팅하고 추천받기
          </span>
        )}
        {methods.includes('v2') && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-indigo-600 text-white font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
            </svg>
            카테고리 추천
          </span>
        )}
      </>
    );
  };

  // 추천받은 상품 표시 (Main Flow + V2 Flow 모두 지원)
  const renderRecommendedProducts = (session: SessionSummary) => {
    // 디버깅: recommendation_received 이벤트 확인
    const allRecEvents = session.events.filter(e => e.eventType === 'recommendation_received');
    if (allRecEvents.length > 0) {
      console.log('🔍 Session has recommendation_received events:', {
        sessionId: session.sessionId.slice(0, 8),
        count: allRecEvents.length,
        firstEvent: {
          hasRecommendations: !!allRecEvents[0].recommendations,
          hasFullReport: !!allRecEvents[0].recommendations?.fullReport,
          hasArray: !!allRecEvents[0].recommendations?.fullReport?.recommendations,
          arrayLength: allRecEvents[0].recommendations?.fullReport?.recommendations?.length,
          fullStructure: JSON.stringify(allRecEvents[0].recommendations, null, 2)
        }
      });
    }

    // Main Flow: recommendation_received 이벤트 찾기
    const mainFlowEvent = session.events.find(
      event => event.eventType === 'recommendation_received' && event.recommendations?.fullReport?.recommendations && !event.recommendations?.isV2Flow
    );

    // V2 Flow (통합): recommendation_received 이벤트에서 isV2Flow 체크 OR result_v2_received 이벤트 찾기
    const v2FlowEventFromResult = session.events.find(
      event => event.eventType === 'recommendation_received' && event.recommendations?.isV2Flow && event.recommendations?.fullReport?.recommendations
    );

    const v2FlowEvent = session.events.find(
      event => event.eventType === 'result_v2_received' && event.resultV2Data?.recommendedProductIds
    );

    let products: Array<{ id: string; title?: string }> = [];
    let flowType: 'main' | 'v2' | null = null;

    if (mainFlowEvent?.recommendations?.fullReport?.recommendations) {
      // Main Flow (Priority 기반)
      const recommendations = mainFlowEvent.recommendations.fullReport.recommendations;
      products = recommendations.map((rec: { productId: string; productTitle?: string }) => ({
        id: rec.productId,
        title: rec.productTitle
      }));
      flowType = 'main';
    } else if (v2FlowEventFromResult?.recommendations?.fullReport?.recommendations) {
      // V2 Flow (/result 페이지 사용, recommendation_received 이벤트)
      const recommendations = v2FlowEventFromResult.recommendations.fullReport.recommendations;
      products = recommendations.map((rec: { productId: string; productTitle?: string }) => ({
        id: rec.productId,
        title: rec.productTitle
      }));
      flowType = 'v2';
    } else if (v2FlowEvent?.resultV2Data?.recommendedProductIds) {
      // V2 Flow (/result-v2 페이지 사용, result_v2_received 이벤트)
      const productIds = v2FlowEvent.resultV2Data.recommendedProductIds;
      products = productIds.map((id: string) => ({
        id,
        title: undefined // V2 Flow는 제품 ID만 있음
      }));
      flowType = 'v2';
    }

    // 백업: result_v2_received 이벤트가 없어도 result-v2 페이지뷰가 있으면 최소 정보 표시
    if (products.length === 0) {
      const hasResultV2PageView = session.events.some(e => e.eventType === 'page_view' && e.page === 'result-v2');

      if (hasResultV2PageView) {
        // V2 플로우를 시도했지만 result_v2_received 이벤트가 없는 경우
        // 태그 선택 이벤트에서 정보 추출
        const tagEvents = session.events.filter(e => e.eventType === 'tag_selected' && e.tagData);
        const categoryEvent = session.events.find(e => e.eventType === 'category_selected' && e.categoryData);

        if (tagEvents.length > 0 || categoryEvent) {
          return (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                🔍 V2 플로우 시도됨
                <span className="text-xs font-normal text-yellow-600">(추천 결과 미로깅)</span>
              </p>
              {categoryEvent && (
                <div className="text-xs text-gray-600 mb-2">
                  📂 카테고리: <span className="font-medium">{categoryEvent.categoryData?.categoryLabel}</span>
                </div>
              )}
              {tagEvents.length > 0 && (
                <div className="text-xs text-gray-600">
                  <p className="font-medium mb-1">선택한 태그 ({tagEvents.length}개):</p>
                  <ul className="space-y-0.5 pl-3">
                    {tagEvents.slice(0, 5).map((event, idx) => (
                      <li key={idx} className="text-gray-500">
                        • {event.tagData?.tagText?.substring(0, 50)}
                        {event.tagData?.tagText && event.tagData.tagText.length > 50 ? '...' : ''}
                      </li>
                    ))}
                    {tagEvents.length > 5 && (
                      <li className="text-gray-400 italic">+ {tagEvents.length - 5}개 더</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        }
      }

      return null;
    }

    // 🆕 하이라이트 리뷰 찾기 (v2_recommendation_received 이벤트에서)
    const highlightEvents = session.events.filter(
      event => event.eventType === 'v2_recommendation_received' && event.v2FlowData?.recommendation?.highlightedReviews
    );

    // 가장 최근 하이라이트 리뷰 이벤트 사용
    const highlightedReviews = highlightEvents.length > 0
      ? highlightEvents[highlightEvents.length - 1].v2FlowData?.recommendation?.highlightedReviews
      : undefined;

    // 🆕 마크다운 볼드 파싱 함수
    const parseHighlightedText = (text: string) => {
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return (
            <strong key={idx} className="bg-amber-200 text-amber-900 px-0.5 rounded">
              {boldText}
            </strong>
          );
        }
        return <span key={idx}>{part}</span>;
      });
    };

    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          🎯 추천받은 상품:
          <span className="text-xs font-normal text-gray-500">
            ({flowType === 'main' ? 'Priority' : 'Category'})
          </span>
        </p>
        <div className="space-y-3">
          {products.map((product, idx) => {
            // 해당 제품의 하이라이트 리뷰 찾기
            const productHighlights = highlightedReviews?.find(
              h => h.pcode === product.id
            );

            return (
              <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                {/* 제품 헤더 */}
                <div className="flex items-start gap-2 mb-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 ${
                    idx === 0 ? 'bg-yellow-100 text-yellow-800' :
                    idx === 1 ? 'bg-gray-100 text-gray-700' :
                    'bg-orange-100 text-orange-700'
                  } font-bold text-xs`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium text-sm leading-tight">
                      {product.title || product.id}
                    </p>
                  </div>
                </div>

                {/* 🆕 하이라이트 리뷰 섹션 */}
                {productHighlights && productHighlights.reviews && productHighlights.reviews.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50 rounded p-2">
                    <h4 className="text-xs font-semibold text-amber-900 mb-2 flex items-center gap-1">
                      ✨ 하이라이트 리뷰
                      <span className="text-amber-700 font-normal">({productHighlights.reviews.length}개)</span>
                    </h4>
                    <div className="space-y-2">
                      {productHighlights.reviews.slice(0, 3).map((review: {
                        criteriaId: string;
                        criteriaName: string;
                        originalText: string;
                        excerpt: string;
                      }, rIdx: number) => (
                        <div key={rIdx} className="bg-white rounded p-2 border border-amber-200">
                          <div className="text-xs text-amber-700 font-medium mb-1">
                            {review.criteriaName}
                          </div>
                          <div className="text-xs text-gray-700 leading-relaxed">
                            {parseHighlightedText(review.excerpt)}
                          </div>
                        </div>
                      ))}
                      {productHighlights.reviews.length > 3 && (
                        <p className="text-xs text-amber-700 italic">
                          + {productHighlights.reviews.length - 3}개 더
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 버튼 라벨 포맷팅 (실제 채팅 디자인 반영)
  const formatButtonLabel = (label: string) => {
    // 중요도 버튼
    if (label.includes('중요도: 중요함')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-200 text-gray-900 text-xs font-medium rounded-full">
            중요함
          </span>
          <span className="text-gray-500 text-xs">(중요도)</span>
        </span>
      );
    }
    if (label.includes('중요도: 보통')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-gray-900 text-xs font-medium rounded-full">
            보통
          </span>
          <span className="text-gray-500 text-xs">(중요도)</span>
        </span>
      );
    }
    if (label.includes('중요도: 중요하지 않음')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            중요하지 않음
          </span>
          <span className="text-gray-500 text-xs">(중요도)</span>
        </span>
      );
    }

    // 넘어가기 버튼
    if (label.includes('넘어가기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-200 text-gray-900 text-xs font-medium rounded-full">
            넘어가기
          </span>
        </span>
      );
    }

    // 없어요 버튼
    if (label.includes('없어요')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-200 text-gray-900 text-xs font-medium rounded-full">
            없어요
          </span>
        </span>
      );
    }

    // 바로 추천받기 버튼 - 하얀 버튼 스타일 (Priority 페이지)
    if (label === '바로 추천받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-white border-2 border-gray-300 text-gray-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5">
            <Lightning weight="fill" className="w-3.5 h-3.5" />
            바로 추천받기
          </span>
        </span>
      );
    }

    // 채팅으로 더 자세히 추천받기 버튼 - 검은 버튼 스타일 (Priority 페이지)
    if (label === '채팅으로 더 자세히 추천받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5">
            <ChatCircleDots weight="fill" className="w-3.5 h-3.5" />
            채팅으로 더 자세히
          </span>
        </span>
      );
    }

    // 추천 받기 버튼 (Chat 페이지)
    if (label === '추천 받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">
            추천 받기
          </span>
        </span>
      );
    }

    // 1분만에 추천받기 버튼 (Home 페이지)
    if (label.includes('1분만에 추천받기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-linear-to-r from-gray-900 to-gray-700 text-white text-xs font-semibold rounded-xl">
            💬 1분만에 추천받기
          </span>
        </span>
      );
    }

    // 대표상품 랭킹보기 버튼 (Home 페이지)
    if (label.includes('대표상품 랭킹보기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-xl">
            📊 대표상품 랭킹보기
          </span>
        </span>
      );
    }

    // 다른 카테고리 추천받기 버튼 (Result 페이지)
    if (label === '다른 카테고리 추천받기') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-white border border-gray-300 text-gray-900 text-xs font-semibold rounded-xl shadow-sm">
            다른 카테고리 추천받기
          </span>
        </span>
      );
    }

    // {카테고리명} 다시 추천받기 버튼 (Result 페이지)
    if (label.includes('다시 추천받기')) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl shadow-md">
            {label}
          </span>
        </span>
      );
    }

    // 기타 버튼
    return <span className="text-blue-600 text-xs">{label}</span>;
  };

  // 세션 필터링 (AND 조건) - 테스트 IP는 필터링하지 않음 (하단 세션 리스트에 표시)
  const filteredSessions = sessions.filter(session => {
    // UTM 필터
    let utmMatch = true;
    if (filterUtm === 'none') {
      utmMatch = !session.utmCampaign;
    } else if (filterUtm !== 'all') {
      utmMatch = session.utmCampaign === filterUtm;
    }

    // 완료 상태 필터
    let completedMatch = true;
    if (filterCompleted === 'completed') {
      completedMatch = session.completed === true;
    } else if (filterCompleted === 'incomplete') {
      completedMatch = session.completed === false;
    }

    // 상세 필터 (자연어 검색)
    let detailMatch = true;
    if (filterDetail.trim() !== '') {
      const searchTerm = filterDetail.toLowerCase().trim();
      detailMatch = session.events.some(event => {
        const eventTexts = [
          event.buttonLabel,
          event.page ? `페이지: ${event.page}` : null,
          event.eventType ? `이벤트: ${event.eventType}` : null,
          event.userInput ? `입력: ${event.userInput.slice(0, 30)}...` : null,
        ].filter(Boolean);
        return eventTexts.some(text => text && text.toLowerCase().includes(searchTerm));
      });
    }

    // 페이지 필터
    let pageMatch = true;
    if (filterPage !== 'all') {
      pageMatch = session.journey.includes(filterPage);
    }

    return utmMatch && completedMatch && detailMatch && pageMatch;
  }).sort((a, b) => {
    // 정렬 적용
    if (sortBy === 'eventCount') {
      // 이벤트 개수 내림차순 (많은 것부터)
      return b.events.length - a.events.length;
    } else {
      // 시간순 내림차순 (최신이 위) - 기본값
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    }
  });

  // 세션에서 사용 가능한 UTM 캠페인 목록 추출
  const availableUtmCampaigns = Array.from(
    new Set(
      sessions
        .map(s => s.utmCampaign)
        .filter(Boolean)
    )
  ).sort();

  // 세션에서 사용 가능한 페이지 목록 추출
  const availablePages = Array.from(
    new Set(
      sessions.flatMap(s => s.journey)
    )
  ).sort();

  // 사용자 추가 입력 수집 (테스트 데이터 제외)
  const collectUserInputs = () => {
    const TEST_IPS = ['::1', '127.0.0.1', '211.53.92.162', '::ffff:172.16.230.123']; // 로컬 + 레브잇테크
    const TEST_PHONES = ['01088143142'];

    const userInputs: Array<{
      sessionId: string;
      timestamp: string;
      userInput: string;
      buttonLabel?: string;
      phone?: string;
      utmCampaign?: string;
    }> = [];

    allSessions.forEach(session => {
      // 테스트 IP 필터링
      if (session.ip && TEST_IPS.includes(session.ip)) {
        return;
      }

      // 테스트 전화번호 필터링
      if (session.phone && TEST_PHONES.includes(session.phone)) {
        return;
      }

      session.events.forEach(event => {
        if (event.userInput) {
          userInputs.push({
            sessionId: session.sessionId,
            timestamp: event.timestamp,
            userInput: event.userInput,
            buttonLabel: event.buttonLabel,
            phone: session.phone,
            utmCampaign: session.utmCampaign,
          });
        }
      });
    });

    // 최신순으로 정렬
    return userInputs.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // 리텐션 데이터 계산
  const calculateRetention = () => {
    const TEST_IPS = ['::1', '127.0.0.1', '211.53.92.162', '::ffff:172.16.230.123'];
    const TEST_PHONES = ['01088143142'];

    // 필터링된 세션
    const filteredSessions = allSessions.filter(session => {
      if (session.ip && TEST_IPS.includes(session.ip)) return false;
      if (session.phone && TEST_PHONES.includes(session.phone)) return false;
      return true;
    });

    // 사용자 식별 (phone > ip 우선순위)
    const getUserId = (session: SessionSummary) => session.phone || session.ip || session.sessionId;

    // 기간별 그룹핑 함수
    const getPeriodKey = (dateStr: string, period: 'day' | 'week' | 'month') => {
      const date = new Date(dateStr);
      if (period === 'day') {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (period === 'week') {
        // 주의 시작일 (월요일 기준)
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date.setDate(diff));
        return weekStart.toISOString().split('T')[0];
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      }
    };

    // 사용자별 방문 기록 (기간별)
    const userVisits = new Map<string, Map<string, { accessed: boolean; completed: boolean }>>();

    filteredSessions.forEach(session => {
      const userId = getUserId(session);
      const periodKey = getPeriodKey(session.firstSeen, retentionPeriod);

      if (!userVisits.has(userId)) {
        userVisits.set(userId, new Map());
      }

      const visits = userVisits.get(userId)!;
      if (!visits.has(periodKey)) {
        visits.set(periodKey, { accessed: false, completed: false });
      }

      const periodData = visits.get(periodKey)!;
      periodData.accessed = true;
      if (session.completed) {
        periodData.completed = true;
      }
    });

    // 코호트 분석: 각 기간별 신규 사용자와 재방문율 계산
    const periods = Array.from(new Set(
      filteredSessions.map(s => getPeriodKey(s.firstSeen, retentionPeriod))
    )).sort();

    // 각 사용자의 첫 방문 기간
    const userFirstPeriod = new Map<string, string>();
    userVisits.forEach((visits, userId) => {
      const sortedPeriods = Array.from(visits.keys()).sort();
      if (sortedPeriods.length > 0) {
        userFirstPeriod.set(userId, sortedPeriods[0]);
      }
    });

    // 코호트 데이터 계산
    interface CohortData {
      period: string;
      newUsers: number;
      retention: number[]; // 각 후속 기간별 재방문율
    }

    const cohorts: CohortData[] = [];

    periods.forEach((cohortPeriod, cohortIndex) => {
      // 해당 기간에 첫 방문한 사용자들
      const cohortUsers = Array.from(userFirstPeriod.entries())
        .filter(([, firstPeriod]) => firstPeriod === cohortPeriod)
        .map(([userId]) => userId);

      const newUsers = cohortUsers.length;
      const retention: number[] = [];

      // 후속 기간별 재방문율 계산 (최대 6기간)
      for (let i = 1; i <= Math.min(6, periods.length - cohortIndex - 1); i++) {
        const targetPeriod = periods[cohortIndex + i];
        if (!targetPeriod) break;

        const returnedUsers = cohortUsers.filter(userId => {
          const visits = userVisits.get(userId);
          if (!visits) return false;
          const periodData = visits.get(targetPeriod);
          if (!periodData) return false;
          return retentionCriteria === 'access' ? periodData.accessed : periodData.completed;
        }).length;

        retention.push(newUsers > 0 ? Math.round((returnedUsers / newUsers) * 100) : 0);
      }

      cohorts.push({ period: cohortPeriod, newUsers, retention });
    });

    // 최근 10개 코호트만 표시
    return cohorts.slice(-10);
  };

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">🛍️ 관리자 로그인</h1>
          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호를 입력하세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-colors"
            >
              로그인
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 화면
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">아기용품 어드민</h1>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/admin/upload'}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                상품 추가
              </button>
              <button
                onClick={() => setIsAuthenticated(false)}
                className="text-gray-600 hover:text-gray-800"
              >
                로그아웃
              </button>
            </div>
          </div>

          {/* UTM 퍼널 분석 */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">📊 UTM 퍼널 분석</h2>
              <div className="flex items-center gap-4">
                {/* Flow 선택 (V2 New가 기본) */}
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setSelectedFlow('v2new')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedFlow === 'v2new'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    V2 New (추천v2)
                  </button>
                  <button
                    onClick={() => setSelectedFlow('v2')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedFlow === 'v2'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    V2 Legacy
                  </button>
                  <button
                    onClick={() => setSelectedFlow('main')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedFlow === 'main'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Main (Priority)
                  </button>
                </div>
                {/* UTM 캠페인 선택 */}
                {availableCampaigns.length > 0 && (
                  <select
                    value={selectedFlow === 'v2new' ? selectedV2NewFlowCampaign : selectedFlow === 'v2' ? selectedV2Campaign : selectedCampaign}
                    onChange={(e) => {
                      if (selectedFlow === 'v2new') setSelectedV2NewFlowCampaign(e.target.value);
                      else if (selectedFlow === 'v2') setSelectedV2Campaign(e.target.value);
                      else setSelectedCampaign(e.target.value);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableCampaigns.map(campaign => (
                      <option key={campaign} value={campaign}>
                        {campaign === 'all' ? '전체' : campaign === 'none' ? 'UTM 없음' : campaign}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {funnelLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-600">퍼널 통계 로딩 중...</p>
              </div>
            ) : selectedFlow === 'v2new' ? (
              // V2 New Flow (recommend-v2) Display
              v2NewFlowCampaigns.length > 0 ? (
                (() => {
                  const currentCampaign = v2NewFlowCampaigns.find(c => c.utmCampaign === selectedV2NewFlowCampaign);
                  if (!currentCampaign) return null;

                  const funnelSteps = [
                    { label: '홈 페이지뷰', data: currentCampaign.funnel.homePageViews, color: 'bg-blue-500' },
                    { label: '📋 버튼 → categories-v2', data: currentCampaign.funnel.categoriesV2Entry, color: 'bg-blue-400', isEntryPath: true },
                    { label: 'recommend-v2 진입 (총합)', data: currentCampaign.funnel.recommendV2Entry, color: 'bg-indigo-500' },
                    { label: '하드필터 완료', data: currentCampaign.funnel.hardFilterCompleted, color: 'bg-purple-400' },
                    { label: '체크포인트 확인', data: currentCampaign.funnel.checkpointViewed, color: 'bg-pink-500' },
                    { label: '밸런스 게임 완료', data: currentCampaign.funnel.balanceCompleted, color: 'bg-pink-400' },
                    { label: '피할 단점 완료', data: currentCampaign.funnel.negativeCompleted, color: 'bg-rose-500' },
                    { label: '예산 설정', data: currentCampaign.funnel.budgetConfirmed, color: 'bg-rose-400' },
                    { label: '추천 완료', data: currentCampaign.funnel.recommendationReceived, color: 'bg-green-500' },
                  ];

                  return (
                    <div className="space-y-6">
                      {/* 전체 세션 수 */}
                      <div className="bg-emerald-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">총 세션 수</p>
                        <p className="text-3xl font-bold text-emerald-600">{currentCampaign.totalSessions}</p>
                      </div>

                      {/* 9단계 퍼널 시각화 (진입경로 분리) */}
                      <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-4">V2 New 사용자 여정 퍼널 (9단계)</h3>
                        <div className="space-y-3">
                          {funnelSteps.map((step, index) => (
                            <div key={index}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-gray-700">{index + 1}️⃣ {step.label}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-medium text-gray-500">{step.data.percentage}%</span>
                                  <span className="text-lg font-bold text-gray-900">{step.data.count}</span>
                                </div>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-3">
                                <div className={`${step.color} h-3 rounded-full transition-all`} style={{ width: `${step.data.percentage}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 단계별 소요 시간 */}
                      {currentCampaign.avgTimePerStep && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                          <h3 className="text-base font-bold text-gray-900 mb-4">단계별 평균 소요 시간</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {currentCampaign.avgTimePerStep.hardFilterToCheckpoint > 0 && (
                              <div className="bg-purple-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">하드필터</p>
                                <p className="text-lg font-bold text-purple-600">{currentCampaign.avgTimePerStep.hardFilterToCheckpoint}초</p>
                              </div>
                            )}
                            {currentCampaign.avgTimePerStep.checkpointToBalance > 0 && (
                              <div className="bg-pink-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">밸런스 게임</p>
                                <p className="text-lg font-bold text-pink-600">{currentCampaign.avgTimePerStep.checkpointToBalance}초</p>
                              </div>
                            )}
                            {currentCampaign.avgTimePerStep.balanceToNegative > 0 && (
                              <div className="bg-rose-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">피할 단점</p>
                                <p className="text-lg font-bold text-rose-600">{currentCampaign.avgTimePerStep.balanceToNegative}초</p>
                              </div>
                            )}
                            {currentCampaign.avgTimePerStep.totalTime > 0 && (
                              <div className="bg-green-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">총 소요시간</p>
                                <p className="text-lg font-bold text-green-600">{currentCampaign.avgTimePerStep.totalTime}초</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 결과 페이지 액션 */}
                      {currentCampaign.resultPageActions && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                          <h3 className="text-base font-bold text-gray-900 mb-4">결과 페이지 액션</h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">제품 모달 열기</p>
                              <p className="text-lg font-bold text-gray-700">{currentCampaign.resultPageActions.productModalOpened.total} ({currentCampaign.resultPageActions.productModalOpened.unique}명)</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">다나와 가격 클릭</p>
                              <p className="text-lg font-bold text-gray-700">{currentCampaign.resultPageActions.danawaPriceClicked.total} ({currentCampaign.resultPageActions.danawaPriceClicked.unique}명)</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">최저가 구매 클릭</p>
                              <p className="text-lg font-bold text-gray-700">{currentCampaign.resultPageActions.lowestPriceClicked.total} ({currentCampaign.resultPageActions.lowestPriceClicked.unique}명)</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">찜하기</p>
                              <p className="text-lg font-bold text-gray-700">{currentCampaign.resultPageActions.favoriteToggled.total} ({currentCampaign.resultPageActions.favoriteToggled.unique}명)</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 커스텀 입력 통계 */}
                      {currentCampaign.customInputUsage && (currentCampaign.customInputUsage.hardFilterCustomInput.total > 0 || currentCampaign.customInputUsage.budgetDirectInput.total > 0) && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                          <h3 className="text-base font-bold text-gray-900 mb-4">커스텀 입력 현황</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-blue-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">하드필터 직접 입력</p>
                              <p className="text-lg font-bold text-blue-600">{currentCampaign.customInputUsage.hardFilterCustomInput.total}회 ({currentCampaign.customInputUsage.hardFilterCustomInput.unique}명)</p>
                            </div>
                            <div className="bg-orange-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500">예산 직접 입력</p>
                              <p className="text-lg font-bold text-orange-600">{currentCampaign.customInputUsage.budgetDirectInput.total}회 ({currentCampaign.customInputUsage.budgetDirectInput.unique}명)</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AI 도움 요청 통계 */}
                      {currentCampaign.aiHelperUsage && currentCampaign.aiHelperUsage.totalRequests.total > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                          <h3 className="text-base font-bold text-gray-900 mb-4">💜 AI 도움 요청 현황</h3>

                          {/* 전체 요청 수 */}
                          <div className="bg-purple-50 rounded-lg p-4 mb-4">
                            <p className="text-sm text-gray-600 mb-1">전체 AI 도움 요청 수</p>
                            <p className="text-2xl font-bold text-purple-600">
                              {currentCampaign.aiHelperUsage.totalRequests.total}회
                              <span className="text-base font-normal text-gray-600 ml-2">
                                ({currentCampaign.aiHelperUsage.totalRequests.unique}명)
                              </span>
                            </p>
                          </div>

                          {/* 단계별 요청 수 */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500 mb-1">하드필터</p>
                              <p className="text-lg font-bold text-gray-700">
                                {currentCampaign.aiHelperUsage.hardFilterHelp.total}회
                              </p>
                              <p className="text-xs text-gray-500">
                                {currentCampaign.aiHelperUsage.hardFilterHelp.unique}명
                              </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500 mb-1">밸런스 게임</p>
                              <p className="text-lg font-bold text-gray-700">
                                {currentCampaign.aiHelperUsage.balanceGameHelp.total}회
                              </p>
                              <p className="text-xs text-gray-500">
                                {currentCampaign.aiHelperUsage.balanceGameHelp.unique}명
                              </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500 mb-1">단점 필터</p>
                              <p className="text-lg font-bold text-gray-700">
                                {currentCampaign.aiHelperUsage.negativeHelp.total}회
                              </p>
                              <p className="text-xs text-gray-500">
                                {currentCampaign.aiHelperUsage.negativeHelp.unique}명
                              </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500 mb-1">예산 설정</p>
                              <p className="text-lg font-bold text-gray-700">
                                {currentCampaign.aiHelperUsage.budgetHelp.total}회
                              </p>
                              <p className="text-xs text-gray-500">
                                {currentCampaign.aiHelperUsage.budgetHelp.unique}명
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">V2 New Flow 데이터가 없습니다.</p>
                </div>
              )
            ) : selectedFlow === 'v2' ? (
              // V2 Flow (Category-based) Display - Legacy
              v2Campaigns.length > 0 ? (
                (() => {
                  const currentV2Campaign = v2Campaigns.find(c => c.utmCampaign === selectedV2Campaign);
                  if (!currentV2Campaign) return null;

                  return (
                    <div className="space-y-6">
                      {/* 전체 세션 수 */}
                      <div className="bg-indigo-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">총 세션 수</p>
                        <p className="text-3xl font-bold text-indigo-600">{currentV2Campaign.totalSessions}</p>
                      </div>

                      {/* V2 퍼널 시각화 - 7단계 */}
                      <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-base font-bold text-gray-900 mb-4">V2 사용자 여정 퍼널 (카테고리 기반)</h3>
                        <div className="space-y-3">
                          {/* 1. 홈 페이지뷰 */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-700">1️⃣ 홈 페이지뷰</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-gray-500">{currentV2Campaign.funnel.homePageViews.percentage}%</span>
                                <span className="text-lg font-bold text-gray-900">{currentV2Campaign.funnel.homePageViews.count}</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: '100%' }} />
                            </div>
                          </div>

                          {/* 2. 카테고리 선택 */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-700">2️⃣ 카테고리 진입</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-gray-500">{currentV2Campaign.funnel.categoriesEntry.percentage}%</span>
                                <span className="text-lg font-bold text-gray-900">{currentV2Campaign.funnel.categoriesEntry.count}</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${currentV2Campaign.funnel.categoriesEntry.percentage}%` }} />
                            </div>
                          </div>

                          {/* 3. 태그 선택 페이지 */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-700">3️⃣ 태그 선택 (추천)</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-gray-500">{currentV2Campaign.funnel.tagsEntry.percentage}%</span>
                                <span className="text-lg font-bold text-gray-900">{currentV2Campaign.funnel.tagsEntry.count}</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${currentV2Campaign.funnel.tagsEntry.percentage}%` }} />
                            </div>
                          </div>

                          {/* 4. V2 추천 결과 수신 (완료) */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-700">4️⃣ 추천 완료</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-gray-500">{currentV2Campaign.funnel.resultV2Received.percentage}%</span>
                                <span className="text-lg font-bold text-gray-900">{currentV2Campaign.funnel.resultV2Received.count}</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div className="bg-pink-500 h-3 rounded-full transition-all" style={{ width: `${currentV2Campaign.funnel.resultV2Received.percentage}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">V2 퍼널 데이터가 없습니다.</p>
                </div>
              )
            ) : campaigns.length > 0 ? (
              // Main Flow (Priority-based) Display
              (() => {
                const currentCampaign = campaigns.find(c => c.utmCampaign === selectedCampaign);
                if (!currentCampaign) return null;

                return (
                  <div className="space-y-6">
                    {/* 전체 세션 수 */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">총 세션 수</p>
                      <p className="text-3xl font-bold text-blue-600">{currentCampaign.totalSessions}</p>
                    </div>

                    {/* 퍼널 시각화 - 상세 8단계 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-base font-bold text-gray-900 mb-4">사용자 여정 퍼널 (상세)</h3>
                      <div className="space-y-3">
                        {/* 1. 홈 페이지뷰 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">1️⃣ 홈 페이지뷰</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-500">{currentCampaign.funnel.homePageViews.percentage}%</span>
                              <span className="text-lg font-bold text-gray-900">{currentCampaign.funnel.homePageViews.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: '100%' }} />
                          </div>
                        </div>

                        {/* 2. Priority 진입 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">2️⃣ Priority 진입</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-500">{currentCampaign.funnel.priorityEntry.percentage}%</span>
                              <span className="text-lg font-bold text-gray-900">{currentCampaign.funnel.priorityEntry.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${currentCampaign.funnel.priorityEntry.percentage}%` }} />
                          </div>
                        </div>

                        {/* 3. Step 1: 장점 태그 선택 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">3️⃣ Step 1: 장점 태그 선택</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-500">{currentCampaign.funnel.prosTagsSelected.percentage}%</span>
                              <span className="text-lg font-bold text-gray-900">{currentCampaign.funnel.prosTagsSelected.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-yellow-500 h-3 rounded-full transition-all" style={{ width: `${currentCampaign.funnel.prosTagsSelected.percentage}%` }} />
                          </div>
                        </div>

                        {/* 4. Step 2: 단점 태그 선택 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">4️⃣ Step 2: 단점 태그 선택</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-500">{currentCampaign.funnel.consTagsSelected.percentage}%</span>
                              <span className="text-lg font-bold text-gray-900">{currentCampaign.funnel.consTagsSelected.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-orange-500 h-3 rounded-full transition-all" style={{ width: `${currentCampaign.funnel.consTagsSelected.percentage}%` }} />
                          </div>
                        </div>

                        {/* 5. Step 3: 추가 고려사항 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">5️⃣ Step 3: 추가 고려사항</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-500">{currentCampaign.funnel.additionalSelected.percentage}%</span>
                              <span className="text-lg font-bold text-gray-900">{currentCampaign.funnel.additionalSelected.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-pink-500 h-3 rounded-full transition-all" style={{ width: `${currentCampaign.funnel.additionalSelected.percentage}%` }} />
                          </div>
                        </div>

                        {/* 6. Step 4: 예산 선택 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">6️⃣ Step 4: 예산 선택</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-500">{currentCampaign.funnel.budgetSelected.percentage}%</span>
                              <span className="text-lg font-bold text-gray-900">{currentCampaign.funnel.budgetSelected.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${currentCampaign.funnel.budgetSelected.percentage}%` }} />
                          </div>
                        </div>

                        {/* 7. Best 3 추천 완료 (강조) */}
                        <div className="border-2 border-purple-300 bg-purple-50 rounded-lg p-4 mt-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-purple-900">7️⃣ 🎯 Best 3 추천 완료</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-purple-700">{currentCampaign.funnel.recommendationReceived.percentage}%</span>
                              <span className="text-lg font-bold text-purple-600">{currentCampaign.funnel.recommendationReceived.count}</span>
                            </div>
                          </div>
                          <div className="w-full bg-purple-200 rounded-full h-3">
                            <div className="bg-purple-600 h-3 rounded-full transition-all" style={{ width: `${currentCampaign.funnel.recommendationReceived.percentage}%` }} />
                          </div>
                        </div>

                        {/* ⚠️ 예산 선택 후 추천 못 받은 사람 */}
                        {(() => {
                          const budgetCount = currentCampaign.funnel.budgetSelected.count;
                          const recommendationCount = currentCampaign.funnel.recommendationReceived.count;
                          const lostUsers = budgetCount - recommendationCount;
                          const lostPercentage = budgetCount > 0 ? Math.round((lostUsers / budgetCount) * 100) : 0;

                          if (lostUsers > 0) {
                            return (
                              <div className="border-2 border-red-300 bg-red-50 rounded-lg p-4 mt-2">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-red-900">⚠️ 예산 선택 후 추천 못 받은 사람</span>
                                    <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded">이탈</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-red-700">{lostPercentage}% 이탈</span>
                                    <span className="text-lg font-bold text-red-600">{lostUsers}명</span>
                                  </div>
                                </div>
                                <p className="text-xs text-red-700 mt-2">
                                  예산 선택 후 추천 API 로딩 중 이탈 (네트워크 오류, 로딩 타임아웃, 앱 종료 등)
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* 단계별 이탈률 요약 */}
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-bold text-gray-800 mb-3">📉 단계별 이탈률 분석</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {(() => {
                            const steps = [
                              { label: '홈→Priority', from: currentCampaign.funnel.homePageViews.count, to: currentCampaign.funnel.priorityEntry.count },
                              { label: 'Priority→Step1', from: currentCampaign.funnel.priorityEntry.count, to: currentCampaign.funnel.prosTagsSelected.count },
                              { label: 'Step1→Step2', from: currentCampaign.funnel.prosTagsSelected.count, to: currentCampaign.funnel.consTagsSelected.count },
                              { label: 'Step2→Step3', from: currentCampaign.funnel.consTagsSelected.count, to: currentCampaign.funnel.additionalSelected.count },
                              { label: 'Step3→Step4', from: currentCampaign.funnel.additionalSelected.count, to: currentCampaign.funnel.budgetSelected.count },
                              { label: 'Step4→결과', from: currentCampaign.funnel.budgetSelected.count, to: currentCampaign.funnel.recommendationReceived.count },
                            ];

                            return steps.map((step, idx) => {
                              const dropCount = step.from - step.to;
                              const dropRate = step.from > 0 ? Math.round((dropCount / step.from) * 100) : 0;
                              const isHighDrop = dropRate >= 30; // 30% 이상 이탈 시 경고

                              return (
                                <div key={idx} className={`p-2 rounded ${isHighDrop ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                                  <p className={`font-semibold ${isHighDrop ? 'text-red-700' : 'text-gray-700'}`}>
                                    {step.label}
                                  </p>
                                  <p className={`text-lg font-bold ${isHighDrop ? 'text-red-600' : 'text-gray-900'}`}>
                                    -{dropRate}%
                                  </p>
                                  <p className="text-gray-500">({dropCount}명)</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Pre-Recommendation Actions */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-base font-bold text-gray-900 mb-4">추천 이전 액션</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">📖</div>
                          <p className="text-xs text-gray-600 mb-1">가이드 열기</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.preRecommendationActions.guideOpened.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.preRecommendationActions.guideOpened.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">📊</div>
                          <p className="text-xs text-gray-600 mb-1">랭킹 탭 클릭</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.preRecommendationActions.rankingTabClicked.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.preRecommendationActions.rankingTabClicked.unique}명</p>
                        </div>
                      </div>
                    </div>

                    {/* Post-Recommendation Actions */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-base font-bold text-gray-900 mb-4">추천 이후 액션</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">💬</div>
                          <p className="text-xs text-gray-600 mb-1">제품 질문하기</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.productChatClicked.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.productChatClicked.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">📝</div>
                          <p className="text-xs text-gray-600 mb-1">추천이유보기</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.recommendationReasonViewed.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.recommendationReasonViewed.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">🎯</div>
                          <p className="text-xs text-gray-600 mb-1">내 구매기준 보기</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.purchaseCriteriaViewed.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.purchaseCriteriaViewed.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">🛒</div>
                          <p className="text-xs text-gray-600 mb-1">쿠팡에서보기</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.coupangClicked.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.coupangClicked.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">💰</div>
                          <p className="text-xs text-gray-600 mb-1">최저가보기</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.lowestPriceClicked.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.lowestPriceClicked.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">📊</div>
                          <p className="text-xs text-gray-600 mb-1">상세비교표 탭</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.comparisonTabClicked.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.comparisonTabClicked.unique}명</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">🔍</div>
                          <p className="text-xs text-gray-600 mb-1">제품 비교질문</p>
                          <p className="text-2xl font-bold text-gray-900">{currentCampaign.funnel.postRecommendationActions.comparisonChatUsed.total}회</p>
                          <p className="text-xs text-gray-500 mt-1">유니크 {currentCampaign.funnel.postRecommendationActions.comparisonChatUsed.unique}명</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600">퍼널 데이터가 없습니다.</p>
              </div>
            )}
          </div>

          {/* 리텐션 대시보드 */}
          <div className="border-t pt-4 mt-4">
            <button
              onClick={() => setIsRetentionExpanded(!isRetentionExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">📈</span>
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-gray-800">리텐션 분석</h2>
                  <p className="text-xs text-gray-600">코호트별 재방문율 분석 (Day/Week/Month)</p>
                </div>
              </div>
              <svg
                className={`w-5 h-5 text-gray-600 transition-transform ${isRetentionExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isRetentionExpanded && (
              <div className="mt-4">
                {/* 필터 컨트롤 */}
                <div className="flex items-center justify-end gap-4 mb-4">
                  {/* 재방문 기준 토글 */}
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setRetentionCriteria('access')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        retentionCriteria === 'access'
                          ? 'bg-white text-gray-800 shadow-sm font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      단순 접속
                    </button>
                    <button
                      onClick={() => setRetentionCriteria('completed')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        retentionCriteria === 'completed'
                          ? 'bg-white text-gray-800 shadow-sm font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      추천 완료
                    </button>
                  </div>
                  {/* 기간 선택 */}
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setRetentionPeriod('day')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        retentionPeriod === 'day'
                          ? 'bg-white text-gray-800 shadow-sm font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Day
                    </button>
                    <button
                      onClick={() => setRetentionPeriod('week')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        retentionPeriod === 'week'
                          ? 'bg-white text-gray-800 shadow-sm font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Week
                    </button>
                    <button
                      onClick={() => setRetentionPeriod('month')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        retentionPeriod === 'month'
                          ? 'bg-white text-gray-800 shadow-sm font-medium'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Month
                    </button>
                  </div>
                </div>

                {/* 코호트 리텐션 테이블 */}
                {(() => {
                  const cohorts = calculateRetention();
                  const periodLabel = retentionPeriod === 'day' ? '일' : retentionPeriod === 'week' ? '주' : '월';
                  const maxRetentionColumns = Math.max(...cohorts.map(c => c.retention.length), 0);

                  if (cohorts.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        리텐션 데이터가 없습니다.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-3 py-2 text-left font-semibold text-gray-700 border">코호트</th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-700 border">신규</th>
                            {Array.from({ length: maxRetentionColumns }, (_, i) => (
                              <th key={i} className="px-3 py-2 text-center font-semibold text-gray-700 border">
                                +{i + 1}{periodLabel}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cohorts.map((cohort, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 border text-gray-700 font-medium whitespace-nowrap">
                                {cohort.period}
                              </td>
                              <td className="px-3 py-2 border text-center text-gray-800 font-semibold">
                                {cohort.newUsers}
                              </td>
                              {Array.from({ length: maxRetentionColumns }, (_, i) => {
                                const rate = cohort.retention[i];
                                const hasData = rate !== undefined;
                                const bgColor = hasData
                                  ? rate >= 30 ? 'bg-green-100 text-green-800'
                                    : rate >= 15 ? 'bg-yellow-100 text-yellow-800'
                                    : rate > 0 ? 'bg-orange-100 text-orange-800'
                                    : 'bg-gray-100 text-gray-500'
                                  : '';
                                return (
                                  <td
                                    key={i}
                                    className={`px-3 py-2 border text-center ${bgColor}`}
                                  >
                                    {hasData ? `${rate}%` : '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs text-gray-500">
                        * 사용자 식별: 전화번호 &gt; IP 주소 우선
                        {retentionCriteria === 'access' ? ' / 재방문 기준: 단순 접속' : ' / 재방문 기준: 추천 완료'}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 사용자 추가 입력 섹션 */}
          <div className="border-t pt-4 mt-4">
            <button
              onClick={() => setIsUserInputExpanded(!isUserInputExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">✍️</span>
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-gray-800">사용자 추가 입력</h2>
                  <p className="text-xs text-gray-600">Priority 페이지 Step 5에서 입력한 추가 요청사항</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-purple-500 text-white rounded-full text-sm font-medium">
                  {collectUserInputs().length}건
                </span>
                <svg
                  className={`w-5 h-5 text-gray-600 transition-transform ${isUserInputExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isUserInputExpanded && (
              <div className="mt-4 overflow-x-auto">
                {collectUserInputs().length > 0 ? (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 border">날짜/시간</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 border">입력 내용</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 border">버튼</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 border">UTM</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 border">전화번호</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectUserInputs().map((input, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 border text-gray-600 whitespace-nowrap">
                            {formatDateTime(input.timestamp)}
                          </td>
                          <td className="px-4 py-2 border">
                            <div className="bg-purple-50 border-l-4 border-purple-500 p-2 rounded">
                              <p className="text-gray-800">{input.userInput}</p>
                            </div>
                          </td>
                          <td className="px-4 py-2 border text-gray-600 text-xs">
                            {input.buttonLabel || '-'}
                          </td>
                          <td className="px-4 py-2 border">
                            {input.utmCampaign ? (
                              <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                {input.utmCampaign}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 border text-gray-600 text-xs">
                            {input.phone || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center text-gray-500 py-8">추가 입력 데이터가 없습니다.</p>
                )}
              </div>
            )}
          </div>

          {/* 로그 헤더 및 새로고침 */}
          <div className="flex gap-4 items-center mb-4">
            <span className="font-semibold">상세 로그</span>
            <span className="text-gray-600">
              총 {sessions.length}개 세션 (최근 30일)
            </span>
            <button
              onClick={handleRefreshLogs}
              disabled={loading}
              className="ml-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              새로고침
            </button>
          </div>

          {/* 필터 컨트롤 */}
          <div className="flex gap-4 items-center mb-4 pb-4 border-b">
            <label className="font-semibold">🔍 필터:</label>

            {/* UTM 캠페인 필터 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">UTM:</label>
              <select
                value={filterUtm}
                onChange={(e) => setFilterUtm(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">전체</option>
                <option value="none">UTM 없음</option>
                {availableUtmCampaigns.map(campaign => (
                  <option key={campaign} value={campaign}>
                    {campaign}
                  </option>
                ))}
              </select>
            </div>

            {/* 완료 상태 필터 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">완료 여부:</label>
              <select
                value={filterCompleted}
                onChange={(e) => setFilterCompleted(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">전체</option>
                <option value="completed">완료</option>
                <option value="incomplete">미완료</option>
              </select>
            </div>

            {/* 상세 필터 (자연어 검색) */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">검색:</label>
              <input
                type="text"
                value={filterDetail}
                onChange={(e) => setFilterDetail(e.target.value)}
                placeholder="예: 제품 카드 클릭"
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>

            {/* 페이지 필터 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">페이지:</label>
              <select
                value={filterPage}
                onChange={(e) => setFilterPage(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">전체</option>
                {availablePages.map((page, idx) => (
                  <option key={idx} value={page}>
                    {page}
                  </option>
                ))}
              </select>
            </div>

            {/* 정렬 선택 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">정렬:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'time' | 'eventCount')}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="time">시간순 (최신)</option>
                <option value="eventCount">이벤트 개수순</option>
              </select>
            </div>

            {/* 필터 결과 표시 */}
            <span className="text-sm text-gray-600">
              {filteredSessions.length}개 표시 {filteredSessions.length !== sessions.length && `(${sessions.length}개 중)`}
            </span>

            {/* 필터 초기화 버튼 */}
            {(filterUtm !== 'all' || filterCompleted !== 'all' || filterDetail !== '' || filterPage !== 'all') && (
              <button
                onClick={() => {
                  setFilterUtm('all');
                  setFilterCompleted('all');
                  setFilterDetail('');
                  setFilterPage('all');
                }}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                필터 초기화
              </button>
            )}

            {/* Phone 복사 버튼 */}
            <button
              onClick={copyPhoneNumbers}
              className="ml-auto px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              title={selectedSessions.size > 0 ? "선택된 세션의 전화번호를 복사합니다" : "필터된 세션의 전화번호를 복사합니다"}
            >
              {phoneCopied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  복사완료!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  📱 Phone 복사 {selectedSessions.size > 0 && `(${selectedSessions.size}개)`}
                </>
              )}
            </button>

            {/* Phone + 이벤트 개수 복사 버튼 */}
            <button
              onClick={copyPhoneWithEventCount}
              className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
              title={selectedSessions.size > 0 ? "선택된 세션의 전화번호와 이벤트 개수를 복사합니다 (CSV)" : "필터된 세션의 전화번호와 이벤트 개수를 복사합니다 (CSV)"}
            >
              {phoneWithCountCopied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  복사완료!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v8a2 2 0 01-2 2h-2a2 2 0 01-2-2V9a2 2 0 012-2z" />
                  </svg>
                  📊 Phone + 개수 {selectedSessions.size > 0 && `(${selectedSessions.size}개)`}
                </>
              )}
            </button>
          </div>

          {/* 일괄 작업 컨트롤 */}
          {!loading && filteredSessions.length > 0 && (
            <div className="flex gap-3 items-center pt-4 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSessions.size === filteredSessions.length && filteredSessions.length > 0}
                  onChange={() => {
                    if (selectedSessions.size === filteredSessions.length) {
                      setSelectedSessions(new Set());
                    } else {
                      setSelectedSessions(new Set(filteredSessions.map(s => s.sessionId)));
                    }
                  }}
                  className="w-4 h-4 cursor-pointer"
                />
                <span className="text-sm font-medium">전체 선택 (필터된 세션)</span>
              </label>
              {selectedSessions.size > 0 && (
                <>
                  <span className="text-sm text-gray-600">
                    {selectedSessions.size}개 선택됨
                  </span>
                  <button
                    onClick={handleDeleteSelectedSessions}
                    className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    선택 삭제
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-600">로딩 중...</p>
          </div>
        )}

        {/* 세션 목록 */}
        {!loading && filteredSessions.length === 0 && sessions.length > 0 && (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-gray-600">필터 조건에 맞는 세션이 없습니다.</p>
            <button
              onClick={() => {
                setFilterUtm('all');
                setFilterCompleted('all');
                setFilterDetail('all');
                setFilterPage('all');
              }}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              필터 초기화
            </button>
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-gray-600">해당 날짜에 기록된 로그가 없습니다.</p>
          </div>
        )}

        {!loading && filteredSessions.length > 0 && (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <div
                key={session.sessionId}
                className="bg-white rounded-lg overflow-hidden"
              >
                {/* 세션 헤더 */}
                <div className="p-4 bg-gray-50">
                  <div className="flex gap-3 items-start">
                    {/* 체크박스 */}
                    <input
                      type="checkbox"
                      checked={selectedSessions.has(session.sessionId)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSessionSelection(session.sessionId);
                      }}
                      className="mt-1 w-4 h-4 cursor-pointer shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* 세션 정보 */}
                    <div
                      className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        setExpandedSession(
                          expandedSession === session.sessionId
                            ? null
                            : session.sessionId
                        )
                      }
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {session.phone && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 font-bold text-sm rounded">
                            📱 {session.phone}
                          </span>
                        )}
                        {session.utmCampaign && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 font-bold text-sm rounded">
                            🏷️ {session.utmCampaign}
                          </span>
                        )}
                        <p className="font-mono text-sm text-gray-600">
                          Session: {session.sessionId.slice(0, 8)}...
                        </p>
                      </div>
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        <span>IP: {formatIpAddress(session.ip)}</span>
                        <span>|</span>
                        <span>시작: {formatTime(session.firstSeen)}</span>
                        <span>|</span>
                        <span>종료: {formatTime(session.lastSeen)}</span>
                      </p>
                      <div className="mt-2">
                        <p className="text-sm font-semibold text-gray-700">
                          이동 경로:
                        </p>
                        <p className="text-sm text-gray-600">
                          {session.journey.map(getPageLabel).join(' → ')}
                        </p>
                      </div>
                      {renderRecommendedProducts(session)}
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {renderRecommendationTags(session)}
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                              session.completed
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {session.completed ? '✅ 완료' : '⏳ 미완료'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {session.events.length}개 이벤트
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.sessionId);
                        }}
                        className="px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
                        title="세션 삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 세션 상세 (확장 시) */}
                {expandedSession === session.sessionId && (
                  <div className="p-4 border-t">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">시간</th>
                          <th className="px-3 py-2 text-left">속성</th>
                          <th className="px-3 py-2 text-left">이벤트</th>
                          <th className="px-3 py-2 text-left">페이지</th>
                          <th className="px-3 py-2 text-left">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.events.map((event, idx) => {
                          // 디버깅: AI 응답이 있는지 확인
                          if (event.eventType === 'ai_response') {
                            console.log('AI Response Event:', event);
                          }
                          return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatTime(event.timestamp)}
                            </td>
                            <td className="px-3 py-2">
                              {event.attribute ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-base">{event.attributeIcon}</span>
                                  <span className="text-xs text-gray-700 font-medium">
                                    {event.attribute}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {getEventTypeLabel(event.eventType)}
                            </td>
                            <td className="px-3 py-2">
                              {getPageLabel(event.page)}
                            </td>
                            <td className="px-3 py-2">
                              {event.buttonLabel && (
                                <div className="mb-2">{formatButtonLabel(event.buttonLabel)}</div>
                              )}
                              {event.userInput && (
                                <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded text-sm mb-2">
                                  <span className="text-green-700 font-semibold">사용자</span>
                                  <p className="text-gray-800 mt-1">{event.userInput}</p>
                                </div>
                              )}
                              {event.eventType === 'ai_response' && 'aiResponse' in event && (
                                <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm mb-2">
                                  <span className="text-blue-700 font-semibold">AI</span>
                                  <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                    {event.aiResponse || '(내용 없음)'}
                                  </p>
                                </div>
                              )}
                              {/* result_chat_message 이벤트 타입에서 AI 응답 표시 */}
                              {event.eventType === 'result_chat_message' && (() => {
                                const aiResp = 'aiResponse' in event ? event.aiResponse : null;
                                const metaAiResp = 'metadata' in event && event.metadata
                                  ? (event.metadata as Record<string, unknown>).aiResponse
                                  : null;
                                const displayResponse = aiResp || metaAiResp;
                                if (!displayResponse) return null;
                                return (
                                  <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm mb-2">
                                    <span className="text-blue-700 font-semibold">AI</span>
                                    <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                      {String(displayResponse)}
                                    </p>
                                  </div>
                                );
                              })()}
                              {event.eventType === 'product_chat_message' && 'chatData' in event && event.chatData && (
                                <div className="space-y-2">
                                  <div className="bg-gray-50 p-2 rounded text-xs">
                                    <p className="font-semibold text-gray-700 mb-1">
                                      📦 제품: {event.chatData.productTitle || event.chatData.productId}
                                    </p>
                                    {event.chatData.isInitialMessage && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                        초기 메시지
                                      </span>
                                    )}
                                    {event.chatData.isExampleQuestion && (
                                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium ml-1">
                                        예시 질문
                                      </span>
                                    )}
                                  </div>
                                  <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded text-sm">
                                    <span className="text-green-700 font-semibold">사용자</span>
                                    <p className="text-gray-800 mt-1">{event.chatData.userMessage}</p>
                                  </div>
                                  <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm">
                                    <span className="text-blue-700 font-semibold">AI</span>
                                    <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                      {event.chatData.aiResponse}
                                    </p>
                                  </div>
                                  {event.chatData.hasRecommendation && event.chatData.recommendedProductId && (
                                    <div className="bg-purple-50 p-2 rounded text-xs">
                                      <span className="text-purple-700 font-semibold">
                                        🔗 추천 제품: {event.chatData.recommendedProductId}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {event.eventType === 'favorite_added' && 'favoriteData' in event && event.favoriteData && (
                                <div className="bg-pink-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-pink-700 mb-1">
                                    ❤️ 찜 추가: {event.favoriteData.productTitle}
                                  </p>
                                  <p className="text-gray-600">상품 ID: {event.favoriteData.productId}</p>
                                  <p className="text-gray-600">현재 찜 개수: {event.favoriteData.currentFavoritesCount}/3</p>
                                </div>
                              )}
                              {event.eventType === 'favorite_removed' && 'favoriteData' in event && event.favoriteData && (
                                <div className="bg-gray-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-gray-700 mb-1">
                                    💔 찜 제거: {event.favoriteData.productTitle}
                                  </p>
                                  <p className="text-gray-600">상품 ID: {event.favoriteData.productId}</p>
                                  <p className="text-gray-600">현재 찜 개수: {event.favoriteData.currentFavoritesCount}/3</p>
                                </div>
                              )}
                              {event.eventType === 'favorites_compare_clicked' && 'comparisonData' in event && event.comparisonData && (
                                <div className="bg-blue-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-blue-700 mb-1">
                                    🔄 찜 비교하기 클릭 ({event.comparisonData.source === 'home' ? '홈' : '결과'})
                                  </p>
                                  <p className="text-gray-600">비교 제품 수: {event.comparisonData.productIds?.length || 0}개</p>
                                  {event.comparisonData.productIds && (
                                    <p className="text-gray-500 text-xs mt-1">
                                      {event.comparisonData.productIds.join(', ')}
                                    </p>
                                  )}
                                </div>
                              )}
                              {event.eventType === 'comparison_chat_message' && 'comparisonData' in event && event.comparisonData && (
                                <div className="space-y-2">
                                  <div className="bg-gray-50 p-2 rounded text-xs">
                                    <p className="font-semibold text-gray-700 mb-1">
                                      💬 비교 채팅 ({event.comparisonData.source === 'home' ? '홈-비교표' : '결과-비교표'})
                                    </p>
                                    {event.comparisonData.productIds && (
                                      <p className="text-gray-500 text-xs">
                                        비교 중인 제품: {event.comparisonData.productIds.length}개
                                      </p>
                                    )}
                                  </div>
                                  {event.comparisonData.userMessage && (
                                    <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded text-sm">
                                      <span className="text-green-700 font-semibold">사용자</span>
                                      <p className="text-gray-800 mt-1">{event.comparisonData.userMessage}</p>
                                    </div>
                                  )}
                                  {event.comparisonData.aiResponse && (
                                    <div className="bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-sm">
                                      <span className="text-blue-700 font-semibold">AI</span>
                                      <p className="text-gray-800 mt-1 whitespace-pre-wrap">
                                        {event.comparisonData.aiResponse}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                              {event.eventType === 'comparison_product_action' && 'comparisonData' in event && event.comparisonData && (
                                <div className="bg-purple-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-purple-700 mb-1">
                                    {event.comparisonData.actionType === 'coupang_clicked' && '🛒 쿠팡 링크 클릭'}
                                    {event.comparisonData.actionType === 'product_chat_clicked' && '💭 상품 질문하기 클릭'}
                                    {' '}({event.comparisonData.source === 'home' ? '홈-비교표' : '결과-비교표'})
                                  </p>
                                  <p className="text-gray-600">제품: {event.comparisonData.productTitle}</p>
                                  <p className="text-gray-500 text-xs">상품 ID: {event.comparisonData.productId}</p>
                                </div>
                              )}
                              {/* 🆕 AI Helper 버튼 클릭 (보라색 강조) */}
                              {event.eventType === 'ai_helper_clicked' && 'aiHelperData' in event && event.aiHelperData && (
                                <div className="bg-purple-100 border-2 border-purple-400 p-2 rounded text-xs">
                                  <p className="font-bold text-purple-900 mb-1 flex items-center gap-1">
                                    <span className="text-base">💜</span> &quot;뭘 고를지 모르겠어요&quot; 버튼 클릭
                                  </p>
                                  <div className="bg-white p-2 rounded mt-1 space-y-1">
                                    <p className="text-purple-800 font-semibold">질문: &quot;{event.aiHelperData.questionText}&quot;</p>
                                    <p className="text-gray-600">질문 타입: {
                                      event.aiHelperData.questionType === 'hard_filter' ? '🔍 하드필터' :
                                      event.aiHelperData.questionType === 'balance_game' ? '⚖️ 밸런스 게임' :
                                      event.aiHelperData.questionType === 'negative' ? '❌ 단점' :
                                      event.aiHelperData.questionType === 'budget' ? '💰 예산' : event.aiHelperData.questionType
                                    }</p>
                                    <p className="text-gray-600">질문 ID: {event.aiHelperData.questionId}</p>
                                    {event.v2FlowData?.category && (
                                      <p className="text-gray-600">카테고리: {event.v2FlowData.categoryName || event.v2FlowData.category}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* 🆕 예시 질문 클릭 */}
                              {event.eventType === 'example_question_clicked' && 'aiHelperData' in event && event.aiHelperData && (
                                <div className="bg-blue-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-blue-700 mb-1">
                                    💡 예시 질문 클릭
                                  </p>
                                  <div className="bg-white p-2 rounded mt-1">
                                    <p className="text-gray-800 font-medium mb-1">&quot;{event.aiHelperData.exampleText}&quot;</p>
                                    <p className="text-gray-600 text-xs">질문: {event.aiHelperData.questionText}</p>
                                    <p className="text-gray-600 text-xs">질문 타입: {event.aiHelperData.questionType}</p>
                                  </div>
                                </div>
                              )}
                              {/* 🆕 예시 질문 적용 */}
                              {event.eventType === 'example_question_applied' && 'aiHelperData' in event && event.aiHelperData && (
                                <div className="bg-green-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-green-700 mb-1">
                                    ✅ AI 추천 적용됨
                                  </p>
                                  <div className="bg-white p-2 rounded mt-1 space-y-2">
                                    <div>
                                      <p className="text-gray-600 font-medium mb-1">입력한 내용:</p>
                                      <p className="text-gray-800">&quot;{event.aiHelperData.exampleText}&quot;</p>
                                    </div>
                                    {event.aiHelperData.selectedLabels && event.aiHelperData.selectedLabels.length > 0 && (
                                      <div>
                                        <p className="text-gray-600 font-medium mb-1">선택된 옵션 ({event.aiHelperData.selectedLabels.length}개):</p>
                                        {event.aiHelperData.selectedLabels.map((label, i) => (
                                          <p key={i} className="text-gray-700">• {label}</p>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-gray-500 text-xs">질문: {event.aiHelperData.questionText}</p>
                                  </div>
                                </div>
                              )}
                              {/* 🆕 리뷰 탭 열기 */}
                              {event.eventType === 'review_tab_opened' && 'reviewData' in event && event.reviewData && (
                                <div className="bg-amber-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-amber-700 mb-1">
                                    📖 상품 리뷰 탭 열람
                                  </p>
                                  <div className="bg-white p-2 rounded mt-1 space-y-1">
                                    <p className="text-gray-800 font-medium">{event.reviewData.brand} {event.reviewData.productTitle}</p>
                                    <p className="text-gray-600">탭 타입: {
                                      event.reviewData.tabType === 'reviews' ? '📝 전체 리뷰' :
                                      event.reviewData.tabType === 'insights' ? '💡 리뷰 인사이트' :
                                      event.reviewData.tabType === 'real_reviews' ? '✨ 실제 리뷰' : event.reviewData.tabType
                                    }</p>
                                    <p className="text-gray-600">상품 ID: {event.reviewData.pcode}</p>
                                    {event.reviewData.rank && (
                                      <p className="text-gray-600">추천 순위: {event.reviewData.rank}위</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* 🆕 체감속성 상세 보기 */}
                              {event.eventType === 'criteria_detail_viewed' && 'reviewData' in event && event.reviewData && (
                                <div className="bg-teal-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-teal-700 mb-1">
                                    🔎 체감속성 상세 열람
                                  </p>
                                  <div className="bg-white p-2 rounded mt-1 space-y-1">
                                    <p className="text-teal-800 font-bold">{event.reviewData.criteriaName}</p>
                                    <p className="text-gray-600">체감속성 ID: {event.reviewData.criteriaId}</p>
                                    {event.reviewData.mentionCount && (
                                      <p className="text-gray-600">리뷰 언급: {event.reviewData.mentionCount}회</p>
                                    )}
                                    <p className="text-gray-700 text-xs mt-1">{event.reviewData.brand} {event.reviewData.productTitle}</p>
                                  </div>
                                </div>
                              )}
                              {/* V2 Flow Events */}
                              {event.eventType === 'category_selected' && 'categoryData' in event && event.categoryData && (
                                <div className="bg-indigo-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-indigo-700 mb-1">
                                    📂 카테고리 선택: {event.categoryData.categoryLabel}
                                  </p>
                                  <p className="text-gray-600">카테고리 ID: {event.categoryData.category}</p>
                                </div>
                              )}
                              {(event.eventType === 'anchor_product_selected' || event.eventType === 'anchor_product_changed') && 'anchorData' in event && event.anchorData && (
                                <div className="bg-teal-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-teal-700 mb-1">
                                    {event.eventType === 'anchor_product_selected' && '⚓ 앵커 제품 선택'}
                                    {event.eventType === 'anchor_product_changed' && '🔄 앵커 제품 변경'}
                                    {event.anchorData.action === 'search_used' && ' (검색 사용)'}
                                  </p>
                                  <p className="text-gray-700 font-medium">{event.anchorData.brand} {event.anchorData.model || event.anchorData.productTitle}</p>
                                  <p className="text-gray-600">카테고리: {event.anchorData.category}</p>
                                  <p className="text-gray-600">랭킹: {event.anchorData.ranking}위</p>
                                  {event.anchorData.searchKeyword && (
                                    <p className="text-gray-500 mt-1">검색어: &quot;{event.anchorData.searchKeyword}&quot;</p>
                                  )}
                                </div>
                              )}
                              {(event.eventType === 'tag_selected' || event.eventType === 'custom_tag_created') && 'tagData' in event && event.tagData && (
                                <div className={`p-2 rounded text-xs ${
                                  event.tagData.tagType === 'cons' ? 'bg-red-50' : 'bg-green-50'
                                }`}>
                                  <p className={`font-semibold mb-1 ${
                                    event.tagData.tagType === 'cons' ? 'text-red-700' : 'text-green-700'
                                  }`}>
                                    {event.eventType === 'tag_selected' && '🏷️ 태그 선택'}
                                    {event.eventType === 'custom_tag_created' && '✨ 커스텀 태그 생성'}
                                    {event.tagData.isCustom && ' (커스텀)'}
                                  </p>
                                  <p className="text-gray-700 font-medium">&quot;{event.tagData.tagText}&quot;</p>
                                  <p className="text-gray-600">
                                    {event.tagData.tagType === 'pros' ? '장점' : '단점'} 태그 (Step {event.tagData.step})
                                  </p>
                                  {event.tagData.mentionCount && (
                                    <p className="text-gray-500">언급 횟수: {event.tagData.mentionCount}회</p>
                                  )}
                                  {event.tagData.relatedAttributes && event.tagData.relatedAttributes.length > 0 && (
                                    <div className="mt-2 bg-white p-2 rounded">
                                      <p className="text-gray-600 font-medium mb-1">관련 속성:</p>
                                      {event.tagData.relatedAttributes.map((attr, i) => (
                                        <p key={i} className="text-gray-700 text-xs">
                                          • {attr.attribute}: {attr.weight}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {(event.eventType === 'result_v2_received' || event.eventType === 'result_v2_regenerated') && 'resultV2Data' in event && event.resultV2Data && (
                                <div className="space-y-1">
                                  <button
                                    onClick={() => {
                                      const key = `v2-${session.sessionId}-${idx}`;
                                      setExpandedRecommendation(
                                        expandedRecommendation === key ? null : key
                                      );
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 underline text-left font-medium"
                                  >
                                    📋 V2 추천 결과 펼쳐보기 ({event.resultV2Data.recommendedProductIds.length}개 제품)
                                    {event.resultV2Data.isRegeneration && ' (재생성)'}
                                  </button>
                                  {expandedRecommendation === `v2-${session.sessionId}-${idx}` && (
                                    <div className="mt-2 p-4 bg-indigo-50 rounded-lg text-xs space-y-4">
                                      {/* 기본 정보 */}
                                      <div className="bg-white p-3 rounded space-y-2">
                                        <p className="font-bold text-indigo-900">📂 카테고리: {event.resultV2Data.category}</p>
                                        <p className="text-gray-700">⚓ 앵커 제품: {event.resultV2Data.anchorProductId}</p>
                                        {event.resultV2Data.isRegeneration && event.resultV2Data.previousAnchorId && (
                                          <p className="text-gray-600">이전 앵커: {event.resultV2Data.previousAnchorId}</p>
                                        )}
                                        <p className="text-gray-700">💰 예산: {event.resultV2Data.budget}</p>
                                      </div>

                                      {/* 선택된 태그 */}
                                      <div className="bg-white p-3 rounded space-y-2">
                                        <p className="font-bold text-green-700">✅ 선택한 장점 태그 ({event.resultV2Data.selectedProsTags.length}개)</p>
                                        <div className="space-y-1">
                                          {event.resultV2Data.selectedProsTags.map((tag, i) => (
                                            <p key={i} className="text-gray-700">• {tag}</p>
                                          ))}
                                        </div>
                                        {event.resultV2Data.selectedConsTags.length > 0 && (
                                          <>
                                            <p className="font-bold text-red-700 mt-2">❌ 선택한 단점 태그 ({event.resultV2Data.selectedConsTags.length}개)</p>
                                            <div className="space-y-1">
                                              {event.resultV2Data.selectedConsTags.map((tag, i) => (
                                                <p key={i} className="text-gray-700">• {tag}</p>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {/* 추천 결과 */}
                                      <div className="bg-white p-3 rounded space-y-2">
                                        <p className="font-bold text-purple-900">🎯 추천된 제품</p>
                                        {event.resultV2Data.recommendedProductIds.map((productId, i) => (
                                          <div key={i} className="border-l-4 border-purple-500 pl-3 py-1">
                                            <p className="font-semibold text-gray-800">
                                              #{i + 1} {productId}
                                            </p>
                                            {event.resultV2Data?.fitScores && event.resultV2Data.fitScores[i] !== undefined && (
                                              <p className="text-gray-600">Fit Score: {event.resultV2Data.fitScores[i]}점</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* V2 New Flow Events - 하드필터, 밸런스, 단점, 예산, 추천 */}
                              {'v2FlowData' in event && event.v2FlowData && (
                                <>
                                  {/* 하위 카테고리 선택 */}
                                  {event.eventType === 'v2_subcategory_selected' && event.v2FlowData.subCategory && (
                                    <div className="bg-purple-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-purple-700 mb-1">
                                        📁 하위 카테고리 선택
                                      </p>
                                      <p className="text-gray-700 font-medium">
                                        {event.v2FlowData.subCategory.name}
                                        {event.v2FlowData.subCategory.code === '__all__' && ' (전체)'}
                                      </p>
                                      {event.v2FlowData.subCategory.code !== '__all__' && (
                                        <p className="text-gray-500 mt-1">코드: {event.v2FlowData.subCategory.code}</p>
                                      )}
                                    </div>
                                  )}
                                  {/* 하드필터 답변 */}
                                  {event.eventType === 'v2_hard_filter_answer' && event.v2FlowData.hardFilter && (
                                    <div className="bg-blue-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-blue-700 mb-1">
                                        🔍 하드필터 Q{event.v2FlowData.hardFilter.questionIndex + 1}/{event.v2FlowData.hardFilter.totalQuestions}
                                      </p>
                                      <p className="text-gray-700 font-medium mb-1">&quot;{event.v2FlowData.hardFilter.questionText}&quot;</p>
                                      <div className="bg-white p-2 rounded mt-1">
                                        <p className="text-gray-600">선택: {event.v2FlowData.hardFilter.selectedLabels?.join(', ') || '-'}</p>
                                        {event.v2FlowData.hardFilter.productCountAfterFilter !== undefined && (
                                          <p className="text-gray-500 mt-1">필터 후 남은 제품: {event.v2FlowData.hardFilter.productCountAfterFilter}개</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {/* 하드필터 직접 입력 */}
                                  {event.eventType === 'v2_hard_filter_custom_input' && event.v2FlowData.hardFilter && (
                                    <div className="bg-yellow-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-yellow-700 mb-1">
                                        ✏️ 하드필터 직접입력 Q{event.v2FlowData.hardFilter.questionIndex + 1}/{event.v2FlowData.hardFilter.totalQuestions}
                                      </p>
                                      <p className="text-gray-700 font-medium mb-1">&quot;{event.v2FlowData.hardFilter.questionText}&quot;</p>
                                      <div className="bg-white p-2 rounded mt-1">
                                        <p className="text-gray-600">입력: &quot;{event.v2FlowData.hardFilter.customInputText}&quot;</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* 체크포인트 조회 */}
                                  {event.eventType === 'v2_checkpoint_viewed' && (
                                    <div className="bg-emerald-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-emerald-700 mb-1">📊 조건 분석 완료</p>
                                      {event.v2FlowData.checkpoint ? (
                                        <div className="bg-white p-2 rounded mt-1 space-y-1">
                                          <p className="text-gray-700 font-medium">{event.v2FlowData.checkpoint.totalProductCount}개 중 {event.v2FlowData.checkpoint.filteredProductCount}개 후보</p>
                                          {event.v2FlowData.checkpoint.summaryText && (
                                            <p className="text-gray-600">&quot;{event.v2FlowData.checkpoint.summaryText}&quot;</p>
                                          )}
                                          {event.v2FlowData.checkpoint.conditions?.length > 0 && (
                                            <div className="mt-1 pt-1 border-t">
                                              {event.v2FlowData.checkpoint.conditions.map((cond: { label: string; value: string }, ci: number) => (
                                                <p key={ci} className="text-gray-500">• {cond.label}: {cond.value}</p>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <p className="text-gray-600">필터 결과 확인</p>
                                      )}
                                    </div>
                                  )}
                                  {/* 밸런스 게임 선택 */}
                                  {event.eventType === 'v2_balance_selection' && event.v2FlowData.balance && (
                                    <div className="bg-violet-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-violet-700 mb-1">
                                        ⚖️ 밸런스 Q{event.v2FlowData.balance.questionIndex + 1}/{event.v2FlowData.balance.totalQuestions}
                                      </p>
                                      <div className="bg-white p-2 rounded mt-1">
                                        <div className="flex gap-2 items-center">
                                          <span className={`px-2 py-0.5 rounded ${event.v2FlowData.balance.selectedOption === 'A' ? 'bg-violet-200 font-bold' : 'bg-gray-100'}`}>
                                            A: {event.v2FlowData.balance.optionALabel}
                                          </span>
                                          <span className="text-gray-400">vs</span>
                                          <span className={`px-2 py-0.5 rounded ${event.v2FlowData.balance.selectedOption === 'B' ? 'bg-violet-200 font-bold' : 'bg-gray-100'}`}>
                                            B: {event.v2FlowData.balance.optionBLabel}
                                          </span>
                                        </div>
                                        <p className="text-gray-600 mt-1">선택: {event.v2FlowData.balance.selectedLabel}</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* 밸런스 게임 스킵 */}
                                  {event.eventType === 'v2_balance_skipped' && event.v2FlowData.balance && (
                                    <div className="bg-gray-100 p-2 rounded text-xs">
                                      <p className="font-semibold text-gray-600 mb-1">
                                        ⏭️ 밸런스 스킵 Q{event.v2FlowData.balance.questionIndex + 1}/{event.v2FlowData.balance.totalQuestions}
                                      </p>
                                      <div className="bg-white p-2 rounded mt-1">
                                        <p className="text-gray-500">A: {event.v2FlowData.balance.optionALabel}</p>
                                        <p className="text-gray-500">B: {event.v2FlowData.balance.optionBLabel}</p>
                                        <p className="text-gray-400 mt-1">→ &quot;잘 모르겠어요&quot; 선택</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* 단점 토글 */}
                                  {event.eventType === 'v2_negative_toggle' && event.v2FlowData.negative && (
                                    <div className={`p-2 rounded text-xs ${event.v2FlowData.negative.isSelected ? 'bg-red-50' : 'bg-gray-50'}`}>
                                      <p className={`font-semibold mb-1 ${event.v2FlowData.negative.isSelected ? 'text-red-700' : 'text-gray-600'}`}>
                                        {event.v2FlowData.negative.isSelected ? '❌ 피할 단점' : '✓ 단점 해제'}
                                      </p>
                                      <p className="text-gray-700">&quot;{event.v2FlowData.negative.label}&quot;</p>
                                      <p className="text-gray-500 mt-1">현재 선택: {event.v2FlowData.negative.totalSelected}개</p>
                                    </div>
                                  )}
                                  {/* 피할 단점 완료 */}
                                  {event.eventType === 'v2_negative_completed' && event.metadata && (
                                    <div className="bg-red-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-red-700 mb-1">
                                        🚫 피할 단점 완료 ({(event.metadata as { selectedCount?: number; selectedLabels?: string[] }).selectedCount || 0}개)
                                      </p>
                                      {((event.metadata as { selectedLabels?: string[] }).selectedLabels || []).length > 0 && (
                                        <div className="bg-white p-2 rounded mt-1">
                                          {((event.metadata as { selectedLabels?: string[] }).selectedLabels || []).map((label: string, li: number) => (
                                            <p key={li} className="text-gray-700">• {label}</p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* 예산 변경 */}
                                  {event.eventType === 'v2_budget_changed' && event.v2FlowData.budget && (
                                    <div className="bg-amber-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-amber-700 mb-1">
                                        💰 예산 변경 {event.v2FlowData.budget.isDirectInput ? '(직접입력)' : '(슬라이더)'}
                                      </p>
                                      <div className="bg-white p-2 rounded mt-1">
                                        <p className="text-gray-700">{event.v2FlowData.budget.min?.toLocaleString()}원 ~ {event.v2FlowData.budget.max?.toLocaleString()}원</p>
                                        {event.v2FlowData.budget.productsInRange !== undefined && (
                                          <p className="text-gray-500 mt-1">범위 내 제품: {event.v2FlowData.budget.productsInRange}개</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {/* 예산 프리셋 클릭 */}
                                  {event.eventType === 'v2_budget_preset_clicked' && event.v2FlowData.budget && (
                                    <div className="bg-amber-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-amber-700 mb-1">
                                        📍 예산 프리셋: {event.v2FlowData.budget.preset}
                                      </p>
                                      <div className="bg-white p-2 rounded mt-1">
                                        <p className="text-gray-700">{event.v2FlowData.budget.min?.toLocaleString()}원 ~ {event.v2FlowData.budget.max?.toLocaleString()}원</p>
                                        {event.v2FlowData.budget.productsInRange !== undefined && (
                                          <p className="text-gray-500 mt-1">범위 내 제품: {event.v2FlowData.budget.productsInRange}개</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {/* V2 추천 결과 수신 */}
                                  {event.eventType === 'v2_recommendation_received' && event.v2FlowData.recommendation && (
                                    <div className="space-y-1">
                                      <button
                                        onClick={() => {
                                          const key = `v2rec-${session.sessionId}-${idx}`;
                                          setExpandedRecommendation(
                                            expandedRecommendation === key ? null : key
                                          );
                                        }}
                                        className="text-purple-600 hover:text-purple-800 underline text-left font-medium"
                                      >
                                        🎯 추천 결과 상세 ({event.v2FlowData.recommendation.recommendedProducts?.length || 0}개 제품)
                                      </button>
                                      {expandedRecommendation === `v2rec-${session.sessionId}-${idx}` && (
                                        <div className="mt-2 p-3 bg-purple-50 rounded-lg text-xs space-y-3">
                                          <div className="bg-white p-2 rounded">
                                            <p className="font-bold text-purple-900">📂 {event.v2FlowData.categoryName}</p>
                                            <p className="text-gray-600">전체 후보: {event.v2FlowData.recommendation.totalCandidates}개</p>
                                            {event.v2FlowData.recommendation.processingTimeMs && (
                                              <p className="text-gray-500">처리 시간: {event.v2FlowData.recommendation.processingTimeMs}ms</p>
                                            )}
                                          </div>
                                          {event.v2FlowData.recommendation.selectionReason && (
                                            <div className="bg-white p-2 rounded">
                                              <p className="font-semibold text-gray-700 mb-1">🤖 AI 전체 선정 이유:</p>
                                              <p className="text-gray-600 whitespace-pre-wrap">{event.v2FlowData.recommendation.selectionReason}</p>
                                            </div>
                                          )}
                                          {/* 각 제품별 상세 정보 */}
                                          {(() => {
                                            // 🔍 세션 내 모든 highlightedReviews 데이터 병합 (현재 이벤트 + 다른 이벤트)
                                            type HighlightReview = { criteriaId: string; criteriaName: string; originalText: string; excerpt: string };
                                            type ProductHighlight = { pcode: string; productTitle: string; rank: number; reviews: HighlightReview[] };
                                            
                                            const allHighlightedReviews: ProductHighlight[] = [];
                                            
                                            // 현재 이벤트에 highlightedReviews가 있으면 추가
                                            if (event.v2FlowData.recommendation.highlightedReviews) {
                                              allHighlightedReviews.push(...event.v2FlowData.recommendation.highlightedReviews);
                                            }
                                            
                                            // 다른 이벤트에서도 highlightedReviews 찾기
                                            session.events.forEach((e: { eventType: string; v2FlowData?: { recommendation?: { highlightedReviews?: ProductHighlight[] } } }) => {
                                              if (e !== event && 
                                                  e.eventType === 'v2_recommendation_received' && 
                                                  e.v2FlowData?.recommendation?.highlightedReviews) {
                                                e.v2FlowData.recommendation.highlightedReviews.forEach((h: ProductHighlight) => {
                                                  // 중복 방지
                                                  if (!allHighlightedReviews.some(existing => existing.pcode === h.pcode)) {
                                                    allHighlightedReviews.push(h);
                                                  }
                                                });
                                              }
                                            });
                                            
                                            return event.v2FlowData.recommendation.recommendedProducts?.map((prod: { pcode: string; title: string; brand?: string; rank: number; price?: number; score?: number; tags?: string[]; reason?: string; }, pi: number) => {
                                            // 해당 제품의 하이라이트 리뷰 찾기
                                            const productHighlights = allHighlightedReviews.find(
                                              (h: ProductHighlight) => h.pcode === prod.pcode
                                            );
                                            
                                            // 마크다운 볼드 파싱 함수
                                            const parseMarkdownBold = (text: string) => {
                                              const parts = text.split(/(\*\*.*?\*\*)/g);
                                              return parts.map((part: string, partIdx: number) => {
                                                if (part.startsWith('**') && part.endsWith('**')) {
                                                  const boldText = part.slice(2, -2);
                                                  return (
                                                    <strong key={partIdx} className="bg-amber-200 text-amber-900 px-0.5 rounded">
                                                      {boldText}
                                                    </strong>
                                                  );
                                                }
                                                return <span key={partIdx}>{part}</span>;
                                              });
                                            };
                                            
                                            return (
                                              <div key={pi} className="bg-white p-3 rounded border-l-4 border-purple-400 space-y-2">
                                                {/* 제품 기본 정보 */}
                                                <div>
                                                  <p className="font-bold text-gray-800">#{prod.rank} {prod.brand} {prod.title}</p>
                                                  <p className="text-gray-600">가격: {prod.price?.toLocaleString()}원 | 점수: {prod.score}점</p>
                                                  {prod.tags && prod.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                      {prod.tags.map((tag: string, ti: number) => (
                                                        <span key={ti} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{tag}</span>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                                
                                                {/* 💜 제품별 추천 이유 (보라색 컨테이너) */}
                                                {prod.reason && (
                                                  <div className="bg-purple-100 border border-purple-300 rounded-lg p-2">
                                                    <p className="font-semibold text-purple-800 mb-1 text-xs flex items-center gap-1">
                                                      💜 제품별 추천 이유
                                                    </p>
                                                    <p className="text-purple-700 text-xs leading-relaxed">{prod.reason}</p>
                                                  </div>
                                                )}
                                                
                                                {/* 🟡 리뷰 하이라이트 (노란색 컨테이너) */}
                                                {productHighlights && productHighlights.reviews && productHighlights.reviews.length > 0 && (
                                                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                                                    <p className="font-semibold text-amber-800 mb-1 text-xs flex items-center gap-1">
                                                      ✨ 리뷰 하이라이트 ({productHighlights.reviews.length}개)
                                                    </p>
                                                    <div className="space-y-1.5">
                                                      {productHighlights.reviews.slice(0, 3).map((review: { criteriaId: string; criteriaName: string; originalText: string; excerpt: string }, rIdx: number) => (
                                                        <div key={rIdx} className="bg-white rounded p-1.5 border border-amber-100">
                                                          <div className="text-amber-700 font-medium text-[10px] mb-0.5">
                                                            {review.criteriaName}
                                                          </div>
                                                          <div className="text-gray-700 text-[10px] leading-relaxed">
                                                            {parseMarkdownBold(review.excerpt)}
                                                          </div>
                                                        </div>
                                                      ))}
                                                      {productHighlights.reviews.length > 3 && (
                                                        <p className="text-[10px] text-amber-600 italic">
                                                          + {productHighlights.reviews.length - 3}개 더
                                                        </p>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          });
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* 가이드 카드 탭 선택 */}
                                  {event.eventType === 'guide_card_tab_selected' && event.v2FlowData.guideCard && (
                                    <div className="bg-teal-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-teal-700 mb-1">
                                        📋 가이드 탭: {event.v2FlowData.guideCard.tabLabel}
                                      </p>
                                      <p className="text-gray-600">{event.v2FlowData.categoryName}</p>
                                    </div>
                                  )}
                                  {/* 다시 추천받기 모달 열기 */}
                                  {event.eventType === 'v2_re_recommend_modal_opened' && event.v2FlowData.reRecommend && (
                                    <div className="bg-violet-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-violet-700 mb-1">
                                        🔄 다시 추천받기 모달 열기
                                      </p>
                                      <p className="text-gray-600">{event.v2FlowData.categoryName}</p>
                                    </div>
                                  )}
                                  {/* 같은 카테고리 다시 추천받기 */}
                                  {event.eventType === 'v2_re_recommend_same_category' && event.v2FlowData.reRecommend && (
                                    <div className="bg-violet-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-violet-700 mb-1">
                                        🔁 같은 카테고리 다시 추천
                                      </p>
                                      <p className="text-gray-700">{event.v2FlowData.reRecommend.targetCategoryName}</p>
                                    </div>
                                  )}
                                  {/* 다른 카테고리 추천받기 */}
                                  {event.eventType === 'v2_re_recommend_different_category' && event.v2FlowData.reRecommend && (
                                    <div className="bg-violet-50 p-2 rounded text-xs">
                                      <p className="font-semibold text-violet-700 mb-1">
                                        ➡️ 다른 카테고리로 이동
                                      </p>
                                      <p className="text-gray-600">이전: {event.v2FlowData.reRecommend.fromCategoryName}</p>
                                    </div>
                                  )}
                                </>
                              )}
                              {/* 구매 관련 이벤트 */}
                              {event.eventType === 'product_modal_purchase_clicked' && 'purchaseData' in event && event.purchaseData && (
                                <div className="bg-green-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-green-700 mb-1">
                                    🛒 구매 링크 클릭 {event.purchaseData.isLowestPrice && '(최저가)'}
                                  </p>
                                  {'productData' in event && event.productData && (
                                    <p className="text-gray-700">{event.productData.productTitle}</p>
                                  )}
                                  <p className="text-gray-600">{event.purchaseData.mall}: {event.purchaseData.price?.toLocaleString()}원</p>
                                </div>
                              )}
                              {event.eventType === 'comparison_detail_view_clicked' && 'productData' in event && event.productData && (
                                <div className="bg-indigo-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-indigo-700 mb-1">
                                    🔍 비교표 상세보기
                                  </p>
                                  <p className="text-gray-700">{event.productData.brand} {event.productData.productTitle}</p>
                                  <p className="text-gray-500">순위: {event.productData.rank}위</p>
                                </div>
                              )}
                              {event.eventType === 'favorite_lowest_price_clicked' && 'favoriteData' in event && event.favoriteData && 'purchaseData' in event && event.purchaseData && (
                                <div className="bg-pink-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-pink-700 mb-1">
                                    💗 찜 최저가 구매
                                  </p>
                                  <p className="text-gray-700">{event.favoriteData.productTitle}</p>
                                  <p className="text-gray-600">{event.purchaseData.mall}: {event.purchaseData.price?.toLocaleString()}원</p>
                                </div>
                              )}
                              {event.eventType === 'age_badge_selected' && 'categoryData' in event && event.categoryData && (
                                <div className="bg-cyan-50 p-2 rounded text-xs">
                                  <p className="font-semibold text-cyan-700 mb-1">
                                    👶 연령대 선택
                                  </p>
                                  <p className="text-gray-700">{event.categoryData.ageBadge}</p>
                                </div>
                              )}
                              {!event.buttonLabel && !event.userInput && !event.aiResponse && !event.recommendations && !event.chatData && !event.favoriteData && !event.comparisonData && !event.categoryData && !event.anchorData && !event.tagData && !event.resultV2Data && !('v2FlowData' in event && event.v2FlowData) && !('purchaseData' in event && event.purchaseData) && !('productData' in event && event.productData) && event.eventType !== 'page_view' && (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                              {event.recommendations && (
                                <div className="space-y-1">
                                  <button
                                    onClick={() => {
                                      const key = `${session.sessionId}-${idx}`;
                                      setExpandedRecommendation(
                                        expandedRecommendation === key ? null : key
                                      );
                                    }}
                                    className="text-purple-600 hover:text-purple-800 underline text-left font-medium"
                                  >
                                    📋 추천 리포트 펼쳐보기 ({event.recommendations.productIds.length}개 제품)
                                  </button>
                                  {expandedRecommendation === `${session.sessionId}-${idx}` && event.recommendations.fullReport && (
                                    <div className="mt-2 p-4 bg-purple-50 rounded-lg text-xs space-y-4">
                                      {/* 페르소나 요약 */}
                                      <div>
                                        <p className="font-bold text-purple-900 mb-2 text-sm">
                                          👤 페르소나 요약
                                        </p>
                                        {typeof event.recommendations.persona === 'object' && event.recommendations.persona ? (
                                          <div className="bg-white p-3 rounded space-y-2">
                                            {/* Summary */}
                                            {event.recommendations.persona.summary && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">요약:</p>
                                                <p className="text-gray-800 text-xs">{event.recommendations.persona.summary}</p>
                                              </div>
                                            )}

                                            {/* Core Value Weights */}
                                            {event.recommendations.persona.coreValueWeights && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">속성 가중치:</p>
                                                <div className="grid grid-cols-2 gap-1">
                                                  {Object.entries(event.recommendations.persona.coreValueWeights).map(([key, value]) => (
                                                    <div key={key} className="text-xs text-gray-700">
                                                      <span className="font-medium">{key}:</span> {value as number}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* Contextual Needs */}
                                            {event.recommendations.persona.contextualNeeds && event.recommendations.persona.contextualNeeds.length > 0 && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600 mb-1">구체적 니즈:</p>
                                                <ul className="list-disc list-inside text-xs text-gray-700">
                                                  {event.recommendations.persona.contextualNeeds.map((need: string, i: number) => (
                                                    <li key={i}>{need}</li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}

                                            {/* Budget */}
                                            {event.recommendations.persona.budget && (
                                              <div>
                                                <p className="text-xs font-semibold text-gray-600">
                                                  예산: <span className="font-normal text-gray-800">{(event.recommendations.persona.budget as number).toLocaleString()}원</span>
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-gray-700 whitespace-pre-wrap bg-white p-2 rounded text-xs">
                                            {typeof event.recommendations.persona === 'string' ? event.recommendations.persona : '정보 없음'}
                                          </p>
                                        )}
                                      </div>

                                      {/* 사용자 선택 기준 */}
                                      {event.recommendations.fullReport.userContext && (
                                        <div>
                                          <p className="font-bold text-purple-900 mb-2 text-sm">
                                            🎯 사용자 선택 기준
                                          </p>
                                          <div className="bg-white p-3 rounded space-y-2">
                                            {event.recommendations.fullReport.userContext.priorityAttributes?.map((attr, i) => (
                                              <div key={i} className="border-l-4 border-purple-400 pl-3 py-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span className="font-semibold text-gray-900">{attr.name}</span>
                                                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                                                    attr.level === '중요함' ? 'bg-blue-200 text-gray-900' :
                                                    attr.level === '보통' ? 'bg-blue-50 text-gray-900' :
                                                    'bg-gray-100 text-gray-700'
                                                  }`}>
                                                    {attr.level}
                                                  </span>
                                                </div>
                                                <p className="text-gray-600 text-xs">{attr.reason}</p>
                                              </div>
                                            ))}
                                            {event.recommendations.fullReport.userContext.additionalContext &&
                                             event.recommendations.fullReport.userContext.additionalContext.length > 0 && (
                                              <div className="mt-2 pt-2 border-t border-gray-200">
                                                <p className="font-medium text-gray-700 mb-1">추가 맥락:</p>
                                                <ul className="list-disc list-inside text-gray-600">
                                                  {event.recommendations.fullReport.userContext.additionalContext.map((ctx, i) => (
                                                    <li key={i}>{ctx}</li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                            {event.recommendations.fullReport.userContext.budget && (
                                              <div className="mt-2 pt-2 border-t border-gray-200">
                                                <p className="font-medium text-gray-700">
                                                  💰 예산: {event.recommendations.fullReport.userContext.budget}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* 전체 추천 이유 */}
                                      {(() => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const recData = (event as any).recommendationData;
                                        return recData?.selectionReason ? (
                                          <div>
                                            <p className="font-bold text-purple-900 mb-2 text-sm">
                                              💬 전체 추천 이유
                                            </p>
                                            <div className="bg-white p-3 rounded">
                                              <p className="text-gray-700 text-xs whitespace-pre-wrap">
                                                {recData.selectionReason}
                                              </p>
                                            </div>
                                          </div>
                                        ) : null;
                                      })()}

                                      {/* 추천 제품 Top 3 */}
                                      {event.recommendations.fullReport.recommendations && (
                                        <div>
                                          <p className="font-bold text-purple-900 mb-2 text-sm">
                                            🏆 추천 제품 Top 3
                                          </p>
                                          <div className="space-y-3">
                                            {event.recommendations.fullReport.recommendations.map((rec, i) => (
                                              <div key={i} className="bg-white p-3 rounded border-l-4 border-purple-400">
                                                <div className="flex items-start justify-between mb-2">
                                                  <div>
                                                    <p className="font-bold text-gray-900">
                                                      #{rec.rank} {rec.productTitle}
                                                    </p>
                                                    <p className="text-gray-600 text-xs">
                                                      제품 ID: {rec.productId} | 가격: {rec.price.toLocaleString()}원
                                                    </p>
                                                  </div>
                                                  <span className="px-2 py-1 bg-purple-100 text-purple-900 text-xs font-bold rounded">
                                                    {rec.finalScore.toFixed(1)}점
                                                  </span>
                                                </div>

                                                <div className="space-y-2 mt-3">
                                                  <div>
                                                    <p className="font-semibold text-green-700 text-xs mb-1">✅ 장점</p>
                                                    <ul className="list-disc list-inside text-gray-700 text-xs space-y-0.5">
                                                      {rec.strengths.map((s, j) => (
                                                        <li key={j}>{s}</li>
                                                      ))}
                                                    </ul>
                                                  </div>

                                                  {rec.weaknesses.length > 0 && (
                                                    <div>
                                                      <p className="font-semibold text-orange-700 text-xs mb-1">⚠️ 단점</p>
                                                      <ul className="list-disc list-inside text-gray-700 text-xs space-y-0.5">
                                                        {rec.weaknesses.map((w, j) => (
                                                          <li key={j}>{w}</li>
                                                        ))}
                                                      </ul>
                                                    </div>
                                                  )}

                                                  {rec.comparison && (
                                                    <div>
                                                      <p className="font-semibold text-blue-700 text-xs mb-1">🔄 비교</p>
                                                      <p className="text-gray-700 text-xs">{rec.comparison}</p>
                                                    </div>
                                                  )}

                                                  {rec.additionalConsiderations && (
                                                    <div>
                                                      <p className="font-semibold text-gray-700 text-xs mb-1">💡 추가 고려사항</p>
                                                      <p className="text-gray-700 text-xs">{rec.additionalConsiderations}</p>
                                                    </div>
                                                  )}

                                                  {/* 개별 제품 추천 이유 (recommendationData) */}
                                                  {(() => {
                                                    /* eslint-disable @typescript-eslint/no-explicit-any */
                                                    const recData = (event as any).recommendationData;
                                                    if (!recData?.topProducts) return null;
                                                    const productReason = recData.topProducts.find(
                                                      (p: any) => p.pcode === rec.productId && p.rank === rec.rank
                                                    );
                                                    /* eslint-enable @typescript-eslint/no-explicit-any */
                                                    return productReason?.reason ? (
                                                      <div className="pt-2 border-t border-gray-200">
                                                        <p className="font-semibold text-purple-700 text-xs mb-1">📝 추천 이유</p>
                                                        <p className="text-gray-700 text-xs whitespace-pre-wrap">{productReason.reason}</p>
                                                      </div>
                                                    ) : null;
                                                  })()}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* 리뷰 하이라이팅 (각 제품별) */}
                                      {(() => {
                                        /* eslint-disable @typescript-eslint/no-explicit-any */
                                        const recData = (event as any).recommendationData;
                                        const highlights = recData?.highlightedReviews;
                                        if (!highlights || highlights.length === 0) return null;

                                        return (
                                          <div>
                                            <p className="font-bold text-purple-900 mb-2 text-sm">
                                              ✨ 리뷰 하이라이팅
                                            </p>
                                            <div className="space-y-3">
                                              {highlights.map((product: any, pi: number) => (
                                                <div key={pi} className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                                                  <p className="font-bold text-gray-900 mb-2">
                                                    #{product.rank} {product.productTitle}
                                                  </p>
                                                  <div className="space-y-2">
                                                    {product.reviews.map((review: any, ri: number) => (
                                                      <div key={ri} className="bg-white p-2 rounded">
                                                        <p className="font-semibold text-yellow-700 text-xs mb-1">
                                                          {review.criteriaName}
                                                        </p>
                                                        <p className="text-gray-700 text-xs leading-relaxed">
                                                          {review.excerpt}
                                                        </p>
                                                        <p className="text-gray-400 text-xs mt-1 pt-1 border-t border-gray-100">
                                                          원본: {review.originalText.substring(0, 50)}...
                                                        </p>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                        /* eslint-enable @typescript-eslint/no-explicit-any */
                                      })()}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
