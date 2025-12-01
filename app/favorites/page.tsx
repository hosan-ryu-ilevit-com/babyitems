'use client';

import { FavoritesView } from '@/components/FavoritesView';
import { useRouter } from 'next/navigation';

export default function FavoritesPage() {
  const router = useRouter();

  return <FavoritesView onClose={() => router.push('/')} />;
}
