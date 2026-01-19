'use client';

import { useMemo } from 'react';
import type { HighlightRange } from '@/lib/knowledge-agent/types';

interface HighlightedTextProps {
  text: string;
  highlights: HighlightRange[];
  selectedTagIds: Set<string>;
  className?: string;
  highlightClassName?: string;
}

/**
 * 겹치는 범위 병합
 */
function mergeOverlappingRanges(
  ranges: HighlightRange[]
): { start: number; end: number }[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [
    { start: sorted[0].start, end: sorted[0].end },
  ];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  return merged;
}

export function HighlightedText({
  text,
  highlights,
  selectedTagIds,
  className = '',
  highlightClassName = 'bg-blue-100 px-0.5 rounded-sm',
}: HighlightedTextProps) {
  const parts = useMemo(() => {
    // 선택된 태그의 하이라이트만 필터링
    const activeHighlights = highlights.filter((h) =>
      selectedTagIds.has(h.tagId)
    );

    if (activeHighlights.length === 0 || selectedTagIds.size === 0) {
      return [{ type: 'text' as const, content: text }];
    }

    // 병합
    const merged = mergeOverlappingRanges(activeHighlights);

    const result: { type: 'text' | 'highlight'; content: string }[] = [];
    let lastEnd = 0;

    for (const range of merged) {
      if (range.start > lastEnd) {
        result.push({ type: 'text', content: text.slice(lastEnd, range.start) });
      }
      result.push({
        type: 'highlight',
        content: text.slice(range.start, range.end),
      });
      lastEnd = range.end;
    }

    if (lastEnd < text.length) {
      result.push({ type: 'text', content: text.slice(lastEnd) });
    }

    return result;
  }, [text, highlights, selectedTagIds]);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'highlight' ? (
          <mark key={i} className={highlightClassName}>
            {part.content}
          </mark>
        ) : (
          <span key={i}>{part.content}</span>
        )
      )}
    </span>
  );
}

/**
 * 마크다운 **볼드** 처리와 하이라이트를 동시에 적용하는 컴포넌트
 */
interface HighlightedMarkdownTextProps {
  text: string;
  highlights: HighlightRange[];
  selectedTagIds: Set<string>;
  className?: string;
}

export function HighlightedMarkdownText({
  text,
  highlights,
  selectedTagIds,
  className = '',
}: HighlightedMarkdownTextProps) {
  // 1. 먼저 **볼드** 분리
  const boldParts = text.split(/(\*\*.*?\*\*)/g);

  return (
    <span className={className}>
      {boldParts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          // 볼드 텍스트에 대한 하이라이트 offset 계산 필요
          // 간단히 처리: 볼드 내부는 하이라이트 없이 표시
          return (
            <strong key={index} className="font-bold">
              {boldText}
            </strong>
          );
        }
        // 일반 텍스트는 하이라이트 적용
        return (
          <HighlightedText
            key={index}
            text={part}
            highlights={highlights}
            selectedTagIds={selectedTagIds}
          />
        );
      })}
    </span>
  );
}

export default HighlightedText;
