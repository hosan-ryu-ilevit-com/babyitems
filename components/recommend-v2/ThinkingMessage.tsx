'use client';

import { motion } from 'framer-motion';

export function ThinkingMessage() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="flex justify-start mb-6 px-1"
    >
      <div className="bg-gray-900 rounded-full px-5 py-2.5 flex items-center gap-3 shadow-2xl border border-white/10 relative overflow-hidden">
        {/* Pulsing Dot */}
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-400/20 shrink-0">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        </div>

        <span className="text-[14px] text-white font-bold tracking-tight">AI Thinking...</span>

        {/* Shimmer effect inside the island */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full pointer-events-none"
          animate={{ x: ['100%', '-100%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}
