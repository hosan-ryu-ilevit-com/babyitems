'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SimpleConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  primaryLabel: string;
  onPrimaryClick: () => void;
  secondaryLabel: string;
  onSecondaryClick?: () => void;
  primaryColor?: string;
}

export default function SimpleConfirmModal({
  isOpen,
  onClose,
  title,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
  primaryColor = 'text-blue-500'
}: SimpleConfirmModalProps) {
  const handleSecondaryClick = () => {
    if (onSecondaryClick) {
      onSecondaryClick();
    } else {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[200]"
          />
          
          {/* Modal Container */}
          <div className="fixed bottom-[40px] left-0 right-0 px-4 z-[210] pointer-events-none flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="max-w-[480px] mx-auto w-full pointer-events-auto"
            >
              <div className="bg-white rounded-[16px] shadow-xl overflow-hidden flex flex-col mx-auto w-[calc(100%-32px)] sm:w-[320px]">
                {/* Title */}
                <div className="py-[18px] px-4 text-center">
                  <span className="text-[16px] font-medium text-gray-700 leading-tight whitespace-pre-line">
                    {title}
                  </span>
                </div>
                
                {/* Divider */}
                <div className="h-[1px] bg-gray-200" />
                
                {/* Primary Action */}
                <button
                  onClick={onPrimaryClick}
                  className={`w-full py-[18px] px-4 text-center text-[16px] font-semibold ${primaryColor} active:bg-gray-50 transition-colors`}
                >
                  {primaryLabel}
                </button>
                
                {/* Divider */}
                <div className="h-[1px] bg-gray-200" />
                
                {/* Secondary Action */}
                <button
                  onClick={handleSecondaryClick}
                  className="w-full py-[18px] px-4 text-center text-[16px] font-medium text-gray-700 active:bg-gray-50 transition-colors"
                >
                  {secondaryLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
