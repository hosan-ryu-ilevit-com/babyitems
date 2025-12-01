'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Category, CATEGORY_NAMES } from '@/lib/data';

interface GuideBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category; // 카테고리별 가이드
}

// Collapsible Guide Card Component
function GuideCard({ number, title, content, defaultOpen = false }: { number: string; title: string; content: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // 카드가 열릴 때 로깅
  useEffect(() => {
    if (isOpen) {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: localStorage.getItem('baby_item_session_id'),
          eventType: 'button_click',
          buttonLabel: `가이드 카드 ${number} 열기: ${title}`,
          page: 'priority',
          guideCardNumber: number,
          guideCardTitle: title,
        }),
      }).catch(console.error);
    }
  }, [isOpen, number, title]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400">{number}</span>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-gray-400"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-1">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function GuideBottomSheet({ isOpen, onClose, category }: GuideBottomSheetProps) {
  // 카테고리별 가이드 제목
  const getGuideTitle = () => {
    if (!category) return '처음 사는 분유포트, 1분이면 충분해요';

    if (category === 'milk_powder_port') {
      return '처음 사는 분유포트, 1분이면 충분해요';
    }

    // 다른 카테고리는 범용 제목
    return `${CATEGORY_NAMES[category]} 구매 가이드`;
  };

  // 콘텐츠가 있는 카테고리
  const hasContent = category === 'milk_powder_port' || category === 'baby_bottle' || category === 'baby_play_mat' || category === 'baby_formula_dispenser' || category === 'baby_bottle_sterilizer' || category === 'thermometer' || category === 'car_seat' || category === 'nasal_aspirator' || category === 'baby_monitor' || !category;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[60]"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-gray-50 rounded-t-3xl z-[70] h-[85vh] flex flex-col overflow-hidden"
            style={{ maxWidth: '480px', margin: '0 auto' }}
          >
            {/* Header */}
            <div className="px-6 py-4  bg-gray-50">
              <h2 className="text-m font-semibold text-gray-900 text-center">
                {getGuideTitle()}
              </h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {!hasContent ? (
                // 빈 내용 (가이드 준비 중)
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    가이드 준비 중입니다
                  </p>
                  <p className="text-sm text-gray-600">
                    {category && CATEGORY_NAMES[category]} 구매 가이드는 곧 제공될 예정입니다
                  </p>
                </div>
              ) : category === 'baby_bottle' ? (
                // 젖병 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 용량과 소재 */}
                <GuideCard
                  number="01"
                  title="용량과 소재"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 중형(240ml) 우선 구매</p>
                        <p className="text-xs text-gray-600 mb-2">3개월~젖병 끊기까지 가장 오래 사용</p>
                        <p className="text-xs text-gray-600">분유 수유: 6~8개 / 모유 수유: 2~4개</p>
                      </div>

                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">PPSU - 가장 대중적</p>
                          <p className="text-xs text-gray-600">1~2만원 / 3~6개월 교체 / 열탕 소독 가능</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">유리 - 장기 사용</p>
                          <p className="text-xs text-gray-600">미세플라스틱 걱정 없음 / 1년 교체 / 무거움(200g)</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">*출산 후 3주 뒤 수유 방식 확정 후 대량 구매 권장</p>
                    </>
                  }
                />

                {/* Card 2: 젖꼭지 선택 */}
                <GuideCard
                  number="02"
                  title="젖꼭지 선택"
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-1">🍼 아기마다 다름!</p>
                        <p className="text-xs text-gray-600">직접 물려봐야 알 수 있어요. 타사 젖꼭지 호환 제품 추천</p>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex gap-2">
                          <div className="shrink-0 w-16 bg-gray-100 rounded-lg px-2 py-1 text-center">
                            <p className="text-xs font-semibold text-gray-900">실리콘</p>
                          </div>
                          <p className="text-xs text-gray-600 flex-1">가장 많이 사용 / 2~3개월 교체</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="shrink-0 w-16 bg-gray-100 rounded-lg px-2 py-1 text-center">
                            <p className="text-xs font-semibold text-gray-900">천연고무</p>
                          </div>
                          <p className="text-xs text-gray-600 flex-1">말랑말랑 / 거부 반응 적음 / 1개월 교체</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3.5 mt-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">배앓이 방지 기능</p>
                        <p className="text-xs text-gray-600">젖꼭지 유착 방지에는 필요하지만, 배앓이 예방 효과는 증거 없음</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 세척과 입구 */}
                <GuideCard
                  number="03"
                  title="세척과 입구"
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 와이드형(6cm) 또는 일반형(5cm)</p>
                        <p className="text-xs text-gray-600">분유 타기 편함 / 세척 편함 / 슬림형(4cm)은 분유 흘림</p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-900">세척 편의성</p>
                        <ul className="text-xs text-gray-600 space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>부품 개수 적을수록 세척 쉬움</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>유선형 굴곡 구조는 틈새 세척 주의</span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3.5 mt-3">
                        <p className="text-sm font-semibold text-gray-900 mb-1">소독 방법</p>
                        <p className="text-xs text-gray-600">열탕/스팀/UV 등 다양. 제조사 사용설명서 필수 확인</p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 편의와 가성비 */}
                <GuideCard
                  number="04"
                  title="편의와 가성비"
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">누수 방지</p>
                        <p className="text-xs text-gray-600">부품 개수 적고 조립 간단할수록 누수 적음. 리뷰 필수 확인</p>
                      </div>

                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">빨대컵 활용</p>
                          <p className="text-xs text-gray-600">8개월부터 사용. 액세서리만 추가 구매하면 비용 절약</p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-2">교체주기와 가성비</p>
                          <div className="space-y-1 text-xs text-gray-600">
                            <p>PP: 저렴 / 3개월 교체</p>
                            <p>PPSU: 중간 / 3~6개월 교체</p>
                            <p>유리·실리콘: 비쌈 / 1년 교체</p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_play_mat' ? (
                // 놀이매트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 안전성과 기능 */}
                <GuideCard
                  number="01"
                  title="안전성과 기능"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 머리쿵 방지</p>
                        <p className="text-xs text-gray-600">18개월 이전 아이들 뒤로 넘어짐 대비. 배밀기 시작하면 구매 고려</p>
                      </div>

                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">층간소음: 경량 효과 O / 중량 X</p>
                          <p className="text-xs text-gray-600">장난감 떨어지는 소리 4~6dB 감소 / 쿵쿵 뛰는 소리는 거의 안 줄음</p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">바닥 보호</p>
                          <p className="text-xs text-gray-600">방수 처리로 구토·음료 OK / 크레파스 낙서·장난감 긁힘 방지</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 2: PVC 놀이방매트 */}
                <GuideCard
                  number="02"
                  title="PVC 놀이방매트"
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">가장 대중적</p>
                        <p className="text-xs text-gray-600">㎡당 4~5만원 / 쫀쫀하고 단단한 코팅</p>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <p className="text-gray-900 font-semibold">장점</p>
                        <p className="text-gray-600">• 신축성·복원성 우수 / 내구성 좋음 / 로봇청소기 OK</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 폴더매트 */}
                <GuideCard
                  number="03"
                  title="폴더매트"
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">충격흡수 최고</p>
                        <p className="text-xs text-gray-600">㎡당 4~5만원 / 두께 4cm 이상 / 2~5단 접기</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                          <p className="text-xs text-gray-600">세탁 가능 / 접어서 청소 편함</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">단점</p>
                          <p className="text-xs text-gray-600">틈새 청소 어려움 / 로봇청소기 X</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 기타 매트 비교 */}
                <GuideCard
                  number="04"
                  title="기타 매트 비교"
                  content={
                    <>
                      <div className="space-y-2.5">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">롤매트</p>
                          <p className="text-xs text-gray-600 mb-1">㎡당 3~4만원 / 원하는 사이즈로 자름</p>
                          <p className="text-xs text-gray-500">⚠️ 무조건 틈새 생김 → 청소 어려움</p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">퍼즐매트</p>
                          <p className="text-xs text-gray-600 mb-1">㎡당 1.5만원 (가장 저렴)</p>
                          <p className="text-xs text-gray-500">⚠️ 내구성 약함 / 틈새 많아 영유아 부적합</p>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">시공매트 (프리미엄)</p>
                          <p className="text-xs text-gray-600 mb-1">㎡당 5~10만원 / 인테리어 효과 극대화</p>
                          <p className="text-xs text-gray-500">⚠️ 가구 자국 / 환기 안돼 곰팡이 우려</p>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_formula_dispenser' ? (
                // 분유제조기 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 분유 호환성 & 정확도 */}
                <GuideCard
                  number="01"
                  title="분유 호환성 & 정확도"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">세팅 번호 확인 필수!</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          분유마다 농도가 달라서 제조기마다 고유 번호가 있어.
                          <strong> 내 분유의 세팅 번호가 없으면 사용 불가능</strong>
                        </p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-16 h-7 bg-green-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-green-600">호환 OK</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">대부분 대중적 분유 (앱솔루트, 임페리얼 등)</p>
                        </div>
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-16 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-red-600">주의</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">산양분유, 특수분유는 호환 안 되는 제품 있음</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">농도 정확성</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">10ml 단위 조절 추천</p>
                        <p className="text-xs text-gray-700">
                          손 계량과 비슷한 오차 범위. 30ml 단위면 90ml나 120ml로 타야 해서 불편해
                        </p>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">⚠️ 농도가 묽다면 확인할 것</p>
                      <ul className="text-xs text-gray-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>3-4회 작동 후 깔때기·노즐 세척 (분유 뭉침 방지)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>부품 누락 시 분유량 오류 발생</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>세팅 번호 잘못 입력하면 정량 안 맞음</span>
                        </li>
                      </ul>
                    </>
                  }
                />

                {/* Card 2: 온도 조절 & 출수 품질 */}
                <GuideCard
                  number="02"
                  title="온도 조절 & 출수 품질"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">온도 범위 넓을수록 좋아</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">3단계 조절 (기본형)</p>
                          <p className="text-xs text-gray-600">40℃ 근처로 제한적</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">1℃ 단위 조절 (프리미엄)</p>
                          <p className="text-xs text-gray-700">40~70℃ 폭넓은 온도 선택 가능</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">뭉침 & 거품</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>회오리 출수 방식으로 뭉침 거의 없음</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>받침대 높이 조절되면 거품 발생 더 줄어</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>스틱 섞기는 뭉침 없지만 제조 시간 1분 이상</span>
                        </li>
                      </ul>
                      <p className="text-xs text-gray-600">
                        *대부분 30~240ml 조유 가능. 300ml 제품도 있지만 240ml면 충분해
                      </p>
                    </>
                  }
                />

                {/* Card 3: 세척 & 관리 */}
                <GuideCard
                  number="03"
                  title="세척 & 관리"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">부분 세척: 하루 1-2회</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>깔때기·노즐: 물 세척 (3-4회 작동 후)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>분유통 바닥: 브러시로 털기 (물 X)</span>
                        </li>
                      </ul>
                      <p className="text-sm font-semibold text-gray-900 mb-2">전체 세척: 주 1-2회</p>
                      <p className="text-xs text-gray-600 mb-3">
                        모든 부품 물 세척 필수. 아기가 먹는 분유와 물이 담기는 곳이니 주기적 세척 중요
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">세척 편의성 체크</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          <li>• 부품 개수: 전체 세척 15개 이하면 적은 편</li>
                          <li>• 자동 세척 기능: 부분 세척 생략 가능</li>
                          <li>• 깔때기·노즐 여분 구매 추천 (교체 사용)</li>
                        </ul>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 식기세척기, 젖병소독기 사용 금지</p>
                        <p className="text-xs text-gray-700">제품 변형 우려로 모든 제조사에서 금지</p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 용량 & 편의 기능 */}
                <GuideCard
                  number="04"
                  title="용량 & 편의 기능"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">용량 및 보충 주기</p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">분유통 400g</span>
                          <span className="text-xs text-gray-600">20회 → 2-3일 보충</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">분유통 260~300g</span>
                          <span className="text-xs text-gray-600">9회 → 1-2일 보충</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">완분·쌍둥이는 대용량 추천</p>
                        <p className="text-xs text-gray-700">
                          분유 자주 열면 습기·세균 번식 위험. 보충 주기 긴 대용량이 좋아
                        </p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">편의 기능</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>앱 연동:</strong> 바코드 자동 세팅, 조유 기록 (연결 끊김 있음)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>센서:</strong> 젖병·물 부족·도어 센서로 정확한 제조</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>조명:</strong> 밤 수유 시 편리</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>재질:</strong> 트라이탄 추천 (의료용품 소재)</span>
                        </li>
                      </ul>
                      <p className="text-xs text-gray-600">
                        *A/S: 12~18개월 기본 | 소음: 62-70dB | 전기요금: 월 약 1,000원
                      </p>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_bottle_sterilizer' ? (
                // 젖병소독기 가이드 내용
              <div className="space-y-4">
                {/* Card 1: UVC 자외선 살균 & 인증 */}
                <GuideCard
                  number="01"
                  title="UVC 자외선 살균 & 인증"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">가장 대중적인 UV 소독 방식</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs text-gray-700 mb-1">
                          UVC 자외선(200~280nm)으로 살균+건조. 식당 컵 살균기와 같은 원리
                        </p>
                        <p className="text-xs text-gray-600">
                          *스팀소독(80℃ 수증기)도 있지만 UV가 가장 편리해
                        </p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">살균 인증 확인</p>
                      <p className="text-xs text-gray-600 mb-2">
                        KTR, KCL 기관 인증. 99.9~99.999% 살균 표시
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">이 세균 인증 확인!</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>대장균 (신생아 장염)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>황색포도상구균 (식중독)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>녹농균, 살모넬라균 (장티푸스)</span>
                          </li>
                        </ul>
                      </div>
                      <p className="text-xs text-gray-600">
                        ⚠️ 민간기관 인증이라 필수는 아니지만, 있으면 신뢰도 높아
                      </p>
                    </>
                  }
                />

                {/* Card 2: LAMP vs LED & 건조 방식 */}
                <GuideCard
                  number="02"
                  title="LAMP vs LED & 건조 방식"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">자외선 발생 방식</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">UVC-LAMP (형광등)</p>
                          <p className="text-xs text-gray-700 mb-1">자외선량 많고 저렴 / 6개월~1년 교체</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">UVC-LED</p>
                          <p className="text-xs text-gray-600">반영구 사용 / 비싸고 LED 개수 확인 필요</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">건조 방식 (중요!)</p>
                      <p className="text-xs text-gray-600 mb-2">물기 있으면 세균 번식. 건조 필수</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">열풍건조 (40~60℃)</p>
                          <p className="text-xs text-gray-600">빠른 건조 / 젖병 소재 변형 가능성</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">자연건조 (20~30℃) 추천</p>
                          <p className="text-xs text-gray-700">소재 구분 없이 안전</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">열풍/자연 둘 다 (최고)</p>
                          <p className="text-xs text-gray-700">상황 따라 선택 가능</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        💡 사용법: 세척 후 3~5회 털기 → 뚜껑 열어 세우기 → 여유공간 확보
                      </p>
                    </>
                  }
                />

                {/* Card 3: 용량·크기 & 선반 구성 */}
                <GuideCard
                  number="03"
                  title="용량·크기 & 선반 구성"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">넉넉하게 선택해</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">신생아 기준 젖병 10개 이상</p>
                        <p className="text-xs text-gray-700">
                          완분은 하루 6~10회 수유. 나중엔 장난감·식기도 소독하니 여유있게
                        </p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">내부 크기 추천</span>
                          <span className="text-xs text-gray-600">250x250mm 이상 (12개)</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">높이 (2단)</span>
                          <span className="text-xs text-gray-600">300mm 이상</span>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">선반 구성</p>
                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">2단 선반 (가장 많음)</p>
                          <p className="text-xs text-gray-600">공간 효율 좋음 / 넣고 빼기 번거로움</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">원형 vs 사각</p>
                          <p className="text-xs text-gray-600">원형: 고른 살균 / 사각: 수납 많음</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        *외형 비슷해도 램프/LED 위치에 따라 내부 공간 달라. 내부 크기 확인 필수
                      </p>
                    </>
                  }
                />

                {/* Card 4: 사용 편의성 & 주요 기능 */}
                <GuideCard
                  number="04"
                  title="사용 편의성 & 주요 기능"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">체크 포인트</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>살균/건조 모드 단독 사용 가능한지</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>시간 조절 가능한지</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>음소거 모드 (부저음 불편할 때)</span>
                        </li>
                      </ul>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">소음 & 전기요금</p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">소음</span>
                          <span className="text-xs text-gray-600">40~45dB (백색소음)</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">전기요금 (열풍)</span>
                          <span className="text-xs text-gray-600">월 1,000~3,000원</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">전기요금 (자연)</span>
                          <span className="text-xs text-gray-600">월 500원 이하</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 주요 기능</p>
                        <p className="text-xs text-gray-700">
                          대부분 자동모드(살균+건조), 살균·건조 단독, 반복 기능 탑재
                        </p>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'thermometer' ? (
                // 체온계 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 귀체온계 추천 & 특징 */}
                <GuideCard
                  number="01"
                  title="귀체온계 추천 & 특징"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">3가지 타입 비교</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">펜타입</p>
                          <p className="text-xs text-gray-600">3~5분 소요. 저렴·정확하지만 느림</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">귀체온계 (고막) 추천</p>
                          <p className="text-xs text-gray-700">1~2초 측정. 정확·빠름·간편. 최고 효율</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">비접촉식 (피부)</p>
                          <p className="text-xs text-red-600">편리하지만 부정확. 보조용만</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">왜 귀체온계가 정확할까?</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          고막은 체온 조절하는 시상하부와 동일한 동맥으로 혈액 공급받아서
                          <strong> 심부온도 측정에 적합</strong>. 1~2초 만에 확인 가능
                        </p>
                      </div>
                      <p className="text-xs text-gray-600">
                        ⚠️ 귀 내부 염증·분비물 있으면 사용 금지
                      </p>
                    </>
                  }
                />

                {/* Card 2: 필터 유무 & 측정 정확도 */}
                <GuideCard
                  number="02"
                  title="필터 유무 & 측정 정확도"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">필터 사용 vs 미사용</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">필터 사용</p>
                          <p className="text-xs text-gray-700">위생 좋고 센서 보호 / 추가 비용 (1box 1,500~2,000원)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">필터 미사용</p>
                          <p className="text-xs text-gray-600">비용 절약, 편안한 촉감 / 알코올 솜 소독</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">부위별 정확도 순위</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-1.5">직장 &gt; 고막 &gt; 구강 &gt; 겨드랑이 &gt;&gt; 이마</p>
                        <p className="text-xs text-gray-700">
                          외부 환경 영향 덜 받을수록 정확해. 일반 체온계 ±0.2℃ / 비접촉식 ±0.3℃
                        </p>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 비접촉식 부정확한 이유</p>
                        <p className="text-xs text-gray-700">
                          피부는 외부 영향 많이 받고, 열 나면 땀으로 피부온도 낮아져. 대략적 확인용만
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 올바른 사용법 & 주의사항 */}
                <GuideCard
                  number="03"
                  title="올바른 사용법 & 주의사항"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">정밀도 높이는 방법</p>
                      <p className="text-xs text-gray-600 mb-3">
                        동일 위치·동일 방법으로 측정. 적외선 센서는 1cm 차이에도 측정값 달라짐
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-2">귀체온계 올바른 사용법</p>
                        <p className="text-xs text-gray-700 mb-2">
                          귓구멍은 일자가 아니야. <strong>귀를 뒤쪽으로 당겨 측정부와 고막이 일직선</strong>되게
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="shrink-0 w-16 h-6 bg-white rounded flex items-center justify-center">
                              <span className="text-xs font-semibold text-gray-900">어린아이</span>
                            </div>
                            <p className="text-xs text-gray-700">뒤 아래쪽으로 당김</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="shrink-0 w-16 h-6 bg-white rounded flex items-center justify-center">
                              <span className="text-xs font-semibold text-gray-900">어른</span>
                            </div>
                            <p className="text-xs text-gray-700">뒤 위쪽으로 당김</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 사용법 숙지 중요</p>
                        <p className="text-xs text-gray-700">
                          올바른 사용법 모르면 1도 이상 오차 발생 가능!
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 부가 기능 & 제품 추천 */}
                <GuideCard
                  number="04"
                  title="부가 기능 & 제품 추천"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">실용 기능</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>백라이트:</strong> 어두운 곳에서 화면 확인</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>라이트:</strong> 귀 내부 비춤 (야간 필수)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>사물온도 측정:</strong> 분유·목욕물 온도</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>앱 연동:</strong> 블루투스 자동 기록 (선택)</span>
                        </li>
                      </ul>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">제품 추천</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">기본 추천: 귀체온계</p>
                          <p className="text-xs text-gray-700">1~2초 측정, 정확. 사용법 숙지 필수</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">신생아 (6개월 이하)</p>
                          <p className="text-xs text-gray-600">귓구멍 작아서 펜타입 (겨드랑이) 추천</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">보조용</p>
                          <p className="text-xs text-gray-600">비접촉식 (부정확, 대략적 확인용만)</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        💡 센서 보호 위해 뚜껑·케이스 제공하는 제품 선택
                      </p>
                    </>
                  }
                />
              </div>
              ) : category === 'car_seat' ? (
                // 카시트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 카시트 종류 & 사용 기간 */}
                <GuideCard
                  number="01"
                  title="카시트 종류 & 사용 기간"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">4가지 종류</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">① 인펀트 (바구니형) | 10~30만원</p>
                          <p className="text-xs text-gray-600">신생아~18개월 | 목 못 가누는 신생아용. 뒤보기 전용</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">② 컨버터블 추천 | 50~80만원</p>
                          <p className="text-xs text-gray-700">6개월~4,5세 | 앞보기/뒤보기 회전. 가장 대중적. 이너시트 제공</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">③ 토들러 (선택) | 20~50만원</p>
                          <p className="text-xs text-gray-600">15개월~12세 | 컨버터블↔주니어 중간 단계</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">④ 주니어 (부스터) | 10~40만원</p>
                          <p className="text-xs text-gray-600">4,5세~12세 | 성인 안전벨트를 아이 사이즈에 맞게</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">사용 기간 (중요!)</p>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-bold text-gray-900 mb-1.5">법적 의무 vs 실제 권장</p>
                        <p className="text-xs text-gray-700 mb-1"><strong>법:</strong> 만 6세 (위반 6만원)</p>
                        <p className="text-xs text-gray-700"><strong>권장:</strong> 140cm·36kg까지 (초등 3~5학년)</p>
                        <p className="text-xs text-gray-600 mt-2">
                          ✅ 안전벨트가 어깨와 골반에 온전히 장착되는 시점까지 필수
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 카시트 계획 & 안전 인증 */}
                <GuideCard
                  number="02"
                  title="카시트 계획 & 안전 인증"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">정석 플랜</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-bold text-gray-900 mb-1.5">인펀트 → 컨버터블 → 주니어</p>
                        <p className="text-xs text-gray-700">신생아~1년 → 1~4,5세 → 4,5세~12세</p>
                        <p className="text-xs text-gray-600 mt-1">
                          💡 인펀트 생략 가능 (외출 적으면 컨버터블 이너시트 활용)
                        </p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 장착 가능 사이즈 꽉 채워 사용</p>
                        <p className="text-xs text-gray-700">아이 불편해도 안전 우선. 섣불리 다음 단계 넘어가면 위험</p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">안전 인증</p>
                      <div className="space-y-2">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">유럽 R129 (i-size) 최고</p>
                          <p className="text-xs text-gray-700">전방·측면·전복 충돌 테스트. 비싸지만 가장 까다로운 기준</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">유럽 R44 / 미국 FMVSS-213 / 한국 KC</p>
                          <p className="text-xs text-gray-600">기본 인증. KC는 R44 기반. 덜 안전하다는 의미 아님</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        💡 i-size = 더 높은 기준 통과. 100% 안전 보장 아닌 부상 위험 감소
                      </p>
                    </>
                  }
                />

                {/* Card 3: 안전 점수 & 필수 기능 */}
                <GuideCard
                  number="03"
                  title="안전 점수 & 필수 기능"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">소비자단체 안전 점수</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">독일 ADAC (낮을수록 좋음)</p>
                          <p className="text-xs text-gray-700">2.5점 이하 = 상당히 안전. 리콜 요청 권한</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">미국 베이비기어랩 (높을수록 좋음)</p>
                          <p className="text-xs text-gray-700">충돌점수 6점 이상 = 높은 편</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        ⚠️ 국산 제품은 점수 없음. 제품 상세페이지 확인. 모델명 일치 필수
                      </p>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">필수 안전 기능</p>
                      <ul className="text-xs text-gray-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>ISOFIX:</strong> 차에 꽂기만. 오장착 방지 (2010년 이후 차량 의무)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>정장착 인디케이터:</strong> 빨강/초록 전환. 경보음 (99% 탑재)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>리바운드 스토퍼:</strong> 2차 충돌 방지 (컨버터블 뒤보기용)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>측면 충격 패드:</strong> 측면 충돌 완충재</span>
                        </li>
                      </ul>
                    </>
                  }
                />

                {/* Card 4: 주요 용어 정리 */}
                <GuideCard
                  number="04"
                  title="주요 용어 정리"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">종류별 핵심 용어</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-bold text-gray-900 mb-1.5">인펀트 (바구니)</p>
                          <ul className="text-xs text-gray-600 space-y-0.5 pl-2">
                            <li>• 카시트 핸들: 각도 조절, 침대로 활용</li>
                            <li>• 차양막: 자외선 차단</li>
                            <li>• 하네스: 안전벨트 (3/5점식)</li>
                          </ul>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-xs font-bold text-gray-900 mb-1.5">컨버터블</p>
                          <ul className="text-xs text-gray-600 space-y-0.5 pl-2">
                            <li>• 헤드레스트: 높이 조절</li>
                            <li>• 이너시트: 아이 사이즈에 맞게 Fit 조절</li>
                            <li>• ISOFIX: 회전판 차에 장착하는 걸쇠</li>
                            <li>• 서포팅레그: 차 바닥 고정 / 탑테더: 후방 고리 방식</li>
                          </ul>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-xs font-bold text-gray-900 mb-1.5">주니어 (부스터)</p>
                          <ul className="text-xs text-gray-600 space-y-0.5 pl-2">
                            <li>• 부스터: 아이 키 높여주는 개념</li>
                            <li>• 하이백: 등받이 있음 (= 주니어 카시트)</li>
                            <li>• 백리스: 등받이 없음</li>
                            <li>• 안전벨트 가이드: 성인 벨트 올바른 위치로 안내</li>
                          </ul>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'nasal_aspirator' ? (
                // 콧물흡입기 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 개요 & 사용 준비 */}
                <GuideCard
                  number="01"
                  title="개요 & 사용 준비"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">의료용 흡인기</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          코 내부 콧물을 빨아들여 제거. 의료기기 (흡인 吸引 = 체내→체외)
                        </p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">이럴 때 필요</p>
                        <div className="space-y-0.5 text-xs text-gray-700">
                          <p>• 스스로 코 못 푸는 어린아이</p>
                          <p>• 코막힘 → 구강호흡·수면장애</p>
                          <p>• 콧물 방치 시 <strong>중이염·축농증 악화</strong></p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">사용 전 코를 촉촉하게!</p>
                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 목욕 후 바로 사용</p>
                          <p className="text-xs text-gray-600">목욕 마친 뒤 바로 코 빼내도 OK</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 식염수 사용</p>
                          <p className="text-xs text-gray-600">코 세척용 식염수나 스프레이 → 코 만져 섞기 → 닦아내기 → 흡입</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        ⚠️ 코 내부 부어서 막힌 경우 효과 없음. 과도한 사용 시 코점막 손상·출혈
                      </p>
                    </>
                  }
                />

                {/* Card 2: 수동식 vs 전동 무선 */}
                <GuideCard
                  number="02"
                  title="수동식 vs 전동 무선"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">수동식 (구강흡입) | 5천원~</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-green-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 장점</p>
                          <p className="text-xs text-gray-700">저렴·강도 조절·흡입력 강함</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">❌ 단점</p>
                          <p className="text-xs text-gray-700">교차감염·폐활량 의존·힘듦</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        대표 제품: 코뻥. 약국 구매 가능. 콧물통 큰 제품·긴 호스·필터 있는 개선 버전 추천
                      </p>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">전동 무선 (건전지/배터리) | 3~5만원</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-green-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 장점</p>
                          <p className="text-xs text-gray-700">간편·휴대성·교차감염 없음</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">❌ 단점</p>
                          <p className="text-xs text-gray-700"><strong>흡입력 약함</strong>·작은 콧물통</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        흐르는 콧물 제거나 입구까지 끌어내기는 가능. 흡입력 부족 느끼면 유선 고려
                      </p>
                    </>
                  }
                />

                {/* Card 3: 전동 유선 & 올바른 사용법 */}
                <GuideCard
                  number="03"
                  title="전동 유선 & 올바른 사용법"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">전동 유선 (콘센트) | 10~25만원</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-bold text-gray-900 mb-1">돈이 아깝지 않다는 후기 대다수</p>
                        <p className="text-xs text-gray-700">강한 흡입력·큰 콧물통·귀여운 디자인 (아이 스스로 사용)</p>
                        <p className="text-xs text-gray-600 mt-1">단점: 소음·진동 심함. 아이 무서워할 수 있음</p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">올바른 사용법</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-bold text-gray-900 mb-1.5">5초 × 여러 번, 총 5분 이내</p>
                        <p className="text-xs text-gray-700">한 번에 모든 콧물 빼내려 하면 부작용</p>
                      </div>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>아이 앉힌 상태, 입 벌리기 (비강 공기 통하도록)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>노즐 콧구멍에 넣기 (점막 흡입 주의)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>원 그리듯 위치 바꿔가며 찾기 (쿠루룩 소리 나는 부분)</span>
                        </li>
                      </ul>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-bold text-gray-900 mb-1">⚠️ 가장 중요</p>
                        <p className="text-xs text-gray-700">아이 아파하면 무리하게 빼내지 말 것</p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 선택 가이드 */}
                <GuideCard
                  number="04"
                  title="선택 가이드"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">상황별 추천</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">💰 수동식</p>
                          <p className="text-xs text-gray-700">아이 코 잘 풀거나 막히는 일 없으면 충분</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">🔋 무선</p>
                          <p className="text-xs text-gray-700">교차감염 걱정 + 간편함 중시. 흡입력 부족하면 유선 고려</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">🔌 유선</p>
                          <p className="text-xs text-gray-700">강한 흡입력 필요 + 예산 충분. 콧물 많거나 2명 이상 아이</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">💡 Tip</p>
                        <p className="text-xs text-gray-700">부품 분실·휴대성 위해 <strong>수동식 1개 비상용 구비</strong> 추천</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 사용 전 확인</p>
                        <p className="text-xs text-gray-700">콧물·비염 증상 심하면 병원 진단 후 사용</p>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_monitor' ? (
                // 홈카메라 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 개요 & 보안 */}
                <GuideCard
                  number="01"
                  title="개요 & 보안"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">가정용 CCTV (IP카메라)</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs text-gray-700 leading-relaxed mb-2">
                          실시간 모니터링 + 움직임·소리 감지 + 양방향 통화
                        </p>
                        <p className="text-xs font-semibold text-blue-600">5만원대 저렴한 가격</p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900">👶 베이비캠 / 🐕 펫캠 / 👴 시니어캠</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="bg-red-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">⚠️ 보안이 가장 중요!</p>
                        <p className="text-xs text-gray-700 mb-2">인터넷 연결 제품은 모두 해킹 대상</p>
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-700">✅ <strong>AES-128 이상 암호화</strong> (미국 정부 표준)</p>
                          <p className="text-xs text-gray-700">✅ <strong>외부 접근 차단</strong> (마스터 방식 + 실명인증)</p>
                          <p className="text-xs text-gray-700">✅ <strong>주기적 업데이트</strong> (보안 취약점 보완)</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">해킹 방지 수칙</p>
                        <p className="text-xs text-gray-700">1️⃣ 관리자 비밀번호 변경</p>
                        <p className="text-xs text-gray-700">2️⃣ 펌웨어 주기적 업데이트</p>
                        <p className="text-xs text-gray-700">3️⃣ 미사용시 전원 차단</p>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 해상도·화각·야간촬영 */}
                <GuideCard
                  number="02"
                  title="해상도·화각·야간촬영"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">해상도</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs font-bold text-gray-900 mb-1">FHD (200만)</p>
                            <p className="text-xs text-gray-700">실내용 충분 ✅</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 mb-1">QHD (300만)</p>
                            <p className="text-xs text-gray-700">야외용 추천</p>
                          </div>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">화각 & 회전</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">100~110º (일반)</p>
                          <p className="text-xs text-gray-600">방/거실 천장 설치시 충분</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">140º (광각) + 회전 기능</p>
                          <p className="text-xs text-gray-700 mb-1">좌우 355º / 상하 90~110º 회전</p>
                          <p className="text-xs text-gray-600">아이 움직임 추적 / 반려동물용 / 넓은 공간</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">야간촬영</p>
                      <div className="bg-blue-50 rounded-lg p-3 mb-2">
                        <p className="text-xs font-bold text-gray-900 mb-1">적외선 램프 (흑백 촬영)</p>
                        <p className="text-xs text-gray-700">주/야간 자동 전환 (조도 센서)</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-bold text-gray-900 mb-1">⚠️ 베이비캠: 적외선 램프 밝기 확인 필수</p>
                        <p className="text-xs text-gray-700">램프 밝으면 아이가 불빛 쳐다봄. 제품 후기로 밝기 확인 후 구매</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 앱 사용편의 (가장 중요!) */}
                <GuideCard
                  number="03"
                  title="앱 사용편의 (가장 중요!)"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">모든 조작이 앱으로!</p>
                        <p className="text-xs text-gray-700">각도조절·녹화·통화·알림·감지 설정 모두 앱에서</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">필수 기능</p>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-red-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">1️⃣ 배속 재생 (필수!) 🔥</p>
                          <p className="text-xs text-gray-700">녹화 영상 빠르게 확인. 의외로 없는 제품 많음</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">2️⃣ 감지 민감도 설정</p>
                          <p className="text-xs text-gray-700">모션·소리 감지 조절 → 과도한 알림 방지</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">3️⃣ 스케줄 설정</p>
                          <p className="text-xs text-gray-700">시간대별 알림·녹화 ON/OFF</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">4️⃣ 움직임 감지 영역 설정</p>
                          <p className="text-xs text-gray-700">TV·창문 제외 → 불필요한 알림 방지</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">5️⃣ 프라이버시 존 설정</p>
                          <p className="text-xs text-gray-700">민감한 부분 가상 가림막</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 Tip</p>
                        <p className="text-xs text-gray-700"><strong>앱스토어·플레이스토어 후기 필수!</strong> 제품 평점 높아도 앱 오류 많은 경우 있음</p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 저장방식 & 선택가이드 */}
                <GuideCard
                  number="04"
                  title="저장방식 & 선택가이드"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">2가지 저장 방식</p>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-gray-900">① microSD카드</p>
                            <span className="text-xs font-bold text-blue-600">128GB 1만원대</span>
                          </div>
                          <p className="text-xs text-gray-700">128GB: 7~20일 저장. 전원 켜져야 확인 가능</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-gray-900">② 클라우드</p>
                            <span className="text-xs font-bold text-blue-600">월 4,000~6,000원</span>
                          </div>
                          <p className="text-xs text-gray-700">온라인 저장. 전원 꺼져도 확인 가능. 월 요금 발생</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">용도별 추천</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">👶 베이비캠</p>
                          <p className="text-xs text-gray-700">적외선 램프 밝기 / 회전 / 배속 재생 / 울음 감지</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">🐕 펫캠</p>
                          <p className="text-xs text-gray-700">회전 필수 / 광각 / 양방향 통화 / 감지 영역 설정</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">👴 시니어캠</p>
                          <p className="text-xs text-gray-700">프라이버시 존 / 안정적 앱 / 클라우드 / 양방향 통화</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 mb-2">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">필수 체크리스트</p>
                        <p className="text-xs text-gray-700">✅ AES-128 암호화 / ✅ 배속 재생 / ✅ 민감도·스케줄 설정 / ✅ 앱 후기</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 외부 설치 부적합</p>
                        <p className="text-xs text-gray-700">방진·방수 없음. 외부용은 별도 제품 필요</p>
                      </div>
                    </>
                  }
                />
              </div>
              ) : (
                // 분유포트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 핵심 스펙 */}
                <GuideCard
                  number="01"
                  title="핵심 스펙"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 용량: 1.3L 이상</p>
                        <p className="text-xs text-gray-600">하루 필요한 물 1~1.5L. 증발/최소수위 감안하면 1.3L 제품 → 실제 1L 사용</p>
                      </div>

                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 소재: 유리 + 스테인리스</p>
                        <p className="text-xs text-gray-600 mb-1">포트는 내열유리, 물 닿는 부분은 스테인리스(304 SUS면 충분)</p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">쿨링팬 필수</p>
                        <p className="text-xs text-gray-600">자연냉각 2~3시간 → 쿨링팬 1~1.5시간 (40~60분 단축)</p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-sm font-semibold text-gray-900 mb-2">보온 24시간 이상</p>
                        <p className="text-xs text-gray-600">물은 24시간마다 교체하므로 충분</p>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 세척편의 */}
                <GuideCard
                  number="02"
                  title="세척편의"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 주입구 10cm 이상</p>
                        <p className="text-xs text-gray-600">손이 들어가야 닦기 편함. 13~15cm면 더 좋음</p>
                      </div>

                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">✅ 뚜껑 3단 분리</p>
                        <p className="text-xs text-gray-600">뚜껑 완전 분리 + 실리콘 패킹 분리 가능 (물때 제거 필수)</p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-sm font-semibold text-gray-900 mb-2">포트 무게 800g 이하</p>
                        <p className="text-xs text-gray-600">물 넣으면 최대 2kg. 바닥은 평평하고 단순한 구조</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 편의 기능 */}
                <GuideCard
                  number="03"
                  title="편의 기능"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">원터치 자동모드 필수</p>
                        <p className="text-xs text-gray-600">끓이기+쿨링 자동으로 완료. 다른 모드는 거의 안 씀</p>
                      </div>

                      <div className="space-y-2">
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">🍵 차망 (티 스트레이너)</p>
                          <p className="text-xs text-gray-600">이유식 후 보리차 끓일 때 유용</p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">💡 수유등</p>
                          <p className="text-xs text-gray-600">새벽 수유 시 편함</p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">🔆 LED 밝기 조절</p>
                          <p className="text-xs text-gray-600">디스플레이 밝기 조절 가능하면 수면 방해 덜함</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: A/S */}
                <GuideCard
                  number="04"
                  title="A/S"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-red-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">⚠️ 무상 보증 1년 이상 필수</p>
                        <p className="text-xs text-gray-600">쿨링팬, 히팅 와이어 등 소모품 고장 확률 있음</p>
                      </div>

                      <div className="bg-blue-50 rounded-xl p-3.5">
                        <p className="text-sm font-semibold text-gray-900 mb-2">📞 고객센터 운영 시간</p>
                        <p className="text-xs text-gray-600">24시간 운영이 이상적. 야간 수유 중 고장 대비</p>
                      </div>
                    </>
                  }
                />
              </div>
              )}
            </div>

            {/* Footer CTA */}
            <div className="px-6 py-4 border-t border-gray-100 bg-white">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="w-full h-14 text-white text-base font-semibold rounded-2xl transition-all"
                style={{ backgroundColor: '#0084FE' }}
              >
                이해했어요
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
