import { Suspense } from 'react';
import { HomeContent } from '@/components/HomeContent';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="w-full max-w-[480px] min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FCFCFC' }}>
          <LoadingSpinner size="lg" message="로딩 중..." />
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
