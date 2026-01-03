'use client';

import { motion } from 'framer-motion';

interface LoadingDotsProps {
  variant?: 'blue' | 'gray';
  size?: 'sm' | 'md';
  className?: string;
}

export function LoadingDots({ variant = 'blue', size = 'md', className = '' }: LoadingDotsProps) {
  const dots = variant === 'blue'
    ? ['bg-blue-500', 'bg-blue-300', 'bg-blue-100']
    : ['bg-gray-500', 'bg-gray-300', 'bg-gray-100'];

  const dotSize = size === 'sm' ? 'w-[5.3px] h-[5.3px]' : 'w-2 h-2';
  const gap = size === 'sm' ? 'gap-1' : 'gap-1.5';
  const jumpHeight = size === 'sm' ? -2.5 : -4;
  const containerSize = size === 'sm' ? 'w-8 h-8' : 'w-auto h-6';

  return (
    <div className={`flex items-center justify-center ${gap} ${containerSize} ${className}`}>
      {dots.map((color, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.3, y: 0 }}
          animate={{
            opacity: [0.3, 1, 0.3],
            y: [0, jumpHeight, 0]
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
          className={`${dotSize} rounded-full ${color}`}
        />
      ))}
    </div>
  );
}

