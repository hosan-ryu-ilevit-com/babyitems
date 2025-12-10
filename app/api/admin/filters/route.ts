/**
 * 하드필터 설정 관리 API
 * GET /api/admin/filters - 모든 필터 설정 조회
 * PUT /api/admin/filters - 필터 설정 업데이트
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ADMIN_PASSWORD = '1545';

// 파일 경로
const DATA_DIR = path.join(process.cwd(), 'data/rules');
const INSIGHTS_DIR = path.join(process.cwd(), 'data/category-insights');

const FILES = {
  questions: path.join(DATA_DIR, 'filter_questions.json'),
  tips: path.join(DATA_DIR, 'filter_tips.json'),
  manual: path.join(DATA_DIR, 'manual_hard_questions.json'),
  guides: path.join(DATA_DIR, 'hard_filters.json'),
  questionConfigs: path.join(DATA_DIR, 'question_configs.json'),
};

// 카테고리 키 → insights 파일명 매핑
const CATEGORY_KEY_TO_INSIGHTS_FILE: Record<string, string> = {
  formula_pot: 'milk_powder_port',
};

function getInsightsFilePath(categoryKey: string): string {
  const fileName = CATEGORY_KEY_TO_INSIGHTS_FILE[categoryKey] || categoryKey;
  return path.join(INSIGHTS_DIR, `${fileName}.json`);
}

// 모든 category-insights 파일 로드
async function loadAllInsights(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  try {
    const files = await fs.readdir(INSIGHTS_DIR);
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const key = file.replace('.json', '');
      const content = await fs.readFile(path.join(INSIGHTS_DIR, file), 'utf-8');
      result[key] = JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load insights:', error);
  }
  return result;
}

// 인증 확인
function checkAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password');
  return password === ADMIN_PASSWORD;
}

// GET: 모든 필터 설정 조회
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [questions, tips, manual, guides, questionConfigs, insights] = await Promise.all([
      fs.readFile(FILES.questions, 'utf-8').then(JSON.parse),
      fs.readFile(FILES.tips, 'utf-8').then(JSON.parse),
      fs.readFile(FILES.manual, 'utf-8').then(JSON.parse),
      fs.readFile(FILES.guides, 'utf-8').then(JSON.parse),
      fs.readFile(FILES.questionConfigs, 'utf-8').then(JSON.parse).catch(() => ({})),
      loadAllInsights(),
    ]);

    console.log('[API GET /admin/filters] questionConfigs loaded from file:', JSON.stringify(questionConfigs));

    return NextResponse.json({
      success: true,
      data: {
        questions,
        tips,
        manual,
        guides,
        questionConfigs, // 질문 설정 (순서, 숨기기, 커스텀 번호)
        insights, // 카테고리별 인사이트 (pros, cons 포함)
      },
    });
  } catch (error) {
    console.error('Failed to load filter settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load filter settings' },
      { status: 500 }
    );
  }
}

// PUT: 필터 설정 업데이트
export async function PUT(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, category, data } = body;

    if (!type || !data) {
      return NextResponse.json(
        { success: false, error: 'Missing type or data' },
        { status: 400 }
      );
    }

    let filePath: string;
    let updatedContent: unknown;

    switch (type) {
      case 'questions':
        filePath = FILES.questions;
        updatedContent = data;
        break;

      case 'tips':
        filePath = FILES.tips;
        if (category) {
          // 특정 카테고리의 팁만 업데이트
          const currentTips = JSON.parse(await fs.readFile(FILES.tips, 'utf-8'));
          currentTips[category] = data;
          updatedContent = currentTips;
        } else {
          updatedContent = data;
        }
        break;

      case 'manual':
        filePath = FILES.manual;
        if (category) {
          // 특정 카테고리의 수동 질문만 업데이트
          const currentManual = JSON.parse(await fs.readFile(FILES.manual, 'utf-8'));
          currentManual[category] = data;
          updatedContent = currentManual;
        } else {
          updatedContent = data;
        }
        break;

      case 'guides':
        filePath = FILES.guides;
        if (category) {
          // 특정 카테고리의 가이드만 업데이트
          const currentGuides = JSON.parse(await fs.readFile(FILES.guides, 'utf-8'));
          currentGuides[category] = data;
          updatedContent = currentGuides;
        } else {
          updatedContent = data;
        }
        break;

      case 'questionConfigs':
        filePath = FILES.questionConfigs;
        console.log('[API PUT questionConfigs] Received:', { category, data: JSON.stringify(data) });
        if (category) {
          // 특정 카테고리의 질문 설정만 업데이트
          let currentConfigs = {};
          try {
            currentConfigs = JSON.parse(await fs.readFile(FILES.questionConfigs, 'utf-8'));
            console.log('[API PUT questionConfigs] Current file content:', JSON.stringify(currentConfigs));
          } catch {
            // 파일이 없으면 빈 객체
            console.log('[API PUT questionConfigs] No existing file, starting fresh');
          }
          updatedContent = { ...currentConfigs, [category]: data };
          console.log('[API PUT questionConfigs] Will save:', JSON.stringify(updatedContent));
        } else {
          updatedContent = data;
        }
        break;

      case 'insights': {
        // category-insights 파일 업데이트 (pros, cons 등)
        if (!category) {
          return NextResponse.json(
            { success: false, error: 'Category is required for insights update' },
            { status: 400 }
          );
        }
        filePath = getInsightsFilePath(category);
        // 기존 파일 읽어서 병합
        try {
          const currentInsights = JSON.parse(await fs.readFile(filePath, 'utf-8'));
          updatedContent = { ...currentInsights, ...data };
        } catch {
          // 파일이 없으면 새로 생성
          updatedContent = data;
        }
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type' },
          { status: 400 }
        );
    }

    // 백업 생성
    const backupPath = filePath.replace('.json', `.backup_${Date.now()}.json`);
    const currentContent = await fs.readFile(filePath, 'utf-8');
    await fs.writeFile(backupPath, currentContent);

    // 파일 업데이트
    await fs.writeFile(filePath, JSON.stringify(updatedContent, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      message: `${type} updated successfully`,
      backupPath,
    });
  } catch (error) {
    console.error('Failed to update filter settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update filter settings' },
      { status: 500 }
    );
  }
}
