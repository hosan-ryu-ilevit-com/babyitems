'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { AttributeInfo } from '@/data/attributes';
import { ATTRIBUTE_IMAGES } from '@/data/attributes';

interface AttributeBottomSheetProps {
  isOpen: boolean;
  attribute: AttributeInfo | null;
  onClose: () => void;
}

export function AttributeBottomSheet({ isOpen, attribute, onClose }: AttributeBottomSheetProps) {
  if (!attribute) return null;

  const imageUrl = ATTRIBUTE_IMAGES[attribute.key] || '/attributesImages/material.png';

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
            style={{ maxWidth: '480px', margin: '0 auto' }}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
              mass: 0.8
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                onClose();
              }
            }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 shadow-2xl"
            style={{
              maxWidth: '480px',
              margin: '0 auto',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Content */}
            <div className="px-6 pb-8">
              {/* Image */}
              <div className="w-full max-w-[130px] mx-auto mt-6 mb-6 relative h-[130px]">
                <Image
                  src={imageUrl}
                  alt={attribute.name}
                  fill
                  className="object-contain"
                  priority
                  quality={90}
                  sizes="130px"
                />
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 mb-0 text-center">
                {attribute.name}
              </h3>

              {/* Description */}
              <p className="text-base text-gray-600 mb-4 font-medium text-center leading-relaxed">
                {attribute.description}
              </p>

              {/* Details List */}
              <div className="bg-gray-50 rounded-2xl p-5 space-y-1">
                {attribute.details.map((detail, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-900 mt-2 shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 leading-relaxed">
                      {detail}
                    </span>
                  </div>
                ))}
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-full mt-6 h-14 text-white font-semibold rounded-2xl transition-colors"
                style={{ backgroundColor: '#0084FE' }}
              >
                닫기
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
