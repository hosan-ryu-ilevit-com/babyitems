import { Suspense } from 'react';
import { HomeContent } from '@/components/HomeContent';

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="w-full max-w-[480px] min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FCFCFC' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: '#0084FE' }}></div>
            <p className="mt-4 text-gray-600">로딩 중...</p>
          </div>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
