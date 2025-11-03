'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface ProductPreview {
  // products.ts 데이터
  productData: {
    id: string;
    title: string;
    price: number;
    reviewCount: number;
    ranking: number;
    coreValues: {
      temperatureControl: number;
      hygiene: number;
      material: number;
      usability: number;
      portability: number;
      priceValue: number;
      durability: number;
      additionalFeatures: number;
    };
  };
  // .md 파일 데이터
  markdownContent: string;
}

export default function AdminUploadPage() {
  const router = useRouter();

  // 기본 정보
  const [coupangId, setCoupangId] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [price, setPrice] = useState('');
  const [reviewCount, setReviewCount] = useState('');
  const [ranking, setRanking] = useState('');

  // 썸네일 이미지
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // 리뷰 데이터
  const [reviewData, setReviewData] = useState('');

  // 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [isDuplicateCheck, setIsDuplicateCheck] = useState(false);

  // 중복 체크
  const checkDuplicate = async () => {
    if (!coupangId.trim()) {
      setError('쿠팡 ID를 입력하세요.');
      return;
    }

    setIsDuplicateCheck(true);
    try {
      const response = await fetch(`/api/admin/check-duplicate?id=${coupangId}`);
      const data = await response.json();

      if (data.exists) {
        setError(`⚠️ 이미 존재하는 상품입니다. (랭킹: ${data.ranking})`);
      } else {
        setError('');
        alert('✅ 사용 가능한 ID입니다.');
      }
    } catch (err) {
      setError('중복 체크 실패');
    } finally {
      setIsDuplicateCheck(false);
    }
  };

  // 리뷰 분석 요청
  const handleAnalyze = async () => {
    // 유효성 검사
    if (!coupangId || !productTitle || !price || !reviewCount || !ranking || !reviewData) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/analyze-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': '1545',
        },
        body: JSON.stringify({
          coupangId: coupangId.trim(),
          productTitle: productTitle.trim(),
          price: parseInt(price),
          reviewCount: parseInt(reviewCount),
          ranking: parseInt(ranking),
          reviewData: reviewData.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('분석 요청 실패');
      }

      const result = await response.json();
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  // 이미지 파일 처리
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setThumbnailFile(file);

    // 미리보기 생성
    const reader = new FileReader();
    reader.onloadend = () => {
      setThumbnailPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setError('');
  };

  // 드래그 이벤트 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageFile(files[0]);
    }
  };

  // 폼 초기화
  const resetForm = () => {
    setCoupangId('');
    setProductTitle('');
    setPrice('');
    setReviewCount('');
    setRanking('');
    setReviewData('');
    setThumbnailFile(null);
    setThumbnailPreview('');
    setPreview(null);
    setError('');
  };

  // 최종 저장
  const handleSave = async () => {
    if (!preview) return;

    // 썸네일 필수 체크
    if (!thumbnailFile) {
      setError('썸네일 이미지를 업로드해주세요.');
      return;
    }

    if (!confirm('정말 저장하시겠습니까? products.ts와 .md 파일이 업데이트됩니다.')) {
      return;
    }

    setLoading(true);
    try {
      // 1. 썸네일 이미지 업로드
      const formData = new FormData();
      formData.append('file', thumbnailFile);
      formData.append('coupangId', coupangId);

      const uploadResponse = await fetch('/api/admin/upload-thumbnail', {
        method: 'POST',
        headers: {
          'x-admin-password': '1545',
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('썸네일 업로드 실패');
      }

      const uploadResult = await uploadResponse.json();
      const actualThumbnailPath = uploadResult.path; // 실제 업로드된 파일 경로

      // 2. 상품 데이터 저장 (실제 썸네일 경로 포함)
      const updatedPreview = {
        ...preview,
        productData: {
          ...preview.productData,
          thumbnail: actualThumbnailPath,
        },
      };

      const response = await fetch('/api/admin/save-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': '1545',
        },
        body: JSON.stringify(updatedPreview),
      });

      if (!response.ok) {
        throw new Error('저장 실패');
      }

      alert('✅ 상품이 성공적으로 추가되었습니다!');

      // 페이지 유지하고 폼만 초기화
      resetForm();

      // 페이지 최상단으로 스크롤
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">🛍️ 상품 추가</h1>
            <button
              onClick={() => router.push('/admin')}
              className="text-gray-600 hover:text-gray-800"
            >
              ← 돌아가기
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* 기본 정보 입력 */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold">기본 정보</h2>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">쿠팡 ID *</label>
                <input
                  type="text"
                  value={coupangId}
                  onChange={(e) => setCoupangId(e.target.value)}
                  placeholder="예: 7118428974"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="pt-6">
                <button
                  onClick={checkDuplicate}
                  disabled={isDuplicateCheck || !coupangId}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  중복 체크
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">제품명 *</label>
              <input
                type="text"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                placeholder="예: 리웨이 분유포트 커피포트 멀티 차탕기..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">가격 *</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="54900"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">리뷰 개수 *</label>
                <input
                  type="number"
                  value={reviewCount}
                  onChange={(e) => setReviewCount(e.target.value)}
                  placeholder="2365"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">랭킹 *</label>
                <input
                  type="number"
                  value={ranking}
                  onChange={(e) => setRanking(e.target.value)}
                  placeholder="10"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 썸네일 업로드 */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold">썸네일 이미지</h2>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-gray-50'
              }`}
            >
              {thumbnailPreview ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative w-full max-w-xs h-48">
                    <Image
                      src={thumbnailPreview}
                      alt="썸네일 미리보기"
                      fill
                      className="object-contain rounded-lg shadow-md"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setThumbnailFile(null);
                        setThumbnailPreview('');
                      }}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      삭제
                    </button>
                    <label className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer">
                      변경
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="mt-4">
                    <label className="cursor-pointer">
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        이미지를 드래그하거나{' '}
                        <span className="text-blue-600 hover:text-blue-500">
                          클릭하여 업로드
                        </span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="mt-1 text-xs text-gray-500">
                      PNG, JPG, GIF 등 (최대 5MB)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 리뷰 데이터 입력 */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold">리뷰 데이터</h2>
            <p className="text-sm text-gray-600">
              별점과 리뷰 내용을 입력하세요. 형식: 별점[탭]제목[탭]내용
            </p>
            <textarea
              value={reviewData}
              onChange={(e) => setReviewData(e.target.value)}
              placeholder="5	잘 끓어요	불꽃 2칸으로 5분정도 되면...&#10;5	엄마가사서 저도샀어요	이번에 캠핑용..."
              rows={15}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          {/* 분석 버튼 */}
          <div className="flex justify-end">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? '🤖 AI 분석 중...' : '🤖 AI 분석 시작'}
            </button>
          </div>
        </div>

        {/* 미리보기 */}
        {preview && (
          <div className="bg-white rounded-lg p-6 space-y-6">
            <h2 className="text-xl font-bold">📋 분석 결과 미리보기</h2>

            {/* products.ts 미리보기 */}
            <div>
              <h3 className="text-lg font-semibold mb-2">products.ts에 추가될 데이터:</h3>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  id: '${preview.productData.id}',
  title: '${preview.productData.title}',
  price: ${preview.productData.price},
  reviewCount: ${preview.productData.reviewCount},
  reviewUrl: 'https://www.coupang.com/vp/products/${preview.productData.id}',
  ranking: ${preview.productData.ranking},
  thumbnail: '/thumbnails/${preview.productData.id}.jpg',
  coreValues: {
    temperatureControl: ${preview.productData.coreValues.temperatureControl},
    hygiene: ${preview.productData.coreValues.hygiene},
    material: ${preview.productData.coreValues.material},
    usability: ${preview.productData.coreValues.usability},
    portability: ${preview.productData.coreValues.portability},
    priceValue: ${preview.productData.coreValues.priceValue},
    durability: ${preview.productData.coreValues.durability},
    additionalFeatures: ${preview.productData.coreValues.additionalFeatures}
  }
}`}
              </pre>
            </div>

            {/* .md 파일 미리보기 */}
            <div>
              <h3 className="text-lg font-semibold mb-2">{preview.productData.id}.md 파일 내용:</h3>
              <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm">{preview.markdownContent}</pre>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPreview(null)}
                className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-semibold"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {loading ? '저장 중...' : '✅ 최종 저장'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
