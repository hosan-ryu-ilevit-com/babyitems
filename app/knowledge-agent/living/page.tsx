import { Metadata } from 'next';
import KnowledgeAgentLanding from '@/components/knowledge-agent/KnowledgeAgentLanding';

export const metadata: Metadata = {
  title: 'AI 가전 추천 | 올웨이즈',
  description: '청소기, 공기청정기, 식기세척기 등 생활/주방가전, AI가 성능과 리뷰를 분석해 추천해드려요.',
  openGraph: {
    title: 'AI 가전 추천 - 올웨이즈',
    description: '스마트한 가전 쇼핑의 시작. AI가 당신의 라이프스타일에 딱 맞는 가전을 추천합니다.',
  }
};

export default function LivingPage() {
  return <KnowledgeAgentLanding defaultTab="living" />;
}
