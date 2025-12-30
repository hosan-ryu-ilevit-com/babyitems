'use client';

import { motion } from 'framer-motion';

export function ThinkingMessage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-start mb-4 px-2"
    >
      <motion.span
        animate={{
          backgroundPosition: ['200% 0', '-200% 0'],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
        }}
        className="text-base font-medium bg-clip-text text-transparent bg-gradient-to-r from-gray-300 via-gray-500 to-gray-300 bg-[length:200%_auto]"
      >
        생각 중...
      </motion.span>
    </motion.div>
  );
}
