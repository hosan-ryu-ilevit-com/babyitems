'use client';

import { motion } from 'framer-motion';

export function LoadingDots() {
  return (
    <div className="flex items-center justify-center gap-1.5 h-6">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.3, y: 0 }}
          animate={{ 
            opacity: [0.3, 1, 0.3],
            y: [0, -4, 0]
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
          className="w-[5.4px] h-[5.4px] rounded-full bg-gray-400"
        />
      ))}
    </div>
  );
}

