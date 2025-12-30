'use client';

import { ChatCircleDots } from '@phosphor-icons/react';
import { logButtonClick } from '@/lib/logging/clientLogger';

interface FeedbackButtonProps {
  source: string;
  className?: string;
  variant?: 'default' | 'minimal';
}

export default function FeedbackButton({ source, className = '', variant = 'default' }: FeedbackButtonProps) {
  const handleFeedbackClick = () => {
    const w = window as Window & { ChannelIO?: (...args: unknown[]) => void };
    if (w.ChannelIO) {
      w.ChannelIO('openChat');
    }
    logButtonClick('피드백 보내기', source);
  };

  if (variant === 'minimal') {
    return (
      <button
        onClick={handleFeedbackClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-[8px] hover:bg-gray-200 transition-all ${className}`}
      >
        <ChatCircleDots size={18} weight="fill" className="text-gray-700" />
        <span className="text-[14px] font-medium text-gray-700">의견 보내기</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleFeedbackClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-[12px] hover:bg-gray-100 transition-all ${className}`}
    >
      <ChatCircleDots size={18} weight="fill" className="text-gray-400" />
      <span className="text-[14px] font-medium text-gray-800">의견</span>
    </button>
  );
}

