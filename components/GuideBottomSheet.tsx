'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface GuideBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// Expanded Guide Card Component (always open)
function GuideCard({ number, title, content }: { number: string; title: string; content: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold text-gray-400">{number}</span>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        <div>
          {content}
        </div>
      </div>
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
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[85vh] flex flex-col"
            style={{ maxWidth: '480px', margin: '0 auto' }}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 text-center">
                내 첫 분유포트- 핵심만 한눈에.
              </h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-4">
                {/* Card 1: 왜 필요한가요? */}
                <GuideCard
                  number="01"
                  title="왜 필요한가요?"
                  content={
                    <>
                      <p className="text-sm text-gray-700 leading-relaxed mb-3">
                        6개월 미만 아이는 <strong className="font-semibold">물을 2분 이상 끓여</strong> 사용할 것을 권고합니다.
                        하루 <strong className="font-semibold">8~10번</strong> 분유를 타야 하는데, 매번 끓이고 식히는 건 정말 힘들죠.
                      </p>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="text-xs font-semibold text-gray-900 mb-2">분유포트가 하는 일</p>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="font-medium">끓이기</span>
                          <span>→</span>
                          <span className="font-medium">식히기</span>
                          <span>→</span>
                          <span className="font-medium">보온</span>
                          <span className="text-gray-400">(자동)</span>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 2: 작동 원리 */}
                <GuideCard
                  number="02"
                  title="어떻게 작동하나요?"
                  content={
                    <>
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            1
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-1">끓이기 (3~5분)</p>
                            <p className="text-xs text-gray-600">100℃ 도달 후에도 계속 끓여 염소와 균을 제거합니다</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            2
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-1">냉각 (40~60분)</p>
                            <p className="text-xs text-gray-600">쿨링팬으로 40~45℃로 빠르게 식혀줍니다</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            3
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 mb-1">보온 (12~24시간)</p>
                            <p className="text-xs text-gray-600">언제든 분유를 탈 수 있게 온도를 유지합니다</p>
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />

                {/* Card 3: 용량과 소재 */}
                <GuideCard
                  number="03"
                  title="용량과 소재"
                  content={
                    <>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">용량: 1.3L 이상</p>
                          <p className="text-xs text-gray-600">하루 필요한 물 1~1.5L를 여유있게 담을 수 있습니다</p>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">소재: 내열강화유리 + 스테인리스</p>
                          <p className="text-xs text-gray-600 mb-2">
                            안이 보이는 유리 포트가 일반적이고, 열판과 뚜껑은 스테인리스를 사용합니다
                          </p>
                          <div className="flex gap-2 text-xs">
                            <div className="flex-1 bg-gray-50 rounded p-2 border border-gray-200">
                              <p className="font-medium text-gray-900">304 SUS</p>
                              <p className="text-gray-600">일반 주방용</p>
                            </div>
                            <div className="flex-1 bg-gray-50 rounded p-2 border border-gray-200">
                              <p className="font-medium text-gray-900">316 SUS</p>
                              <p className="text-gray-600">의료용 고급</p>
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
                  title="세척과 사용 편의성"
                  content={
                    <>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">세척이 편한 제품</p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              주입구 직경 10cm 이상 (손이 들어가야 함)
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              뚜껑 완전 분리형
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              포트 무게 800g 이하
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              바닥이 평평함 (구조물 없음)
                            </li>
                          </ul>
                        </div>
                        <div className="h-px bg-gray-200"></div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">유용한 기능</p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              수유등 (새벽에 편리)
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              자동 분유모드 (원터치)
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              차망 (보리차용)
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
            <div className="px-6 py-4 border-t border-gray-200">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="w-full h-14 bg-gray-900 text-white text-base font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all"
              >
                이해했어요!
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
