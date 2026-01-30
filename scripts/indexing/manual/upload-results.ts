#!/usr/bin/env npx tsx
/**
 * AI Studio 결과 업로드 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/manual/upload-results.ts                    # 모든 결과 업로드
 *   npx tsx scripts/indexing/manual/upload-results.ts --category="이유식조리기"  # 특정 카테고리
 *   npx tsx scripts/indexing/manual/upload-results.ts --dry-run          # 테스트 (실제 저장 안 함)
 *
 * 입력:
 *   scripts/indexing/manual/output/results/*.json
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface QuestionOption {
  value: string;
  label: string;
  description: string;
  isPopular?: boolean;
}

interface Question {
  id: string;
  question: string;
  reason: string;
  options: QuestionOption[];
  type: string;
  priority: number;
  dataSource: string;
  completed: boolean;
}

interface AIStudioResult {
  overview: string;
  questions: Question[];
}

function generateMarkdown(result: AIStudioResult, categoryName: string): string {
  const now = new Date().toISOString();

  let md = `---
categoryName: ${categoryName}
generatedAt: ${now}
llmModel: gemini-pro-via-ai-studio
---

# ${categoryName} 맞춤질문

## 개요
${result.overview}

## 질문 목록

`;

  result.questions.forEach((q, i) => {
    md += `### ${i + 1}. ${q.question}

- **ID:** ${q.id}
- **이유:** ${q.reason}
- **우선순위:** ${q.priority}

**옵션:**
`;
    q.options.forEach(opt => {
      const popular = opt.isPopular ? ' ⭐' : '';
      md += `- \`${opt.value}\`: ${opt.label}${popular}
  - ${opt.description}
`;
    });
    md += '\n';
  });

  return md;
}

async function main() {
  const args = process.argv.slice(2);
  let targetCategory = '';
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      targetCategory = arg.split('=')[1].replace(/['"]/g, '');
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  console.log('🚀 AI Studio 결과 업로드 시작...\n');
  if (dryRun) console.log('⚠️  DRY RUN 모드 (실제 저장 안 함)\n');

  const resultsDir = path.join(__dirname, 'output', 'results');

  if (!fs.existsSync(resultsDir)) {
    console.log(`❌ 결과 디렉토리가 없습니다: ${resultsDir}`);
    console.log('   먼저 AI Studio에서 결과를 생성하고 저장하세요.');
    process.exit(1);
  }

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('❌ 업로드할 JSON 파일이 없습니다.');
    process.exit(1);
  }

  console.log(`📁 발견된 결과 파일: ${files.length}개\n`);

  const results: { category: string; success: boolean; error?: string }[] = [];

  for (const file of files) {
    const categoryName = path.basename(file, '.json');

    if (targetCategory && categoryName !== targetCategory) {
      continue;
    }

    console.log(`📤 ${categoryName} 업로드 중...`);

    try {
      const filePath = path.join(resultsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data: AIStudioResult = JSON.parse(content);

      // 유효성 검사
      if (!data.overview || !data.questions || data.questions.length === 0) {
        throw new Error('올바르지 않은 JSON 형식 (overview, questions 필요)');
      }

      // Markdown 생성
      const markdown = generateMarkdown(data, categoryName);

      if (dryRun) {
        console.log(`   📄 생성될 마크다운 (${markdown.length}자):`);
        console.log(markdown.slice(0, 500) + '...\n');
      } else {
        // Supabase 업로드
        const { error } = await supabase
          .from('knowledge_categories')
          .update({ custom_questions: markdown })
          .eq('query', categoryName);

        if (error) throw new Error(`Supabase 저장 실패: ${error.message}`);
      }

      results.push({ category: categoryName, success: true });
      console.log(`   ✅ 성공 (질문 ${data.questions.length}개)`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ category: categoryName, success: false, error: errorMsg });
      console.log(`   ❌ 실패: ${errorMsg}`);
    }
  }

  // 결과 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 업로드 결과');
  console.log(`${'='.repeat(60)}`);
  console.log(`   성공: ${results.filter(r => r.success).length}개`);
  console.log(`   실패: ${results.filter(r => !r.success).length}개`);

  if (results.some(r => !r.success)) {
    console.log('\n⚠️ 실패 목록:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.category}: ${r.error}`);
    });
  }

  if (dryRun) {
    console.log('\n💡 실제 업로드하려면 --dry-run 없이 실행하세요.');
  }
}

main().catch(console.error);
