import { Metadata } from 'next';
import KnowledgeAgentLanding from '@/components/knowledge-agent/KnowledgeAgentLanding';

export const metadata: Metadata = {
  title: 'AI 가전 추천 | 올웨이즈',
  description: '청소기, 공기청정기, 식기세척기 등 생활/주방가전, AI가 성능과 리뷰를 분석해 추천해드려요.',
  openGraph: {
    title: 'AI 가전 추천 - 올웨이즈',
    description: '복잡한 생활가전 비교, AI에게 맡기세요. 수만 개의 진짜 리뷰와 스펙을 분석해 딱 맞는 제품을 찾아드려요.',
  }
};

export default function LivingPage() {
  return <KnowledgeAgentLanding defaultTab="living" />;
}
