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
  const hasContent = category === 'milk_powder_port' || category === 'baby_bottle' || category === 'baby_play_mat' || !category;

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
                {/* Card 1: 젖병 고르기 기본 */}
                <GuideCard
                  number="01"
                  title="용량과 구매 개수"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">용량별 사용 시기</p>
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2">
                          <div className="shrink-0 w-16 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-blue-600">소형</span>
                          </div>
                          <p className="text-sm text-gray-700 flex-1">160ml 이하 - 생후 3개월 이내</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="shrink-0 w-16 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-blue-600">중형</span>
                          </div>
                          <p className="text-sm text-gray-700 flex-1">240~260ml - 가장 오래 사용 (3개월~젖병 끊기)</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="shrink-0 w-16 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-blue-600">대형</span>
                          </div>
                          <p className="text-sm text-gray-700 flex-1">300ml 이상 - 많이 먹는 아이</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">분유 수유 시 필요 개수</p>
                        <ul className="text-xs text-gray-700 space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>3개월 미만: 소형 6~8개</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>3~6개월: 중형 6~8개</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>6개월 이후: 중·대형 4~6개</span>
                          </li>
                        </ul>
                      </div>
                      <p className="text-xs text-gray-600">
                        *모유 수유는 2~4개면 충분해요. 출산 후 3주 지나 수유 방식 확정 후 대량 구매를 권장해요.
                      </p>
                    </>
                  }
                />

                {/* Card 2: 소재별 장단점 */}
                <GuideCard
                  number="02"
                  title="소재별 특징"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2.5">플라스틱 젖병 (가볍고 다양)</p>
                      <div className="space-y-2.5 mb-3.5">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">PPSU - 가장 대중적</p>
                          <p className="text-xs text-gray-600 mb-1.5">내열·내구성 우수, 열탕 소독 가능</p>
                          <p className="text-xs text-gray-500">가격: 1~2만원 / 교체: 3~6개월</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">PP - 가성비</p>
                          <p className="text-xs text-gray-600 mb-1.5">매우 가볍고 저렴, 내구성은 낮음</p>
                          <p className="text-xs text-gray-500">가격: 5천~1만원 / 교체: 3개월</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1">PA - 프리미엄</p>
                          <p className="text-xs text-gray-600 mb-1.5">유리처럼 투명, 내열·내구성 최고</p>
                          <p className="text-xs text-gray-500">가격: 1.5~2만원 / 교체: 6개월</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="space-y-2.5">
                        <div className="flex gap-3">
                          <div className="text-2xl">🍶</div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">유리 젖병</p>
                            <p className="text-xs text-gray-600">미세플라스틱 걱정 없음. 무거움(200g). 교체: 1년</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="text-2xl">🧴</div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">실리콘 젖병</p>
                            <p className="text-xs text-gray-600">안깨짐. 눈금 안보임. 먼지 잘 붙음. 교체: 1년</p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 외관과 안전성 */}
                <GuideCard
                  number="03"
                  title="입구·그립·안전성"
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">입구 크기</p>
                          <p className="text-sm text-gray-600 leading-relaxed mb-2">
                            와이드형(6cm 이상)이나 일반형(5cm)이 분유 타기 편해요.
                            슬림형(4cm 이하)은 분유를 흘릴 수 있어요.
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">그립감</p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            유선형 구조나 홈이 있으면 잡기 편해요. 유리 젖병은 무거워서 미끄러질 수 있으니 홈이 있는 게 좋아요.
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">안전성</p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            국내 판매 모든 젖병은 <strong>BPA FREE</strong>예요 (2012년부터 법으로 금지).
                            식약처가 지속적으로 검사하고 있어요.
                          </p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 젖꼭지 선택하기 */}
                <GuideCard
                  number="04"
                  title="젖꼭지 고르기"
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-1">가장 중요한 포인트!</p>
                        <p className="text-xs text-gray-700">아기마다 맞는 젖꼭지가 달라요. 직접 물려봐야 알 수 있어요.</p>
                      </div>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">소재</p>
                          <div className="space-y-2">
                            <div className="flex gap-2 text-sm">
                              <div className="shrink-0 w-16 bg-gray-100 rounded-lg px-2 py-1 text-center">
                                <p className="text-xs font-semibold text-gray-900">실리콘</p>
                              </div>
                              <p className="text-xs text-gray-600 flex-1">가장 많이 사용. 열탕 소독 가능. 교체 2-3개월</p>
                            </div>
                            <div className="flex gap-2 text-sm">
                              <div className="shrink-0 w-16 bg-gray-100 rounded-lg px-2 py-1 text-center">
                                <p className="text-xs font-semibold text-gray-900">천연고무</p>
                              </div>
                              <p className="text-xs text-gray-600 flex-1">말랑말랑. 거부 반응 적음. 교체 1개월</p>
                            </div>
                          </div>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">구멍 크기와 단계</p>
                          <p className="text-xs text-gray-600 mb-2">개월 수에 따라 구멍이 커지는데, <strong>아기가 잘 먹으면 굳이 단계 올리지 않아도 돼요!</strong></p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>O형: 일반적, 분유 수유용</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>Y형: 흡입력 강한 아기, 이유식 가능</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>X형: 이유식기, 가장 많은 양</span>
                            </li>
                          </ul>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">호환성</p>
                          <p className="text-xs text-gray-600">
                            젖꼭지 정착 전까지는 타사 젖꼭지 호환이 잘되는 젖병이 편리해요.
                            더블하트 모유실감 등 유명 젖꼭지는 제조사에 호환 여부 문의 가능해요.
                          </p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 배앓이 방지 */}
                <GuideCard
                  number="05"
                  title="배앓이 방지 기능"
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        배앓이 방지 기능은 젖병 내외부 공기를 흐르게 해서 <strong>진공 상태를 방지</strong>하고
                        <strong> 젖꼭지 유착을 막아주는</strong> 역할이에요.
                      </p>
                      <div className="bg-gray-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">중요한 사실</p>
                        <ul className="text-xs text-gray-700 space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>젖병 수유가 배앓이 원인이라는 명확한 증거는 없어요</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>모유 수유 시에도 배앓이 발생 가능해요</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>특정 젖병으로 배앓이 예방 가능하다는 증거 없음</span>
                          </li>
                        </ul>
                      </div>
                      <p className="text-xs text-gray-600">
                        배앓이 방지 기능 자체는 젖꼭지 유착 방지에 필요하지만,
                        제품 선택의 주요 기준으로 삼을 필요는 없어요.
                      </p>
                    </>
                  }
                />

                {/* Card 6: 세척과 소독 */}
                <GuideCard
                  number="06"
                  title="세척과 소독"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">세척 편의성</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>입구가 넓을수록 (와이드형·일반형) 세척 편함</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>부품 개수가 적을수록 세척 쉬움</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>유선형 굴곡 구조는 틈새 세척 주의</span>
                        </li>
                      </ul>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">소독 방법</p>
                      <p className="text-xs text-gray-600 mb-2">
                        열탕, 스팀, 전자레인지, UV자외선, 식기세척기 등 다양해요.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">제조사 사용설명서 필수 확인!</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>같은 소재라도 권장 소독 방법이 달라요</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>뚜껑·스크류는 PP소재라 열탕 시간 주의</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>UV소독 지양은 환경호르몬이 아닌 변형·변색 때문</span>
                          </li>
                        </ul>
                      </div>
                    </>
                  }
                />

                {/* Card 7: 사용 편의성 */}
                <GuideCard
                  number="07"
                  title="편의 기능과 가성비"
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">누수 방지</p>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            부품 개수가 적고 조립이 간단할수록 분유가 샐 확률이 적어요.
                            구매 전 실사용 후기에서 누수 여부 확인 필수!
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">빨대컵 활용</p>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            생후 8개월부터 빨대컵 사용 시작. 액세서리만 추가 구매하면 비용 절약 가능해요.
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">교체주기와 가성비</p>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-700">PP 소재</span>
                              <span className="text-gray-500">저렴 / 3개월 교체</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-700">PPSU 소재</span>
                              <span className="text-gray-500">중간 / 3~6개월 교체</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-700">유리·실리콘</span>
                              <span className="text-gray-500">비쌈 / 1년 교체</span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            단순히 저렴한 것보다 교체주기를 고려한 합리적 구매가 좋아요.
                          </p>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_play_mat' ? (
                // 놀이매트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 왜 필요한가요? */}
                <GuideCard
                  number="01"
                  title="안전성과 충격흡수"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        하루 종일 움직이는 아이가 딱딱한 바닥에서 넘어지면 충격 흡수가 제대로 되지 않아 부상 위험이 높아요.
                        놀이매트는 떨어지거나 넘어졌을 때 발생하는 충격을 흡수해 줍니다.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">머리쿵 방지</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          특히 머리가 무거운 <strong>18개월 이전 아이들</strong>은 멀쩡히 앉아있다가도 뒤로 넘어져 버리는 경우가 많아요.
                          배밀기를 하고 기어다니려는 조짐이 보이면 놀이매트 구매를 고려하세요.
                        </p>
                      </div>
                      <p className="text-xs text-gray-600">
                        *폴더매트는 두께 4cm 이상으로 충격흡수 효과가 가장 우수해요.
                      </p>
                    </>
                  }
                />

                {/* Card 2: 층간소음 효과 */}
                <GuideCard
                  number="02"
                  title="층간소음 완화 효과"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">경량충격음은 효과 있어요</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-2.5">
                        장난감이 떨어지는 소리, 발망치 소리 같은 경량충격음은 <strong>4~6dB 저감</strong>되어 체감상 확실히 줄어들어요.
                      </p>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">중량충격음은 효과 미미해요</p>
                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 중요한 사실</p>
                        <p className="text-xs text-gray-700 leading-relaxed mb-2">
                          쿵쿵 뛰거나 소파에서 뛰어내리는 등 <strong>중량충격음은 저감 효과가 미미</strong>해요.
                          매트 종류와 상관없이 수치상 3dB 정도만 줄었고, 체감상 거의 줄어들지 않았어요.
                        </p>
                        <p className="text-xs text-gray-600">
                          놀이매트를 깔았어도 쿵쿵거리는 소음은 이웃을 위해 주의가 필요해요.
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 추가 효과와 한계점 */}
                <GuideCard
                  number="03"
                  title="바닥 보호와 한계점"
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">바닥 오염·손상 방지</p>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            방수 처리되어 구토, 음료를 흘려도 매트만 닦으면 돼요.
                            색연필, 크레파스 낙서나 장난감 긁힘으로부터 바닥을 보호해줘요.
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">인테리어 효과</p>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            시공매트는 바닥재 교체 효과가 있어 집안 분위기를 바꿀 수 있어요.
                            요즘은 인테리어에 잘 녹아드는 디자인 제품들이 많아요.
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">한계점</p>
                          <ul className="text-xs text-gray-600 space-y-1.5">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>폴더매트: 로봇청소기 못 올라감, 틈새 청소 어려움</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>롤매트/시공매트: 바닥 환기 어려워 곰팡이 우려</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>이사 시 사이즈 안 맞아 재구매 필요한 경우 많음</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 놀이방매트 (PVC) */}
                <GuideCard
                  number="04"
                  title="놀이방매트 (PVC)"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">가장 대중적인 놀이매트</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        PVC를 사용해서 PVC매트라고도 불러요. 쫀쫀하고 단단한 코팅이 되어 있어요.
                      </p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">가격</span>
                          <span className="font-semibold text-gray-900">㎡당 4~5만원</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">두께</span>
                          <span className="font-semibold text-gray-900">보통</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-2">장점</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>신축성과 복원성 뛰어남</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>내구성이 좋음</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>바닥 단차 적어 로봇청소기 잘 올라감</span>
                          </li>
                        </ul>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 폴더매트 */}
                <GuideCard
                  number="05"
                  title="폴더매트"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">가장 두꺼운 매트 (충격흡수 최고)</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        2~5단으로 접을 수 있는 구조. PU(인조가죽) 커버 + PE폼 충전재.
                      </p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">가격</span>
                          <span className="font-semibold text-gray-900">㎡당 4~5만원</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">두께</span>
                          <span className="font-semibold text-blue-600">최소 4cm (가장 두꺼움)</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                          <ul className="text-xs text-gray-700 space-y-0.5">
                            <li>• 세탁 가능</li>
                            <li>• 접어서 청소 편함</li>
                            <li>• 충격흡수 최고</li>
                          </ul>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">단점</p>
                          <ul className="text-xs text-gray-600 space-y-0.5">
                            <li>• 틈새 청소 어려움</li>
                            <li>• 규격 정해짐</li>
                            <li>• 로봇청소기 X</li>
                          </ul>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-1.5">자이언트 매트 (폴더매트 변형)</p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        커버 사이즈가 커서 <strong>봉제선이 없어 표면 청소 편리</strong>해요.
                        하지만 접히지 않아 매트 아래 바닥청소는 어려워요.
                      </p>
                    </>
                  }
                />

                {/* Card 6: 롤매트와 퍼즐매트 */}
                <GuideCard
                  number="06"
                  title="롤매트·퍼즐매트"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">셀프 시공형 매트</p>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">롤매트</p>
                          <p className="text-xs text-gray-600 mb-2">
                            PVC표면 + PE폼. 장판처럼 말려 있고 원하는 사이즈로 자를 수 있어요.
                          </p>
                          <div className="flex items-center gap-3 text-xs mb-2">
                            <span className="text-gray-700">가격</span>
                            <span className="font-semibold">㎡당 3~4만원</span>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-600">
                              ⚠️ 무조건 틈새 생김 → 청소 어려움, 곰팡이 우려
                            </p>
                          </div>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">퍼즐매트</p>
                          <p className="text-xs text-gray-600 mb-2">
                            EVA표면 + PE폼. 두께 1~3.5cm. 저가형은 엠보싱, 고가형은 PVC코팅.
                          </p>
                          <div className="flex items-center gap-3 text-xs mb-2">
                            <span className="text-gray-700">가격</span>
                            <span className="font-semibold text-blue-600">㎡당 1.5만원 (가장 저렴)</span>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-600">
                              ⚠️ 내구성 약함, 틈새 많아 과자·음료 흘리는 영유아에겐 부적합
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 7: 시공매트 */}
                <GuideCard
                  number="07"
                  title="시공매트 (프리미엄)"
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        업체에서 조립매트를 재단하여 바닥 전체에 까는 방식이에요.
                        <strong> 가장 깔끔하고 인테리어 효과가 극적</strong>이에요.
                      </p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">가격</span>
                          <span className="font-semibold text-red-600">㎡당 5~10만원 (가장 비쌈)</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-2">장점</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>가구, 냉장고, 에어컨 밑까지 깔 수 있음</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>물막이 구조로 청소 편리</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>극적인 인테리어 효과 (바닥재 교체 효과)</span>
                          </li>
                        </ul>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-2">단점</p>
                        <ul className="text-xs text-gray-600 space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>의자·소파·테이블 밑에 자국 남음</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>매트 사이 이물질 청소 어려움</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>물 새면 걷어내어 닦아야 함 (매우 번거로움)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                            <span>환기 안되어 곰팡이 발생 가능성</span>
                          </li>
                        </ul>
                      </div>
                    </>
                  }
                />
              </div>
              ) : (
                // 분유포트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 왜 필요한가요? */}
                <GuideCard
                  number="01"
                  title="육아 필수템인 이유"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        하루에 보통 <strong className="font-semibold">8~10번</strong> 분유를 타야 하는데요.
                        매번 물을 끓이고 식히고, 밤낮없이 반복하려면 정말 힘들죠.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5  mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">분유포트는 이 과정을 자동으로 해줘요!</p>
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="font-medium">끓이고</span>
                          <span>→</span>
                          <span className="font-medium">식히고</span>
                          <span>→</span>
                          <span className="font-medium">따뜻하게 보온까지</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        *6개월 미만 아기 물은 2분 이상 끓여 사용하는 게 좋아요 (WHO, 식약처 권고)
                      </p>
                    </>
                  }
                />

                {/* Card 2: 작동 원리 */}
                <GuideCard
                  number="02"
                  title="버튼 하나로 끝내기"
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        자동 원터치 모드 하나면 끝이에요. 물만 넣고 버튼 누르면 알아서 다 해줘요.
                      </p>
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="shrink-0 w-7 h-7 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            1
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">끓이기 3~5분</p>
                            <p className="text-sm text-gray-600">100℃에서 더 끓여 염소와 균 제거</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="shrink-0 w-7 h-7 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            2
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">식히기 40~60분</p>
                            <p className="text-sm text-gray-600">쿨링팬으로 분유 타기 좋은 온도로</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="shrink-0 w-7 h-7 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            3
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">보온 12~24시간</p>
                            <p className="text-sm text-gray-600">언제든 바로 분유 탈 수 있게</p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 용량과 소재 */}
                <GuideCard
                  number="03"
                  title="이 정도는 기본"
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">용량은 1.3L 이상</p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            하루 필요한 물이 보통 1~1.5L 정도예요. 1.3L면 여유있게 사용할 수 있답니다.
                          </p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">소재는 유리 + 스테인리스</p>
                          <p className="text-sm text-gray-600 mb-2.5 leading-relaxed">
                            안이 보이는 유리 포트가 일반적이고, 물이 닿는 부분은 스테인리스를 써요.
                          </p>
                          <div className="flex gap-2 text-sm">
                            <div className="flex-1 bg-gray-50 rounded-lg p-2.5">
                              <p className="font-semibold text-gray-900 mb-0.5">304 SUS</p>
                              <p className="text-gray-600">주방 수저용</p>
                            </div>
                            <div className="flex-1 bg-blue-50 rounded-lg p-2.5">
                              <p className="font-semibold text-gray-900 mb-0.5">316 SUS</p>
                              <p className="text-gray-600">의료용 프리미엄</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 세척과 사용 */}
                <GuideCard
                  number="04"
                  title="매일 써야 하니까"
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">세척하기 편한 게 좋아요</p>
                          <ul className="text-xs text-gray-600 space-y-1.5">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>주입구 10cm 이상 (손 넣어 닦기 편하게)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>뚜껑 완전 분리형</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>포트 무게 800g 이하 (손목 안 아프게)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span>바닥이 평평해야 닦기 쉬워요</span>
                            </li>
                          </ul>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">있으면 편한 기능</p>
                          <ul className="text-xs text-gray-600 space-y-1.5">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                              <span>수유등 (새벽에 불 안 켜도 돼요)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                              <span>원터치 자동모드</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                              <span>차망 (분유 끝나면 보리차 끓이기 좋아요)</span>
                            </li>
                          </ul>
                        </div>
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
