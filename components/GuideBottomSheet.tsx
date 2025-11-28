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
              ) : category === 'baby_formula_dispenser' ? (
                // 분유제조기 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 분유 호환 여부 */}
                <GuideCard
                  number="01"
                  title="분유 호환 여부"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">내가 쓰는 분유가 호환되는지 확인 필수!</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">세팅 번호란?</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          분유마다 농도가 달라서 제조기마다 고유 번호가 있어요.
                          <strong> 내 분유의 세팅 번호가 없으면 사용 불가능</strong>해요.
                        </p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-16 h-7 bg-green-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-green-600">호환 OK</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">대부분의 대중적인 분유 (앱솔루트, 임페리얼 등)</p>
                        </div>
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-16 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-red-600">주의!</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">산양분유, 특수분유는 호환 안 되는 제품도 있음</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">세팅 번호 찾는 방법</p>
                      <div className="space-y-2">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">① 홈페이지에서 분유명으로 찾기</p>
                          <p className="text-xs text-gray-600">제조사와 제품명 직접 검색 (번거로움)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">② 바코드 번호 입력</p>
                          <p className="text-xs text-gray-600">분유통 바코드를 홈페이지에 입력 (정확)</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">③ 앱 연동 바코드 스캔 (가장 정확)</p>
                          <p className="text-xs text-gray-600">앱으로 바코드 찍으면 자동 세팅 (실수 없음)</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 농도 정확성 */}
                <GuideCard
                  number="02"
                  title="농도 정확성"
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        손 계량과 비슷한 오차 범위예요. 30ml 같은 큰 단위는 손보다 더 정확해요.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-1.5">10ml 단위 조절이 편해요</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          100ml 먹는 아기라면 10ml 단위로 정확히 조절 가능!
                          30ml 단위면 90ml나 120ml로 타야 해서 20ml 남아요.
                        </p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">⚠️ 농도가 묽다면 3가지 확인</p>
                      <div className="space-y-2">
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-12 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-900">세척</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">3-4회 작동 후 깔때기·노즐 세척 필수 (분유 뭉침 방지)</p>
                        </div>
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-12 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-900">조립</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">부품 누락 시 분유량 오류 발생 (개수 체크)</p>
                        </div>
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 w-12 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-900">세팅</span>
                          </div>
                          <p className="text-xs text-gray-700 flex-1">세팅 번호 잘못 입력하면 정량 안 맞음</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-3">
                        *대부분 제품이 1회당 30~240ml까지 조유 가능해요. 최대 300ml 제품도 있지만 240ml면 충분해요.
                      </p>
                    </>
                  }
                />

                {/* Card 3: 온도 & 뭉침/거품 */}
                <GuideCard
                  number="03"
                  title="온도 & 뭉침/거품"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">온도 범위가 넓을수록 좋아요</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        분유마다 권장 온도가 달라요. 최근엔 대부분 40~50℃에서 타지만,
                        일부 분유는 70℃를 권장해요.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">3단계 조절</p>
                          <p className="text-xs text-gray-600">40℃ 근처 (기본형)</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">1℃ 단위 조절</p>
                          <p className="text-xs text-gray-600">40~70℃ (프리미엄)</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">뭉침 & 거품</p>
                      <ul className="text-xs text-gray-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>대부분 회오리 출수 방식으로 뭉침 없이 잘 조유돼요</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>받침대 높이 조절 가능하면 거품 발생 더 줄일 수 있어요</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>스틱 섞기 방식은 뭉침 없지만 제조 시간 1분 이상</span>
                        </li>
                      </ul>
                    </>
                  }
                />

                {/* Card 4: 세척 주기와 방법 */}
                <GuideCard
                  number="04"
                  title="세척 주기와 방법"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">부분 세척: 하루 1-2회</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-2">
                        3-4회 작동 시 습기로 깔때기·노즐·분유통 바닥에 분유 끼임 발생
                      </p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>깔때기·노즐: 물 세척</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>분유통 바닥: 브러시로 털어주기 (물 X)</span>
                        </li>
                      </ul>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">전체 세척: 주 1-2회</p>
                      <p className="text-xs text-gray-600 mb-3">
                        모든 부품 물 세척 필수. 아기가 먹는 분유와 물이 담기는 곳이니 주기적 세척 중요해요.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">자동 세척 기능</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          깔때기를 자동으로 세척해주는 제품도 있어요. 부분 세척을 생략할 수 있지만,
                          <strong> 분유통 바닥 털기와 주 1회 전체 세척은 여전히 필요</strong>해요.
                        </p>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 식기세척기, 젖병소독기 사용 금지</p>
                        <p className="text-xs text-gray-700">
                          모든 제조사에서 제품 변형 우려로 금지하고 있어요.
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 세척 편의성 */}
                <GuideCard
                  number="05"
                  title="세척 편의성"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">부품 개수가 적을수록 편해요</p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">부분 세척 개수</span>
                          <span className="text-xs text-gray-600">2~5개 (깔때기·노즐)</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">전체 세척 개수</span>
                          <span className="text-xs text-gray-600">10~20개 (15개 이하면 적은 편)</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 여분 구매 권장</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          깔때기·노즐 여분을 구매해서 교체 사용하면 세척 번거로움을 줄일 수 있어요.
                          제조사 이벤트에서 사은품으로 주기도 하니 확인해보세요!
                        </p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">편의성 체크리스트</p>
                      <ul className="text-xs text-gray-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>분유통·물통 입구가 넓으면 손 넣어 세척 편리</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>부품 사이즈가 클수록 세척·조립 쉬움 (잃어버릴 위험 적음)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>배관 세척 = 물만 출수하는 기능 (모든 제품 가능)</span>
                        </li>
                      </ul>
                    </>
                  }
                />

                {/* Card 6: 용량과 보충 */}
                <GuideCard
                  number="06"
                  title="용량과 보충"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">재질</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-2">
                        대부분 트라이탄, PP, AS 플라스틱 소재 사용. 모두 내구성 좋아요.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1">트라이탄 추천</p>
                        <p className="text-xs text-gray-700">의료용품 소재. 유해물질 걱정된다면 트라이탄 제품 선택!</p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">용량 및 보충 주기</p>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">분유통 400g</span>
                          <span className="text-xs text-gray-600">20회 조유 → 2-3일 주기 보충</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">분유통 260~300g</span>
                          <span className="text-xs text-gray-600">9회 조유 → 1-2일 주기 보충</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">물통 대부분</span>
                          <span className="text-xs text-gray-600">하루 1번 이상 보충</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">완분·쌍둥이라면 대용량 추천</p>
                        <p className="text-xs text-gray-700">
                          분유는 가루 날림 심하고 자주 열면 습기·세균 번식 위험 있어요.
                          보충 주기가 긴 대용량이 좋아요.
                        </p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">보충 편의</p>
                      <ul className="text-xs text-gray-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>물통·분유통 투명하면 뚜껑 안 열고 잔량 확인 가능</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>물 부족 알림 있으면 패널에 깜박임 (분유 낭비 방지)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span>상부 급수 가능 제품은 물통 분리 없이 보충 가능 (편리)</span>
                        </li>
                      </ul>
                    </>
                  }
                />

                {/* Card 7: 편의 기능 & A/S */}
                <GuideCard
                  number="07"
                  title="편의 기능 & A/S"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">애플리케이션 연동</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                          <ul className="text-xs text-gray-700 space-y-0.5">
                            <li>• 바코드 자동 세팅</li>
                            <li>• 조작 쉬움</li>
                            <li>• 조유 기록</li>
                          </ul>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">한계</p>
                          <ul className="text-xs text-gray-600 space-y-0.5">
                            <li>• 근처 가야 함</li>
                            <li>• 연결 끊김 있음</li>
                            <li>• 수동 사용 많음</li>
                          </ul>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        💡 앱 연동 제품 구매 전 앱스토어 평점 확인 추천!
                      </p>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">센서 & 부가기능</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>젖병·물 부족·도어 센서 → 정확한 분유 제조 환경</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>조명기능: 밤 수유 시 편리</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span>차일드락: 아기가 만질 우려 시</span>
                        </li>
                      </ul>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">A/S</p>
                      <div className="bg-blue-50 rounded-xl p-3.5">
                        <ul className="text-xs text-gray-700 space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>해외 브랜드도 국내지사 있어서 A/S 빠른 편</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>A/S 기간: 12개월 기본 (일부 18개월)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>일부 제조사는 대체품 선출고 서비스 제공</span>
                          </li>
                        </ul>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        *소음: 62-70dB (조용한 차~세탁기), 작동 시간 짧아 큰 불편 없음 | 전기요금: 월 약 1,000원
                      </p>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_bottle_sterilizer' ? (
                // 젖병소독기 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 살균 방식 */}
                <GuideCard
                  number="01"
                  title="살균 방식"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">3가지 소독 방식</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">① 열탕소독</p>
                          <p className="text-xs text-gray-600">끓는 물에 넣었다 건지기. 살균력 최고, 매우 번거로움</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">② 스팀소독</p>
                          <p className="text-xs text-gray-600">80℃ 이상 수증기로 살균. 제품 세척 필요</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">③ UV소독 (가장 편리)</p>
                          <p className="text-xs text-gray-600">UVC 자외선으로 살균+건조. 편리하지만 가격 비쌈</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        *이 가이드는 가장 대중적인 UVC-자외선 살균 방식 젖병소독기에 대해 설명해요.
                      </p>
                    </>
                  }
                />

                {/* Card 2: UVC 자외선 살균 */}
                <GuideCard
                  number="02"
                  title="UVC 자외선 살균"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">자외선량이 많을수록 살균 효과 좋아요</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        UV-C 파장 200~280nm의 자외선이 세균을 죽여요. 식당 컵 살균기와 같은 원리예요.
                      </p>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">살균 인증 확인하기</p>
                      <p className="text-xs text-gray-600 mb-2">
                        KTR, KCL 기관에서 인증 받은 제품이 많아요. 살균 정도는 99.9~99.999%로 표시돼요.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">이 세균들이 인증됐는지 확인!</p>
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
                        ⚠️ 민간기관 인증이라 필수는 아니지만, 있으면 신뢰도가 높아요.
                      </p>
                    </>
                  }
                />

                {/* Card 3: LAMP vs LED */}
                <GuideCard
                  number="03"
                  title="UVC-LAMP vs LED"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">자외선 발생 방식 2가지</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">UVC-LAMP (형광등 형태)</p>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                              <ul className="text-xs text-gray-700 space-y-0.5">
                                <li>• 자외선량 많음</li>
                                <li>• 사각지대 적음</li>
                                <li>• 가격 저렴</li>
                              </ul>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">단점</p>
                              <ul className="text-xs text-gray-600 space-y-0.5">
                                <li>• 6개월~1년 교체</li>
                                <li>• 소량 오존 발생</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">UVC-LED</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                              <ul className="text-xs text-gray-700 space-y-0.5">
                                <li>• 반영구 사용</li>
                                <li>• 환경 친화적</li>
                              </ul>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">단점</p>
                              <ul className="text-xs text-gray-600 space-y-0.5">
                                <li>• 가격 비쌈</li>
                                <li>• LED 개수 확인 필요</li>
                                <li>• 사각지대 가능</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 건조 타입 */}
                <GuideCard
                  number="04"
                  title="건조 타입"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">건조는 살균만큼 중요해요!</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        물기가 있으면 세균이 번식해요. 건조 기능이 필수예요.
                      </p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">열풍건조 (온풍기 원리)</p>
                          <p className="text-xs text-gray-600 mb-1">40~60℃로 빠른 건조</p>
                          <p className="text-xs text-red-600">⚠️ 젖병 소재 변형 가능성</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">자연건조 (선풍기 원리)</p>
                          <p className="text-xs text-gray-600 mb-1">20~30℃ 상온 건조</p>
                          <p className="text-xs text-blue-600">✓ 소재 구분 없이 안전</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">열풍/자연 둘 다</p>
                          <p className="text-xs text-gray-600">상황에 따라 선택 가능 (추천)</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 올바른 사용법</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>세척 후 3~5회 탈탈 털기</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>뚜껑 열어서 세워두기</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>젖병 사이 여유공간 확보</span>
                          </li>
                        </ul>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 용량과 크기 */}
                <GuideCard
                  number="05"
                  title="용량과 크기"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">여유있게 선택하는 게 좋아요</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-1.5">신생아 기준 젖병 10개 이상</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          완분(분유 100%) 기준으로 하루 160ml 젖병 6~10회 수유해요.
                          나중엔 장난감, 유아식기도 소독하니 넉넉하게 선택하세요!
                        </p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">내부 크기 추천</span>
                          <span className="text-xs text-gray-600">250x250mm 이상 (12개 수납)</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">높이 (2단 쌓기)</span>
                          <span className="text-xs text-gray-600">300mm 이상</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        *외형 크기가 비슷해도 램프/LED 위치에 따라 내부 공간이 달라요. 내부 크기 확인 필수!
                      </p>
                    </>
                  }
                />

                {/* Card 6: 선반 구성 */}
                <GuideCard
                  number="06"
                  title="선반 구성"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">2단 vs 1단</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">2단 선반 (가장 많음)</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                              <ul className="text-xs text-gray-700 space-y-0.5">
                                <li>• 공간 효율 좋음</li>
                                <li>• 젖병/부자재 분리</li>
                              </ul>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">단점</p>
                              <ul className="text-xs text-gray-600 space-y-0.5">
                                <li>• 넣고 빼기 번거로움</li>
                                <li>• 사각지대 가능</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">회전(원형) vs 고정(사각)</p>
                          <div className="space-y-1.5 text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span>원형 선반</span>
                              <span className="text-gray-500">고른 살균 / 수납 적음</span>
                            </div>
                            <div className="flex justify-between">
                              <span>사각 선반</span>
                              <span className="text-gray-500">회전 안됨 / 수납 많음</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 7: 사용 편의 */}
                <GuideCard
                  number="07"
                  title="사용 편의"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">조작 방식</p>
                      <p className="text-xs text-gray-600 mb-2">
                        대부분 자동모드(살균+건조), 살균, 건조, 반복 기능 탑재
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">체크 포인트</p>
                        <ul className="text-xs text-gray-700 space-y-1">
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
                            <span>음소거 모드 있는지 (부저음 불편할 때)</span>
                          </li>
                        </ul>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">소음 & 전기요금</p>
                      <div className="space-y-1.5 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span>소음</span>
                          <span className="text-gray-500">40~45dB (백색소음)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>전기요금 (열풍)</span>
                          <span className="text-gray-500">월 1,000~3,000원</span>
                        </div>
                        <div className="flex justify-between">
                          <span>전기요금 (자연)</span>
                          <span className="text-gray-500">월 500원 이하</span>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'thermometer' ? (
                // 체온계 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 체온계 종류 비교 */}
                <GuideCard
                  number="01"
                  title="체온계 종류 비교"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">3가지 주요 타입</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">펜타입 체온계</p>
                          <p className="text-xs text-gray-600 mb-1">서미스터 센서 / 3~5분 소요</p>
                          <p className="text-xs text-gray-500">저렴하고 정확하지만 측정 시간 김</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">귀체온계 (고막) ⭐ 추천</p>
                          <p className="text-xs text-gray-600 mb-1">적외선 센서 / 1~2초 측정</p>
                          <p className="text-xs text-blue-600">정확하고 빠르고 간편한 최고 효율</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">비접촉식 (피부)</p>
                          <p className="text-xs text-gray-600 mb-1">적외선 센서 / 1~2초 측정</p>
                          <p className="text-xs text-red-600">편리하지만 부정확 (보조용)</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600">
                        *국내 판매 체온계는 모두 식약처 승인 2급 의료기기예요
                      </p>
                    </>
                  }
                />

                {/* Card 2: 귀체온계 (고막) */}
                <GuideCard
                  number="02"
                  title="귀체온계 (고막)"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">가장 효율적인 체온계</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">왜 정확할까?</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          고막은 체온을 조절하는 시상하부와 동일한 동맥으로 혈액을 공급받아서
                          <strong> 심부온도 측정에 적합</strong>해요. 1~2초 만에 체온 확인 가능!
                        </p>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">의료기기 품목명</p>
                      <p className="text-xs text-gray-600 mb-3">귀적외선체온계</p>
                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 사용하지 말아야 할 때</p>
                        <p className="text-xs text-gray-600">귀 내부에 염증이 있거나 분비물이 나오는 경우</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 필터 유무 & 멀티 */}
                <GuideCard
                  number="03"
                  title="필터 유무 & 멀티"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">필터 사용 vs 미사용</p>
                      <div className="space-y-3 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">필터 사용 제품</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">장점</p>
                              <ul className="text-xs text-gray-700 space-y-0.5">
                                <li>• 위생 좋음</li>
                                <li>• 센서 보호</li>
                              </ul>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                              <p className="text-xs font-semibold text-gray-900 mb-1">단점</p>
                              <ul className="text-xs text-gray-600 space-y-0.5">
                                <li>• 추가 비용</li>
                                <li>• 이질적 촉감</li>
                              </ul>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">필터 가격: 1,500~2,000원/1box(20개)</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">필터 미사용 제품</p>
                          <p className="text-xs text-gray-600 mb-1">비용 절약, 편안한 촉감</p>
                          <p className="text-xs text-gray-500">위생관리: 알코올 솜으로 소독</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">멀티 체온계 (고막+피부)</p>
                      <p className="text-xs text-gray-600 mb-2">
                        귀 체온계 + 비접촉식 + 사물온도 측정 모드 탑재. 활용도 높지만
                        <strong> 모드별 보정값 인지 필수</strong>
                      </p>
                    </>
                  }
                />

                {/* Card 4: 측정 정확도 */}
                <GuideCard
                  number="04"
                  title="측정 정확도"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">부위별 정확도 순위</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">직장 &gt; 고막 &gt; 구강 &gt; 겨드랑이 &gt;&gt; 이마</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          외부 환경 영향을 덜 받는 부위일수록 정확도 높아요.
                          정확도 높은 부위는 심부 체온에 가까워 측정값도 높은 편이에요.
                        </p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">일반 체온계 정확도</span>
                          <span className="text-xs text-gray-600">±0.2℃</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">비접촉식</span>
                          <span className="text-xs text-gray-600">±0.3℃</span>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3.5">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 비접촉식이 부정확한 이유</p>
                        <p className="text-xs text-gray-700">
                          피부는 외부 영향을 많이 받고, 열 나면 땀으로 피부온도가 낮아져요.
                          대략적 확인용으로만 사용하세요!
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 올바른 사용법 */}
                <GuideCard
                  number="05"
                  title="올바른 사용법"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">정밀도를 높이는 방법</p>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3">
                        동일한 위치에 동일한 방법으로 측정하는 게 중요해요.
                        적외선 센서는 1cm 거리 차이에도 측정값이 달라져요.
                      </p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-2">귀체온계 올바른 사용법</p>
                        <p className="text-xs text-gray-700 mb-2">
                          귓구멍은 일자가 아니에요. <strong>귀를 뒤쪽으로 잡아당겨
                          측정부와 고막이 일직선</strong>이 되도록 하세요.
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
                      <p className="text-xs text-gray-600">
                        ⚠️ 올바른 사용법 숙지 안 하면 1도 이상 오차 발생 가능!
                      </p>
                    </>
                  }
                />

                {/* Card 6: 부가 기능 */}
                <GuideCard
                  number="06"
                  title="부가 기능"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">어두운 곳에서 사용</p>
                      <ul className="text-xs text-gray-600 space-y-1.5 mb-3">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>백라이트</strong>: 화면 불빛으로 측정값 확인 편리</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                          <span><strong>라이트</strong>: 귀체온계 야간 사용 시 필수 (브라운은 호환 라이트 1만원대)</span>
                        </li>
                      </ul>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">실용 기능</p>
                      <ul className="text-xs text-gray-600 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span><strong>측정거리 알람</strong>: 비접촉식 1cm 거리 자동 인식</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span><strong>사물온도 측정</strong>: 분유, 목욕물 온도 측정</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                          <span><strong>앱 연동</strong>: 블루투스로 자동 기록 (선택사항)</span>
                        </li>
                      </ul>
                    </>
                  }
                />

                {/* Card 7: 보관 & 추천 */}
                <GuideCard
                  number="07"
                  title="보관 & 추천"
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">보관용 구성품</p>
                      <p className="text-xs text-gray-600 mb-3">
                        민감한 센서 보호를 위해 뚜껑이나 케이스 제공하는 제품 선택하세요.
                        필터 사용 제품은 필터 보관 케이스 있으면 편리해요.
                      </p>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">제품 추천</p>
                      <div className="space-y-2">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">기본 추천: 귀체온계</p>
                          <p className="text-xs text-gray-600">1~2초 측정, 정확, 올바른 사용법 숙지 필수</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">신생아 (6개월 이하)</p>
                          <p className="text-xs text-gray-600">귓구멍 작아서 펜타입 (겨드랑이) 추천</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">보조용</p>
                          <p className="text-xs text-gray-600">비접촉식 (편리하지만 부정확, 대략적 확인용)</p>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'car_seat' ? (
                // 카시트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 카시트 종류 비교 */}
                <GuideCard
                  number="01"
                  title="카시트 종류 비교"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">4가지 종류 한눈에 비교</p>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">① 인펀트 (바구니형)</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>사용:</strong> 40~87cm / 13kg / ~18개월</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>가격:</strong> 10~30만원</p>
                          <p className="text-xs text-gray-600">목 못 가누는 신생아용. 뒤보기 전용. 트래블시스템 가능</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">② 컨버터블 (가장 대중적) 🔥</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>사용:</strong> 6개월~만 4,5세 / 105cm / 18kg</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>가격:</strong> 50~80만원</p>
                          <p className="text-xs text-gray-600">앞보기/뒤보기 회전 가능. 신생아 이너시트 제공. 생애 첫 카시트로 가장 많이 선택</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">③ 토들러 (선택사항)</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>사용:</strong> 15개월~12세 / 150cm / 36kg</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>가격:</strong> 20~50만원</p>
                          <p className="text-xs text-gray-600">컨버터블과 주니어 사이 중간 단계. 5점식→3점식 전환 가능</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">④ 주니어 (가장 오래 사용)</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>사용:</strong> 4,5세~12세 / 140cm / 36kg</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>가격:</strong> 10~40만원</p>
                          <p className="text-xs text-gray-600">부스터 카시트. 성인 안전벨트를 아이 사이즈에 맞게 조절</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 카시트 사용 기간 */}
                <GuideCard
                  number="02"
                  title="카시트 사용 기간"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-red-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">법적 의무 vs 실제 권장</p>
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-700"><strong className="text-gray-900">법적 의무:</strong> 만 6세까지 (위반시 과태료 6만원)</p>
                          <p className="text-xs text-gray-700"><strong className="text-gray-900">실제 권장:</strong> 140cm, 36kg까지 (약 10~12세, 초등 3~5학년)</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed mb-3">
                        일반 안전벨트는 성인 신체 기준으로 설계되어 있어, 아이가 착용하면 사고시 복부/목에 타격을 받거나 벨트 사이로 빠져나가는 위험이 있습니다.
                      </p>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">✅ 카시트 중단 시점</p>
                        <p className="text-xs text-gray-700">안전벨트가 목이나 복부를 지나가지 않고, <strong>어깨와 골반에 온전히 장착되는 시점까지</strong> 카시트 사용 필수</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 카시트 계획 짜기 */}
                <GuideCard
                  number="03"
                  title="카시트 계획 짜기"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">중복 투자 없는 계획</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-bold text-gray-900 mb-2">✨ 정석 플랜</p>
                        <div className="flex items-center gap-2 text-xs text-gray-700 mb-2">
                          <span className="font-medium">인펀트</span>
                          <span>→</span>
                          <span className="font-medium">컨버터블</span>
                          <span>→</span>
                          <span className="font-medium">주니어</span>
                        </div>
                        <p className="text-xs text-gray-600">신생아~1년 → 1~4,5세 → 4,5세~12세</p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">💡 인펀트 생략 가능</p>
                          <p className="text-xs text-gray-600">신생아 시기에 외출이 적다면 컨버터블의 신생아 이너시트 활용</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">🔄 토들러 추가 고려</p>
                          <p className="text-xs text-gray-600">연년생 자녀나 컨버터블이 작아진 경우 중간 단계로 추가</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 중요: 장착 가능 사이즈 꽉 채워 사용</p>
                        <p className="text-xs text-gray-700">아이가 불편해해도 안전 우선. 섣불리 다음 단계로 넘어가면 안전벨트가 헐거워져 사고시 위험</p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 안전 인증 */}
                <GuideCard
                  number="04"
                  title="안전 인증"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">카시트 안전 인증 비교</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🏆 유럽 R129 (i-size) - 가장 까다로운 기준</p>
                          <p className="text-xs text-gray-700 mb-2">전방·측면·전복 충돌까지 테스트. 머리 움직임 550mm 이하</p>
                          <p className="text-xs text-gray-600">일반적으로 가격이 비싼 편. 국산 브랜드도 최근 i-size 인증 추세</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">유럽 R44 - 기본 인증</p>
                          <p className="text-xs text-gray-600">유럽 표준 인증. 한국 KC인증은 R44 기반으로 변형</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">미국 FMVSS-213</p>
                          <p className="text-xs text-gray-600">미국 안전 기준. 미국 시장에 유통되는 제품 필수</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">한국 KC인증</p>
                          <p className="text-xs text-gray-600">유럽 R44 기반으로 한국 실정에 맞게 변형</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 인증의 의미</p>
                        <p className="text-xs text-gray-700">i-size 인증 = 더 높은 기준 통과. 하지만 다른 인증 제품이 덜 안전하다는 의미는 아님. 100% 안전 보장이 아닌 <strong>사고시 부상 위험 감소</strong></p>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 안전 점수 */}
                <GuideCard
                  number="05"
                  title="안전 점수"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">유럽·미국 소비자단체 평가</p>
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          국가 인증보다 까다로운 극한 상황 가정. 합격/불합격이 아닌 <strong>점수 부여로 제품 간 비교 가능</strong>. 리콜 요청 권한 있음.
                        </p>
                      </div>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">독일 ADAC (5점 만점, 낮을수록 좋음)</p>
                          <p className="text-xs text-gray-700"><strong className="text-blue-600">2.5점 이하 = 상당히 안전</strong></p>
                          <p className="text-xs text-gray-600 mt-1">유럽 전역에 결과 공개. 리콜 요청 가능. 생존 자체가 신뢰</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">미국 베이비기어랩/컨슈머리포트 (높을수록 좋음)</p>
                          <p className="text-xs text-gray-700"><strong className="text-blue-600">충돌점수 6점 이상 = 높은 편</strong></p>
                          <p className="text-xs text-gray-600 mt-1">전량리콜·징벌적 처벌 권한. 도산 기업 다수</p>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 주의사항</p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-700">• 국산 제품은 점수 없음 (해외 유통 제품만 테스트)</p>
                          <p className="text-xs text-gray-700">• 제품 상세페이지에 기재된 경우 많음</p>
                          <p className="text-xs text-gray-700">• <strong>모델명 일치 여부 필수 확인</strong></p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 6: 안전 부가기능 */}
                <GuideCard
                  number="06"
                  title="안전 부가기능"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">필수 안전 기능</p>
                      <div className="space-y-2.5">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">① ISOFIX (아이소픽스) 🔥</p>
                          <p className="text-xs text-gray-700 mb-2">카시트를 차에 꽂기만 하면 되는 국제표준. 오장착 방지</p>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-600">• 2010년 이후 차량 의무 탑재</p>
                            <p className="text-xs text-gray-600">• 최대 중량: 아이+카시트 33kg (약 만 4~5세까지)</p>
                            <p className="text-xs text-gray-600">• ISOFIX 없으면 안전벨트 방식 카시트 구매</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">② 정장착 인디케이터</p>
                          <p className="text-xs text-gray-700">빨강/초록 색상 전환. 경보음. 오장착 확률 감소 (99% 제품 탑재)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">③ 리바운드 스토퍼 (컨버터블)</p>
                          <p className="text-xs text-gray-700">충돌 후 튕겨나가거나 전복되는 2차 충돌 방지. 뒤보기 모드용</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">④ 측면 충격 완화 패드 (컨버터블~주니어)</p>
                          <p className="text-xs text-gray-700">측면 충돌시 1차 완충재 역할. 브랜드마다 명칭 상이</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 7: 카시트 용어 */}
                <GuideCard
                  number="07"
                  title="카시트 용어"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">종류별 주요 용어</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🍼 인펀트 (바구니) 카시트</p>
                          <div className="space-y-1 pl-2">
                            <p className="text-xs text-gray-700">• <strong>카시트 핸들:</strong> 각도 조절 가능, 침대/흔들침대로 활용</p>
                            <p className="text-xs text-gray-700">• <strong>차양막:</strong> 자외선 차단, 풀커버 제품 있음</p>
                            <p className="text-xs text-gray-700">• <strong>하네스:</strong> 안전벨트 (3점식/5점식, 큰 차이 없음)</p>
                            <p className="text-xs text-gray-700">• <strong>안전벨트 가이드:</strong> 차량 벨트 휘감아 오장착 방지</p>
                          </div>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🔄 컨버터블 카시트</p>
                          <div className="space-y-1 pl-2">
                            <p className="text-xs text-gray-700">• <strong>헤드레스트:</strong> 높이 조절 가능</p>
                            <p className="text-xs text-gray-700">• <strong>이너시트:</strong> 아이 사이즈에 맞게 Fit 조절 (단계별 상이)</p>
                            <p className="text-xs text-gray-700">• <strong>ISOFIX:</strong> 회전판을 차에 장착하는 걸쇠</p>
                            <p className="text-xs text-gray-700">• <strong>서포팅레그:</strong> 차 바닥 고정 (접이식 있음) / 탑테더는 후방 고리 방식</p>
                            <p className="text-xs text-gray-700">• <strong>측면 보호 패드:</strong> 측면 충돌 충격 완화</p>
                          </div>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🚗 주니어 카시트</p>
                          <div className="space-y-1 pl-2">
                            <p className="text-xs text-gray-700">• <strong>부스터 카시트:</strong> 아이 키를 높여주는 개념</p>
                            <p className="text-xs text-gray-700">• <strong>하이백 부스터:</strong> 등받이 있음 (= 주니어 카시트)</p>
                            <p className="text-xs text-gray-700">• <strong>백리스 부스터:</strong> 등받이 없음</p>
                            <p className="text-xs text-gray-700">• <strong>안전벨트 가이드:</strong> 성인 벨트를 올바른 위치로 안내 (초록/빨강)</p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'nasal_aspirator' ? (
                // 콧물흡입기 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 콧물흡입기란? */}
                <GuideCard
                  number="01"
                  title="콧물흡입기란?"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">의료용 흡인기</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          코 내부의 콧물을 빨아들여 제거하는 도구. 의료기기로 분류되며 정확한 품목명은 <strong>'의료용 흡인기'</strong>
                        </p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">💡 흡입 vs 흡인</p>
                          <p className="text-xs text-gray-700 mb-1"><strong>흡입 吸入:</strong> 체외에서 체내로</p>
                          <p className="text-xs text-gray-700"><strong>흡인 吸引:</strong> 체내에서 체외로 (정확한 용어)</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">이럴 때 사용해요</p>
                      <div className="bg-red-50 rounded-lg p-3">
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-700">• 스스로 코를 풀기 어려운 어린아이</p>
                          <p className="text-xs text-gray-700">• 코막힘으로 인한 구강호흡, 수면장애</p>
                          <p className="text-xs text-gray-700">• 콧물 제때 배출 안 하면 <strong>중이염·축농증 악화</strong></p>
                          <p className="text-xs text-gray-700">• 어린이집 다니면서 감기 자주 걸릴 때</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 사용 전 준비 */}
                <GuideCard
                  number="02"
                  title="사용 전 준비"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">코를 촉촉하게!</p>
                        <p className="text-xs text-gray-700">건조한 상태는 점막 자극 심함. 코딱지나 콧물이 묽어져 더 잘 빨아들일 수 있음</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">준비 방법</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 목욕 후 바로 사용</p>
                          <p className="text-xs text-gray-600">목욕 마친 뒤에는 바로 코를 빼내도 OK</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 식염수 사용</p>
                          <p className="text-xs text-gray-700 mb-1.5">약국에서 구매한 코 세척용 생리식염수나 코 스프레이 넣기</p>
                          <p className="text-xs text-gray-600">→ 콧물과 섞이도록 코 만져주기 → 흘러나온 것 닦아내기 → 흡입</p>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 주의</p>
                        <p className="text-xs text-gray-700">코 내부가 부어서 막힌 경우 효과 없음. 과도한 사용 시 코점막 손상·출혈 가능</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 올바른 흡입 방법 */}
                <GuideCard
                  number="03"
                  title="올바른 흡입 방법"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">5초 × 여러 번, 총 5분 이내</p>
                        <p className="text-xs text-gray-700">한 번에 모든 콧물을 빼내려고 하면 부작용 발생</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">흡입 순서</p>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">1️⃣ 아이를 앉힌 상태에서 입 벌리기</p>
                          <p className="text-xs text-gray-600">비강에 공기가 잘 통하도록</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">2️⃣ 노즐을 콧구멍에 넣기</p>
                          <p className="text-xs text-gray-600">점막을 흡입하지 않도록 주의</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">3️⃣ 원을 그리듯 위치 바꿔가며 찾기</p>
                          <p className="text-xs text-gray-600">코 내부 구조가 다르므로 쿠루룩 소리 나는 부분 찾기</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">4️⃣ 5초 이내 여러 번 나눠서 흡입</p>
                          <p className="text-xs text-gray-700">총 5분 이내로 사용</p>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-bold text-gray-900 mb-1.5">⚠️ 가장 중요</p>
                        <p className="text-xs text-gray-700"><strong>아이가 아파하면 무리하게 빼내지 말 것</strong></p>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 수동식 */}
                <GuideCard
                  number="04"
                  title="수동식 (구강흡입)"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">보호자가 입으로 직접 흡입</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-gray-900">대표 제품: 코뻥</p>
                          <span className="text-xs font-bold text-blue-600">5천원 ~</span>
                        </div>
                        <p className="text-xs text-gray-700">뺑코, 뻥코, 코끼리뺑코 등으로 불림. 약국에서 쉽게 구매 가능</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-green-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 장점</p>
                          <div className="space-y-0.5">
                            <p className="text-xs text-gray-700">• 가격 저렴</p>
                            <p className="text-xs text-gray-700">• 흡입 강도 조절</p>
                            <p className="text-xs text-gray-700">• 흡입력 강함</p>
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">❌ 단점</p>
                          <div className="space-y-0.5">
                            <p className="text-xs text-gray-700">• 교차감염 위험</p>
                            <p className="text-xs text-gray-700">• 폐활량 의존</p>
                            <p className="text-xs text-gray-700">• 보호자 힘듦</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">개선된 제품들</p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-700">• 콧물통 2배 큰 용량</p>
                          <p className="text-xs text-gray-700">• 긴 호스로 움직임 편리</p>
                          <p className="text-xs text-gray-700">• 필터/유입방지구조</p>
                          <p className="text-xs text-gray-700">• 말랑한 노즐 (코 보호)</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 전동 무선 */}
                <GuideCard
                  number="05"
                  title="전동식 무선"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-bold text-gray-900">건전지/배터리 사용</p>
                          <span className="text-xs font-bold text-blue-600">3~5만원</span>
                        </div>
                        <p className="text-xs text-gray-700">버튼만 누르면 바로 사용. 휴대성 좋음</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-green-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 장점</p>
                          <div className="space-y-0.5">
                            <p className="text-xs text-gray-700">• 간편한 사용</p>
                            <p className="text-xs text-gray-700">• 휴대성 우수</p>
                            <p className="text-xs text-gray-700">• 교차감염 없음</p>
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">❌ 단점</p>
                          <div className="space-y-0.5">
                            <p className="text-xs text-gray-700">• <strong>흡입력 약함</strong></p>
                            <p className="text-xs text-gray-700">• 콧물통 작음 (4~5ml)</p>
                            <p className="text-xs text-gray-700">• 본체 진동</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">흡입력 평가</p>
                        <p className="text-xs text-gray-700 mb-2">일반 성인 기준으로는 수동식·유선보다 <strong>확실히 약함</strong></p>
                        <p className="text-xs text-gray-600">흐르는 콧물 제거 또는 입구까지 끌어내는 역할은 가능</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 주의사항</p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-700">• 콧물이 본체로 유입되면 고장</p>
                          <p className="text-xs text-gray-700">• 적정 용량·각도 준수</p>
                          <p className="text-xs text-gray-700">• 세척 후 완전 건조 필수</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 6: 전동 유선 */}
                <GuideCard
                  number="06"
                  title="전동식 유선"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-bold text-gray-900">콘센트 연결</p>
                          <span className="text-xs font-bold text-blue-600">10~25만원</span>
                        </div>
                        <p className="text-xs text-gray-700">가격이 비싸지만 <strong>돈이 아깝지 않다는 후기 대다수</strong></p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-2">✅ 장점</p>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-700">• <strong className="text-green-700">강한 흡입력</strong> - 시간 단축</p>
                            <p className="text-xs text-gray-700">• 귀여운 디자인 - 아이가 스스로 사용</p>
                            <p className="text-xs text-gray-700">• 큰 콧물통 (무선의 3~5배)</p>
                            <p className="text-xs text-gray-700">• 2명 이상 아이에게 사용 가능</p>
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-2">❌ 단점</p>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-700">• <strong className="text-red-700">소음·진동 심함</strong></p>
                            <p className="text-xs text-gray-700">• 아이가 무서워할 수 있음</p>
                            <p className="text-xs text-gray-700">• 잠들었을 때 사용 어려움</p>
                            <p className="text-xs text-gray-700">• 부피 크고 휴대성 떨어짐</p>
                            <p className="text-xs text-gray-700">• 콘센트 필요</p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 7: 선택 가이드 */}
                <GuideCard
                  number="07"
                  title="선택 가이드"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">상황별 추천</p>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">💰 수동식 추천</p>
                          <p className="text-xs text-gray-700">아이가 코를 잘 풀거나 코가 막히는 일이 없다면 수동식으로 충분</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🔋 무선 추천</p>
                          <p className="text-xs text-gray-700 mb-1">교차감염 걱정 + 간편함 중시</p>
                          <p className="text-xs text-gray-600">흡입력 부족 느껴지면 유선으로 교체 고려</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🔌 유선 추천</p>
                          <p className="text-xs text-gray-700 mb-1">강한 흡입력 필요 + 예산 충분</p>
                          <p className="text-xs text-gray-600">콧물 양 많거나 2명 이상 아이</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 Tip</p>
                        <p className="text-xs text-gray-700">부품 분실·휴대성 위해 <strong>수동식 1개는 비상용으로 구비</strong> 추천</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 사용 전 확인</p>
                        <p className="text-xs text-gray-700">콧물·비염 증상이 심하다면 병원에서 의사 진단 후 사용</p>
                      </div>
                    </>
                  }
                />
              </div>
              ) : category === 'baby_monitor' ? (
                // 홈카메라 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 홈카메라란? */}
                <GuideCard
                  number="01"
                  title="홈카메라란?"
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
                      <p className="text-xs font-semibold text-gray-900 mb-2">주요 용도</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">👶 베이비캠</p>
                          <p className="text-xs text-gray-600">분리수면 시작, 육아 도우미와 함께</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">🐕 펫캠</p>
                          <p className="text-xs text-gray-600">반려동물 혼자 있을 때 걱정</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">👴 시니어캠</p>
                          <p className="text-xs text-gray-600">홀로 계신 부모님 안부 확인</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 외부 CCTV 용도 부적합</p>
                        <p className="text-xs text-gray-700">방진·방수 성능 없어 내구성 부족. 외부용은 별도 제품 구매 필요</p>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 보안 기능 */}
                <GuideCard
                  number="02"
                  title="보안 기능"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-red-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">보안이 가장 중요!</p>
                        <p className="text-xs text-gray-700">인터넷 연결 제품은 모두 해킹 대상</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">보안 기능 체크</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">✅ AES-128 이상 암호화</p>
                          <p className="text-xs text-gray-600">미국 정부 표준. 숫자 클수록 안전 (128/192/256)</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">✅ 외부 접근 차단</p>
                          <p className="text-xs text-gray-700 mb-1">마스터 방식: 권한 단말기만 로그인 가능</p>
                          <p className="text-xs text-gray-600">실명인증 회원가입</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">✅ 주기적 업데이트</p>
                          <p className="text-xs text-gray-600">앱·펌웨어 보안 취약점 보완</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">해킹 방지 수칙 (과기정통부)</p>
                      <div className="space-y-1.5 bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-700">1️⃣ <strong>관리자 비밀번호 변경</strong> (초기 ID/PW 그대로 사용 금지)</p>
                        <p className="text-xs text-gray-700">2️⃣ <strong>소프트웨어·펌웨어 업데이트</strong> (주기적으로)</p>
                        <p className="text-xs text-gray-700">3️⃣ <strong>미사용시 전원 차단</strong> (스마트 플러그/가리개 활용)</p>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 해상도와 화각 */}
                <GuideCard
                  number="03"
                  title="해상도와 화각"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">해상도</p>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs font-bold text-gray-900 mb-1">FHD (200만 화소)</p>
                            <p className="text-xs text-gray-700">실내용 충분 ✅</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 mb-1">QHD (300만 화소)</p>
                            <p className="text-xs text-gray-700">야외용 추천</p>
                          </div>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">화각 (좌우 촬영 범위)</p>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">100~110º (일반)</p>
                          <p className="text-xs text-gray-600">방/거실 천장·가장자리 45º 설치시 충분</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">140º (광각)</p>
                          <p className="text-xs text-gray-700">방 중앙 설치, 야외 감시용 유리</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <p className="text-xs font-semibold text-gray-900 mb-2">회전(각도조절) 기능</p>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-bold text-gray-900 mb-2">좌우 355º / 상하 90~110º</p>
                        <p className="text-xs text-gray-700 mb-1.5"><strong>추천 대상:</strong></p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-600">• 아이가 움직이기 시작</p>
                          <p className="text-xs text-gray-600">• 반려동물용 (화각 밖으로 이동)</p>
                          <p className="text-xs text-gray-600">• 방 중앙 설치, 넓은 공간 촬영</p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 야간촬영 */}
                <GuideCard
                  number="04"
                  title="야간촬영"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-bold text-gray-900 mb-2">적외선 램프로 야간촬영</p>
                        <p className="text-xs text-gray-700 mb-1">적외선 사용 → 흑백으로만 촬영</p>
                        <p className="text-xs text-gray-600">대부분 제품이 야간모드 탑재</p>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-semibold text-gray-900 mb-1">✅ 주/야간 자동 전환</p>
                          <p className="text-xs text-gray-600">조도 센서로 자동 전환 (대부분 탑재)</p>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-bold text-gray-900 mb-1.5">⚠️ 베이비캠: 적외선 램프 밝기 확인 필수</p>
                        <p className="text-xs text-gray-700 mb-2">적외선 램프가 밝으면 아이가 불빛을 쳐다보며 잠들지 않음</p>
                        <p className="text-xs text-gray-600">※ 눈으로 보는 것보다 밝게 촬영됨</p>
                        <p className="text-xs text-gray-600 mt-1.5"><strong>해결:</strong> 제품 후기로 밝기 확인 후 구매</p>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 앱 사용편의 */}
                <GuideCard
                  number="05"
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
                          <p className="text-xs text-gray-700 mb-1">녹화된 영상 빠르게 확인</p>
                          <p className="text-xs text-gray-600">의외로 배속 재생 안 되는 제품 많음. 상시녹화 시 필수!</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">2️⃣ 감지 민감도 설정</p>
                          <p className="text-xs text-gray-700">모션·소리 감지 민감도 조절 → 과도한 알림 방지</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">3️⃣ 스케줄 설정</p>
                          <p className="text-xs text-gray-700">알림·녹화 활성화 시간대 설정 (집에 있을 때 알림 OFF)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">4️⃣ 움직임 감지 영역 설정</p>
                          <p className="text-xs text-gray-700">TV·창문 등 제외 → 불필요한 알림 방지</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs font-bold text-gray-900 mb-1">5️⃣ 프라이버시 존 설정</p>
                          <p className="text-xs text-gray-700">화장실 등 민감한 부분 가상 가림막</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">💡 Tip</p>
                        <p className="text-xs text-gray-700"><strong>앱스토어·플레이스토어 후기 필수 확인!</strong> 제품 평점 높아도 앱 오류 많은 경우 있음</p>
                      </div>
                    </>
                  }
                />

                {/* Card 6: 저장방식 */}
                <GuideCard
                  number="06"
                  title="저장방식"
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
                          <div className="space-y-1.5">
                            <p className="text-xs text-gray-700">• 카메라 슬롯에 장착</p>
                            <p className="text-xs text-gray-700">• 128GB: 7~20일 저장 가능</p>
                            <p className="text-xs text-gray-700">• <strong className="text-red-600">전원 켜져야</strong> 앱으로 확인 가능</p>
                            <p className="text-xs text-gray-600 mt-1.5">※ 오래된 영상 자동 삭제 기능 필수</p>
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-gray-900">② 클라우드</p>
                            <span className="text-xs font-bold text-blue-600">월 4,000~6,000원</span>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs text-gray-700">• 온라인 저장 (별도 관리 불필요)</p>
                            <p className="text-xs text-gray-700">• 전원 꺼져도 확인 가능</p>
                            <p className="text-xs text-gray-700">• 월 정기 요금 발생</p>
                            <p className="text-xs text-gray-600 mt-1.5">※ 저장 기간에 따라 요금제 차등</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">선택 가이드</p>
                        <p className="text-xs text-gray-700 mb-1"><strong>microSD:</strong> 초기 비용만, 직접 관리</p>
                        <p className="text-xs text-gray-700"><strong>클라우드:</strong> 월 비용, 편리한 관리</p>
                      </div>
                    </>
                  }
                />

                {/* Card 7: 선택 가이드 */}
                <GuideCard
                  number="07"
                  title="선택 가이드"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">용도별 추천</p>
                      <div className="space-y-2.5 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">👶 베이비캠</p>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-700">• <strong>적외선 램프 밝기</strong> 확인 (제품 후기)</p>
                            <p className="text-xs text-gray-700">• 회전 기능 (아이 움직임 추적)</p>
                            <p className="text-xs text-gray-700">• 배속 재생 (야간 녹화 확인)</p>
                            <p className="text-xs text-gray-700">• 아기 울음 감지 or 소리 감지</p>
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">🐕 펫캠</p>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-700">• <strong>회전 기능 필수</strong> (반려동물 이동 추적)</p>
                            <p className="text-xs text-gray-700">• 광각 (140º)</p>
                            <p className="text-xs text-gray-700">• 양방향 통화 (주인 목소리)</p>
                            <p className="text-xs text-gray-700">• 움직임 감지 영역 설정</p>
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-900 mb-1.5">👴 시니어캠</p>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-700">• 프라이버시 존 설정</p>
                            <p className="text-xs text-gray-700">• 안정적인 앱 (앱스토어 후기 확인)</p>
                            <p className="text-xs text-gray-700">• 클라우드 저장 (전원 꺼져도 확인)</p>
                            <p className="text-xs text-gray-700">• 양방향 통화</p>
                          </div>
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 my-3"></div>
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-900 mb-2">필수 체크리스트</p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-700">✅ AES-128 이상 암호화</p>
                          <p className="text-xs text-gray-700">✅ 배속 재생 기능</p>
                          <p className="text-xs text-gray-700">✅ 민감도·스케줄 설정</p>
                          <p className="text-xs text-gray-700">✅ 주/야간 자동 전환</p>
                          <p className="text-xs text-gray-700">✅ 앱 후기 확인</p>
                        </div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-900 mb-1.5">⚠️ 외부 설치</p>
                        <p className="text-xs text-gray-700">일반 홈카메라는 부적합. 방수·방진 제품 별도 구매 필요</p>
                      </div>
                    </>
                  }
                />
              </div>
              ) : (
                // 분유포트 가이드 내용
              <div className="space-y-4">
                {/* Card 1: 작동 원리 - 끓이기 */}
                <GuideCard
                  number="01"
                  title="작동 원리 - 끓이기"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm font-semibold text-gray-900 mb-2">600~800W가 표준이에요</p>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        물이 끓는 시간(100℃까지)은 비슷해요.
                        차이는 100℃ 도달 후 <strong className="font-semibold">추가 끓임 시간</strong>이에요.
                      </p>

                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">추가 끓임이 왜 중요할까요?</p>
                        <ul className="text-xs text-gray-700 space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>100℃에서 3~5분 더 끓이면 염소와 세균이 확실하게 제거돼요</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0 w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5"></span>
                            <span>WHO 권고: 6개월 미만 아기 물은 2분 이상 끓여 사용</span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-sm font-semibold text-gray-900 mb-2">1000W 이상 고출력 제품</p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          추가 끓임 시간을 3~5분 더 길게 가져갈 수 있어요.
                          단, 실제 사용 시 체감 차이는 크지 않아요.
                        </p>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 작동 원리 - 쿨링 & 보온 */}
                <GuideCard
                  number="02"
                  title="작동 원리 - 쿨링 & 보온"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">쿨링팬의 효과</p>
                          <div className="bg-blue-50 rounded-xl p-3.5 mb-2">
                            <p className="text-sm text-gray-900 mb-1.5">
                              <strong className="font-semibold">40~60분 단축</strong> 효과
                            </p>
                            <p className="text-xs text-gray-600">
                              자연냉각 2~3시간 → 쿨링팬 1~1.5시간
                            </p>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            제품 간 쿨링 성능 차이는 크지 않아요.
                            쿨링팬이 있는지만 확인하시면 돼요.
                          </p>
                        </div>

                        <div className="h-px bg-gray-200"></div>

                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">보온 시간</p>
                          <p className="text-sm text-gray-700 leading-relaxed mb-2">
                            24시간 이상이면 충분해요.
                            실제로는 하루에 한 번씩 물을 갈아주게 되니까요.
                          </p>
                          <div className="bg-red-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-900 mb-1">⚠️ 물은 24시간 이상 보관하지 마세요</p>
                            <p className="text-xs text-gray-600">
                              끓인 물도 24시간 넘으면 세균이 번식할 수 있어요
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 용량 & 소재 */}
                <GuideCard
                  number="03"
                  title="용량 & 소재"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">용량: 1.3L 이상 추천</p>
                          <p className="text-sm text-gray-700 leading-relaxed mb-2">
                            하루 필요한 물이 1~1.5L 정도예요.
                          </p>
                          <div className="bg-blue-50 rounded-xl p-3.5">
                            <p className="text-xs font-semibold text-gray-900 mb-1.5">실제 사용 용량</p>
                            <p className="text-xs text-gray-600 leading-relaxed">
                              최소 수위선 (200ml) + 쿨링 증발 (100ml) = 약 300ml 제외
                              <br />
                              1.3L 제품 → 실제 1L 사용 가능
                            </p>
                          </div>
                        </div>

                        <div className="h-px bg-gray-200"></div>

                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">소재: 유리 + 스테인리스</p>
                          <ul className="text-xs text-gray-700 space-y-2 mb-3">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span><strong className="font-semibold">포트</strong>: 내열유리 (붕규산 유리)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span><strong className="font-semibold">베이스 & 뚜껑</strong>: 스테인리스 (물 닿는 부분)</span>
                            </li>
                          </ul>

                          <p className="text-sm font-semibold text-gray-900 mb-2">스테인리스 등급 차이</p>
                          <div className="flex gap-2">
                            <div className="flex-1 bg-gray-50 rounded-lg p-3">
                              <p className="text-sm font-semibold text-gray-900 mb-1">304 SUS</p>
                              <p className="text-xs text-gray-600 mb-2">주방 수저 등급</p>
                              <p className="text-xs font-semibold text-gray-900">일반 제품</p>
                            </div>
                            <div className="flex-1 bg-blue-50 rounded-lg p-3">
                              <p className="text-sm font-semibold text-gray-900 mb-1">316 SUS</p>
                              <p className="text-xs text-gray-600 mb-2">의료용 등급</p>
                              <p className="text-xs font-semibold text-blue-600">+3~5만원</p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            *316은 내식성·내구성이 더 좋지만, 일반 가정용으로는 304도 충분해요
                          </p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 4: 세척편의 */}
                <GuideCard
                  number="04"
                  title="세척편의"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        매일 사용하는 제품이라 세척이 쉬워야 해요.
                      </p>

                      <div className="space-y-3">
                        <div className="bg-blue-50 rounded-xl p-3.5">
                          <p className="text-sm font-semibold text-gray-900 mb-2">✅ 주입구 너비</p>
                          <p className="text-xs text-gray-700 mb-2">
                            <strong className="font-semibold">10cm 이상</strong> 권장 (손이 들어가야 닦기 편해요)
                          </p>
                          <p className="text-xs text-gray-600">
                            13~15cm면 더 좋아요. 스펀지를 넣고 빙글빙글 돌리기만 해도 깨끗해져요.
                          </p>
                        </div>

                        <div className="bg-blue-50 rounded-xl p-3.5">
                          <p className="text-sm font-semibold text-gray-900 mb-2">✅ 뚜껑 분리</p>
                          <p className="text-xs text-gray-700 mb-2">
                            <strong className="font-semibold">3단 분리</strong>가 이상적이에요
                          </p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0">1.</span>
                              <span>뚜껑 완전 분리 가능</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0">2.</span>
                              <span>실리콘 패킹 분리 가능 (물때 끼는 부분)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0">3.</span>
                              <span>분리된 부품이 적을수록 좋아요</span>
                            </li>
                          </ul>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3.5">
                          <p className="text-sm font-semibold text-gray-900 mb-2">무게 & 바닥 구조</p>
                          <ul className="text-xs text-gray-700 space-y-2">
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span><strong className="font-semibold">포트 무게 800g 이하</strong> (물 넣으면 최대 2kg)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="shrink-0 w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5"></span>
                              <span><strong className="font-semibold">바닥이 평평하고 단순</strong>한 구조 (단차 없어야 닦기 쉬워요)</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 5: 사용편의 - 모드 & 부속품 */}
                <GuideCard
                  number="05"
                  title="사용편의 - 모드 & 부속품"
                  defaultOpen={false}
                  content={
                    <>
                      <div className="space-y-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">모드 구성</p>
                          <p className="text-sm text-gray-700 leading-relaxed mb-2">
                            제품마다 비슷해요. 원터치 자동모드만 있으면 충분해요.
                          </p>
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-900 mb-1.5">보통 4~5개 모드</p>
                            <p className="text-xs text-gray-600">
                              끓이기 / 끓이기+쿨링 / 쿨링 / 보온 / 자동(원터치)
                            </p>
                          </div>
                        </div>

                        <div className="h-px bg-gray-200"></div>

                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-2">있으면 좋은 부속품</p>

                          <div className="space-y-2.5">
                            <div className="bg-green-50 rounded-lg p-3">
                              <p className="text-sm font-semibold text-gray-900 mb-1.5">🍵 차망 (티 스트레이너)</p>
                              <p className="text-xs text-gray-600 leading-relaxed">
                                이유식 시작 후 보리차·옥수수수염차 끓이기 좋아요.
                                분유 끝나면 유아 차 끓이는 용도로 계속 사용 가능해요.
                              </p>
                            </div>

                            <div className="bg-green-50 rounded-lg p-3">
                              <p className="text-sm font-semibold text-gray-900 mb-1.5">🍼 보온 용기</p>
                              <p className="text-xs text-gray-600 leading-relaxed">
                                분유+모유 혼합수유 가정에 유용해요.
                                모유 데울 때 중탕으로 사용할 수 있어요.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 6: 추가 기능 */}
                <GuideCard
                  number="06"
                  title="추가 기능"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        필수는 아니지만 있으면 편한 기능들이에요.
                      </p>

                      <div className="space-y-2.5">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">💡 수유등 (나이트 라이트)</p>
                          <p className="text-xs text-gray-600">
                            새벽 수유 시 불 안 켜도 돼서 편해요. 아기 눈부심 방지.
                          </p>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">🔆 LED 밝기 조절</p>
                          <p className="text-xs text-gray-600">
                            디스플레이가 너무 밝으면 수면에 방해될 수 있어요.
                          </p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">🛡️ 미끄럼 방지 패드</p>
                          <p className="text-xs text-gray-600">
                            포트를 들다 실수로 본체가 밀리는 것을 방지해요.
                          </p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">🥛 요거트 기능</p>
                          <p className="text-xs text-gray-600">
                            이유식 시작 후 유산균 요거트 만들기 가능 (40℃ 유지).
                          </p>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 7: A/S */}
                <GuideCard
                  number="07"
                  title="A/S"
                  defaultOpen={false}
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        24시간 계속 사용하는 제품이라 A/S가 중요해요.
                      </p>

                      <div className="bg-red-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">⚠️ 무상 보증 기간</p>
                        <p className="text-xs text-gray-700 leading-relaxed mb-2">
                          <strong className="font-semibold">1년 이상</strong> 권장해요.
                          일부 제품은 6개월만 보증해요.
                        </p>
                        <p className="text-xs text-gray-600">
                          *쿨링팬, 히팅 와이어 등 소모품 고장 확률 있어요
                        </p>
                      </div>

                      <div className="bg-blue-50 rounded-xl p-3.5 mb-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">📞 고객센터 운영 시간</p>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <strong className="font-semibold">24시간 운영</strong>이 이상적이에요.
                          야간 수유 중 고장나면 당장 연락할 곳이 필요해요.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-semibold text-gray-900 mb-2">💡 구매 전 체크리스트</p>
                        <ul className="text-xs text-gray-600 space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="shrink-0">•</span>
                            <span>무상보증 1년 이상인가?</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0">•</span>
                            <span>고객센터 운영 시간은?</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="shrink-0">•</span>
                            <span>제품 리뷰에서 A/S 경험 확인</span>
                          </li>
                        </ul>
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
