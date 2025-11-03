import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// 비밀번호 검증
function checkPassword(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === '1545';
}

export async function POST(request: NextRequest) {
  // 비밀번호 검증
  if (!checkPassword(request)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const coupangId = formData.get('coupangId') as string;

    if (!file || !coupangId) {
      return NextResponse.json({ error: '파일과 쿠팡 ID가 필요합니다.' }, { status: 400 });
    }

    // 파일 확장자 추출
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';

    // 허용된 이미지 확장자만
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json({ error: '지원하지 않는 이미지 형식입니다.' }, { status: 400 });
    }

    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 5MB 이하여야 합니다.' }, { status: 400 });
    }

    // 파일을 Buffer로 변환
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // public/thumbnails 디렉토리 경로
    const thumbnailsDir = path.join(process.cwd(), 'public', 'thumbnails');

    // 디렉토리가 없으면 생성
    try {
      await fs.access(thumbnailsDir);
    } catch {
      await fs.mkdir(thumbnailsDir, { recursive: true });
    }

    // 파일명: {coupangId}.{extension}
    const fileName = `${coupangId}.${fileExtension}`;
    const filePath = path.join(thumbnailsDir, fileName);

    // 파일 저장
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      fileName,
      path: `/thumbnails/${fileName}`,
    });
  } catch (error) {
    console.error('썸네일 업로드 오류:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '업로드 중 오류 발생' },
      { status: 500 }
    );
  }
}
