import { Metadata } from 'next';
import KnowledgeAgentLanding from '@/components/knowledge-agent/KnowledgeAgentLanding';

export const metadata: Metadata = {
  title: 'AI 아기용품 추천 | 올웨이즈',
  description: '유모차, 카시트, 젖병 등 우리 아이를 위한 아기용품, AI가 꼼꼼하게 비교하고 추천해드려요.',
  openGraph: {
    title: 'AI 아기용품 추천 - 올웨이즈',
    description: '복잡한 아기용품 비교, AI에게 맡기세요. 수만 개의 진짜 리뷰와 스펙을 분석해 딱 맞는 제품을 찾아드려요.',
  }
};

export default function BabyPage() {
  return <KnowledgeAgentLanding defaultTab="baby" />;
}
