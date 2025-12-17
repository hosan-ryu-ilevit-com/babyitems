'use client';

import { motion } from 'framer-motion';
import type { RealReviewsData, SourceInfo } from '@/hooks/useRealReviewsCache';

// ============================================================================
// Types
// ============================================================================

interface RealReviewsContentProps {
  data: RealReviewsData;
  isLoading?: boolean;
}

interface ParsedSection {
  title: string;
  type: 'pros' | 'cons';
  lines: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 마크다운 콘텐츠를 섹션으로 파싱
 */
function parseContent(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;

  content.split('\n').forEach(line => {
    const trimmed = line.trim();

    // 헤딩 감지
    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      const title = trimmed.replace(/^#+ /, '');
      let type: 'pros' | 'cons' | null = null;

      if (title.includes('장점')) type = 'pros';
      else if (title.includes('단점')) type = 'cons';

      if (type) {
        currentSection = { title, type, lines: [] };
        sections.push(currentSection);
      } else {
        currentSection = null;
      }
    } else if (currentSection && trimmed) {
      currentSection.lines.push(trimmed);
    }
  });

  return sections.filter(s => s.lines.length > 0);
}

/**
 * 리스트 아이템 텍스트에서 볼드 파싱 및 렌더링
 */
function renderListItem(text: string): React.ReactNode {
  // "- " 또는 "* " 제거
  const cleanText = text.replace(/^[*\-•]\s*/, '');

  // **볼드**: 설명 패턴 감지
  const boldMatch = cleanText.match(/^\*\*(.+?)\*\*:\s*(.+)$/);

  if (boldMatch) {
    const [, summary, description] = boldMatch;
    return (
      <>
        <span className="font-semibold text-gray-900">{summary}</span>
        <span className="text-gray-600">: {description}</span>
      </>
    );
  }

  // 일반 **볼드** 처리
  const parts = cleanText.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <span key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * 타임스탬프 포맷팅
 */
function formatTimestamp(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  const dateStr = date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateStr} ${timeStr}`;
}

// ============================================================================
// Sub Components
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 mt-2 bg-gray-200 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1.5 h-1.5 mt-2 bg-gray-200 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ section }: { section: ParsedSection }) {
  const styles = {
    pros: {
      bg: 'bg-blue-50',
      icon: '👍',
      titleColor: 'text-blue-700',
    },
    cons: {
      bg: 'bg-red-50',
      icon: '👎',
      titleColor: 'text-red-700',
    },
  };

  const style = styles[section.type];

  return (
    <div className={`rounded-xl p-4 ${style.bg}`}>
      <h4 className={`text-base font-bold ${style.titleColor} pb-2 mb-3 flex items-center gap-1.5`}>
        <span>{style.icon}</span>
        {section.title}
      </h4>
      <ul className="space-y-2.5">
        {section.lines.map((line, idx) => (
          <li key={idx} className="text-[15px] leading-relaxed flex gap-2">
            <span className="text-gray-400 shrink-0 mt-0.5">•</span>
            <span className="flex-1 text-gray-700">{renderListItem(line)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceCard({ source }: { source: SourceInfo }) {
  return (
    <a
      href={source.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
    >
      {/* 좌측: 파비콘 + 사이트명 + 타이틀 */}
      <div className="flex-1 min-w-0">
        {/* 파비콘 + 사이트명 (상단) */}
        <div className="flex items-center gap-1.5 mb-1">
          {source.favicon && (
            <img
              src={source.favicon}
              alt=""
              className="w-4 h-4 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <p className="text-xs text-gray-500">{source.siteName}</p>
        </div>
        {/* 타이틀 (하단) */}
        <p className="text-sm font-medium text-gray-800 line-clamp-2">
          {source.title || '출처 보기'}
        </p>
      </div>
      {/* 우측: OG 썸네일 */}
      {source.ogImage && (
        <img
          src={source.ogImage}
          alt=""
          className="w-16 h-12 rounded object-cover shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
    </a>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RealReviewsContent({ data, isLoading }: RealReviewsContentProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // lowQuality이거나 content가 없으면 안내 메시지
  if (data.lowQuality || !data.content) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="font-medium">충분한 실시간 정보를 찾지 못했어요 😢</p>
      </div>
    );
  }

  const sections = parseContent(data.content);

  // 유효한 섹션이 없으면 안내 메시지
  if (sections.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <p>이 제품에 대한 구체적인 후기 정보를 찾지 못했습니다.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* 메타 정보 */}
      <div className="text-xs text-gray-400 space-y-1">
        <div>
          {formatTimestamp(data.timestamp)} 검색 · {(data.elapsed / 1000).toFixed(1)}초 소요
        </div>
        <div>*AI가 검색한 정보로, 정확하지 않을 수 있습니다</div>
      </div>

      {/* 섹션 카드들 */}
      <div className="space-y-3">
        {sections.map((section, idx) => (
          <SectionCard key={idx} section={section} />
        ))}
      </div>

      {/* 출처 */}
      {data.sources.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>📚</span> 출처
          </h5>
          <div className="space-y-2">
            {data.sources.map((source, idx) => (
              <SourceCard key={idx} source={source} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default RealReviewsContent;
