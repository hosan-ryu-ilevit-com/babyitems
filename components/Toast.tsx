'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface ToastProps {
  message?: string; // Optional for backwards compatibility
  isVisible: boolean;
  onClose: () => void;
  duration?: number; // milliseconds
}

export default function Toast({ isVisible, onClose, duration = 2000 }: ToastProps) {
  const router = useRouter();

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    router.push('/favorites');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-100 w-[calc(100%-2rem)] max-w-md"
        >
          <div
            className="px-5 py-3.5 text-white text-sm font-medium flex items-center justify-between gap-3"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              borderRadius: '12px',
            }}
          >
            {/* Left side: Heart icon + Text */}
            <div className="flex items-center gap-2.5 flex-1">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="#FF6B6B"
                stroke="#FF6B6B"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span className="text-white">상품을 찜했어요</span>
            </div>

            {/* Right side: Action link */}
            <button
              onClick={handleActionClick}
              className="font-semibold text-sm transition-opacity shrink-0 hover:opacity-80"
              style={{
                color: '#5AB1FF',
              }}
            >
              보러가기
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
