'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface GuideBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
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

export function GuideBottomSheet({ isOpen, onClose }: GuideBottomSheetProps) {
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
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-gray-100 rounded-t-3xl z-50 h-[85vh] flex flex-col overflow-hidden"
            style={{ maxWidth: '480px', margin: '0 auto' }}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-white">
              <h2 className="text-m font-bold text-gray-900 text-center">
                처음 사는 분유포트, 2분이면 충분해요 ✨
              </h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
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
                      <div className="bg-blue-50 rounded-xl p-3.5 border border-blue-100 mb-3">
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
                            <div className="flex-1 bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                              <p className="font-semibold text-gray-900 mb-0.5">304 SUS</p>
                              <p className="text-gray-600">주방 수저용</p>
                            </div>
                            <div className="flex-1 bg-blue-50 rounded-lg p-2.5 border border-blue-200">
                              <p className="font-semibold text-gray-900 mb-0.5">316 SUS ⭐</p>
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
            </div>

            {/* Footer CTA */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white">
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
