'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CaretLeft, CaretDown, CaretUp, Plus, Trash, FloppyDisk, Eye, ArrowUp, ArrowDown, DotsSixVertical, PencilSimple, Check, X } from '@phosphor-icons/react';

// Types
interface HardFilterOption {
  label: string;
  displayLabel?: string;
  value: string;
  filter: Record<string, unknown>;
  productCount?: number;
}

interface HardFilterQuestion {
  id: string;
  type: string;
  question: string;
  tip?: string;
  options: HardFilterOption[];
  filterName?: string;
}

interface ManualQuestionConfig {
  questions: HardFilterQuestion[];
}

interface GuideConfig {
  category_name: string;
  guide?: {
    title: string;
    points: string[];
    trend: string;
  };
}

// Category Insights 타입 (주요 구매 포인트/불만 포인트)
interface ProItem {
  id: string;
  rank: number;
  mention_rate: number;
  text: string;
  keywords: string[];
  related_products?: string[];
}

interface ConItem {
  id: string;
  rank: number;
  mention_rate: number;
  text: string;
  keywords: string[];
  deal_breaker_for?: string;
}

interface CategoryInsight {
  category_key: string;
  category_name: string;
  guide?: {
    title: string;
    summary: string;
    key_points: string[];
    trend: string;
  };
  pros: ProItem[];
  cons: ConItem[];
}

interface FilterSettings {
  questions: Record<string, string>;
  tips: Record<string, Record<string, string>>;
  manual: Record<string, ManualQuestionConfig>;
  guides: Record<string, GuideConfig>;
  insights: Record<string, CategoryInsight>;
  questionConfigs: Record<string, Record<string, QuestionConfig>>; // 카테고리별 질문 설정
}

interface PreviewQuestion {
  id: string;
  type: string;
  question: string;
  tip?: string;
  options: HardFilterOption[];
  filterName?: string;
}

// 질문 설정 상태 (hide, 번호, 순서, 옵션 순서)
interface QuestionConfig {
  hidden: boolean;
  customNumber?: string;
  order: number;
  optionOrder?: string[]; // 옵션 value 순서
}

const CATEGORY_NAMES: Record<string, string> = {
  stroller: '유모차',
  car_seat: '카시트',
  formula: '분유',
  formula_maker: '분유제조기',
  formula_pot: '분유포트',
  baby_bottle: '젖병',
  pacifier: '쪽쪽이/노리개',
  diaper: '기저귀',
  baby_wipes: '아기물티슈',
  thermometer: '체온계',
  nasal_aspirator: '코흡입기',
  ip_camera: '홈캠/IP카메라',
  baby_bed: '유아침대',
  high_chair: '유아의자/식탁의자',
  baby_sofa: '유아소파',
  baby_desk: '유아책상',
};

export default function AdminFiltersPage() {
  const router = useRouter();

  // Auth state
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  // Data state
  const [settings, setSettings] = useState<FilterSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string>('formula_pot');
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [questionConfigs, setQuestionConfigs] = useState<Record<string, QuestionConfig>>({});

  // Expandable sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['preview', 'questions', 'tips'])
  );

  // Inline editing state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingTipId, setEditingTipId] = useState<string | null>(null);
  const [inlineQuestionText, setInlineQuestionText] = useState('');
  const [inlineTipText, setInlineTipText] = useState('');

  // Edited data (local changes before save)
  const [editedQuestions, setEditedQuestions] = useState<Record<string, string>>({});
  const [editedTips, setEditedTips] = useState<Record<string, Record<string, string>>>({});
  const [editedManual, setEditedManual] = useState<Record<string, ManualQuestionConfig>>({});
  const [editedGuides, setEditedGuides] = useState<Record<string, GuideConfig>>({});
  const [editedInsights, setEditedInsights] = useState<Record<string, CategoryInsight>>({});
  const [savedQuestionConfigs, setSavedQuestionConfigs] = useState<Record<string, Record<string, QuestionConfig>>>({});
  const [hasConfigChanges, setHasConfigChanges] = useState(false);

  // Auth handler
  const handleLogin = () => {
    if (password === '1545') {
      setIsAuthenticated(true);
      setAuthError('');
      fetchSettings();
    } else {
      setAuthError('비밀번호가 올바르지 않습니다.');
    }
  };

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/filters', {
        headers: { 'x-admin-password': '1545' },
      });
      const json = await res.json();
      if (json.success) {
        console.log('[DEBUG fetchSettings] questionConfigs loaded:', json.data.questionConfigs);
        setSettings(json.data);
        setEditedQuestions(json.data.questions);
        setEditedTips(json.data.tips);
        setEditedManual(json.data.manual);
        setEditedGuides(json.data.guides);
        setEditedInsights(json.data.insights || {});
        setSavedQuestionConfigs(json.data.questionConfigs || {});
      } else {
        setError(json.error || '설정을 불러오는데 실패했습니다.');
      }
    } catch {
      setError('설정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch preview
  const fetchPreview = useCallback(async (category: string) => {
    setPreviewLoading(true);
    console.log('[DEBUG fetchPreview] Started for category:', category);
    try {
      const res = await fetch(`/api/admin/filters/preview?category=${category}`, {
        headers: { 'x-admin-password': '1545' },
      });
      const json = await res.json();
      if (json.success) {
        console.log('[DEBUG fetchPreview] Questions loaded:', json.data.questions.length, 'questions');
        setPreviewQuestions(json.data.questions);
        setTotalProductCount(json.data.totalProductCount || 0);
        // 질문별 설정 초기화
        const configs: Record<string, QuestionConfig> = {};
        json.data.questions.forEach((q: PreviewQuestion, idx: number) => {
          configs[q.id] = { hidden: false, order: idx };
        });
        console.log('[DEBUG fetchPreview] Default configs set:', configs);
        setQuestionConfigs(configs);
      }
    } catch {
      console.error('Failed to fetch preview');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Load preview when category changes
  useEffect(() => {
    if (isAuthenticated && selectedCategory) {
      fetchPreview(selectedCategory);
    }
  }, [isAuthenticated, selectedCategory, fetchPreview]);

  // 저장된 설정 적용 여부 추적
  const [configsApplied, setConfigsApplied] = useState(false);

  // Apply saved configs when preview loads
  // settings가 로드된 후에만 실행 (race condition 방지)
  useEffect(() => {
    // previewQuestions가 현재 선택된 카테고리와 일치하는지 확인
    const expectedPrefix = `hf_${selectedCategory}_`;
    const questionsMatchCategory = previewQuestions.length > 0 &&
      previewQuestions[0]?.id?.startsWith(expectedPrefix);

    console.log('[DEBUG useEffect] Triggered with:', {
      hasSettings: !!settings,
      configsApplied,
      previewQuestionsLength: previewQuestions.length,
      selectedCategory,
      questionsMatchCategory,
      firstQuestionId: previewQuestions[0]?.id,
      savedQuestionConfigsForCategory: savedQuestionConfigs[selectedCategory],
      hasSavedConfigsForCategory: Object.keys(savedQuestionConfigs[selectedCategory] || {}).length > 0,
    });

    // settings가 아직 로드되지 않았으면 스킵 (savedQuestionConfigs 로드 대기)
    if (!settings) {
      console.log('[DEBUG useEffect] Skipping: settings not loaded');
      return;
    }
    // previewQuestions가 아직 로드되지 않았으면 스킵
    if (previewQuestions.length === 0) {
      console.log('[DEBUG useEffect] Skipping: no preview questions');
      return;
    }
    // previewQuestions가 현재 카테고리와 일치하지 않으면 스킵 (아직 로딩 중)
    if (!questionsMatchCategory) {
      console.log('[DEBUG useEffect] Skipping: questions do not match selected category (still loading)');
      return;
    }

    const savedConfigs = savedQuestionConfigs[selectedCategory] || {};
    const hasSavedConfigs = Object.keys(savedConfigs).length > 0;

    console.log('[DEBUG useEffect] savedConfigs for category:', selectedCategory, savedConfigs, 'hasSavedConfigs:', hasSavedConfigs);

    // 저장된 설정이 없으면 스킵 (이 카테고리에 저장된 설정이 없는 것임)
    // 단, configsApplied가 false이고 저장된 설정이 있는 경우에만 적용
    if (!hasSavedConfigs) {
      console.log('[DEBUG useEffect] Skipping: no saved configs for this category');
      return;
    }

    // 이미 적용했으면 스킵
    if (configsApplied) {
      console.log('[DEBUG useEffect] Skipping: already applied');
      return;
    }

    const configs: Record<string, QuestionConfig> = {};

    // 저장된 설정이 있으면 적용, 없으면 기본값
    previewQuestions.forEach((q, idx) => {
      if (savedConfigs[q.id]) {
        configs[q.id] = savedConfigs[q.id];
      } else {
        configs[q.id] = { hidden: false, order: idx };
      }
    });

    console.log('[DEBUG useEffect] Final configs to apply:', configs);

    // 저장된 순서가 있으면 질문 배열 재정렬
    console.log('[DEBUG useEffect] Sorting questions by saved order');
    const sortedQuestions = [...previewQuestions].sort((a, b) => {
      const orderA = savedConfigs[a.id]?.order ?? 999;
      const orderB = savedConfigs[b.id]?.order ?? 999;
      return orderA - orderB;
    });

    // 저장된 optionOrder가 있으면 각 질문의 옵션 순서도 적용
    const questionsWithOptionOrder = sortedQuestions.map(q => {
      const config = savedConfigs[q.id];
      if (config?.optionOrder && config.optionOrder.length > 0) {
        const sortedOptions = [...q.options].sort((a, b) => {
          const idxA = config.optionOrder!.indexOf(a.value);
          const idxB = config.optionOrder!.indexOf(b.value);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        return { ...q, options: sortedOptions };
      }
      return q;
    });

    console.log('[DEBUG useEffect] Sorted questions order:', questionsWithOptionOrder.map(q => q.id));
    setPreviewQuestions(questionsWithOptionOrder);

    setQuestionConfigs(configs);
    setHasConfigChanges(false);
    setConfigsApplied(true);
    console.log('[DEBUG useEffect] Applied configs successfully!');
  }, [previewQuestions, savedQuestionConfigs, selectedCategory, configsApplied, settings]);

  // 카테고리 변경 시 적용 플래그 리셋
  useEffect(() => {
    setConfigsApplied(false);
  }, [selectedCategory]);

  // Save handler
  const handleSave = async (type: 'questions' | 'tips' | 'manual' | 'guides' | 'insights', category?: string) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      let data;
      switch (type) {
        case 'questions':
          data = editedQuestions;
          break;
        case 'tips':
          data = category ? editedTips[category] : editedTips;
          break;
        case 'manual':
          data = category ? editedManual[category] : editedManual;
          break;
        case 'guides':
          data = category ? editedGuides[category] : editedGuides;
          break;
        case 'insights':
          data = category ? { pros: editedInsights[category]?.pros, cons: editedInsights[category]?.cons } : null;
          break;
      }

      const res = await fetch('/api/admin/filters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': '1545',
        },
        body: JSON.stringify({ type, category, data }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccess(`${type} 저장 완료!`);
        // Refresh preview
        fetchPreview(selectedCategory);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(json.error || '저장에 실패했습니다.');
      }
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle section
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Question text change handler
  const handleQuestionChange = (filterName: string, value: string) => {
    setEditedQuestions(prev => ({ ...prev, [filterName]: value }));
  };

  // Tip change handler
  const handleTipChange = (category: string, filterName: string, value: string) => {
    setEditedTips(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [filterName]: value,
      },
    }));
  };

  // Manual question handlers
  const handleManualQuestionChange = (
    category: string,
    questionIndex: number,
    field: 'question' | 'tip',
    value: string
  ) => {
    setEditedManual(prev => {
      const categoryData = { ...prev[category] };
      const questions = [...(categoryData.questions || [])];
      questions[questionIndex] = { ...questions[questionIndex], [field]: value };
      return { ...prev, [category]: { questions } };
    });
  };

  const handleManualOptionChange = (
    category: string,
    questionIndex: number,
    optionIndex: number,
    field: 'label' | 'displayLabel',
    value: string
  ) => {
    setEditedManual(prev => {
      const categoryData = { ...prev[category] };
      const questions = [...(categoryData.questions || [])];
      const options = [...questions[questionIndex].options];
      options[optionIndex] = { ...options[optionIndex], [field]: value };
      questions[questionIndex] = { ...questions[questionIndex], options };
      return { ...prev, [category]: { questions } };
    });
  };

  const addManualOption = (category: string, questionIndex: number) => {
    setEditedManual(prev => {
      const categoryData = { ...prev[category] };
      const questions = [...(categoryData.questions || [])];
      const options = [...questions[questionIndex].options];
      options.push({
        label: '새 옵션',
        displayLabel: '새 옵션',
        value: `option_${Date.now()}`,
        filter: {},
      });
      questions[questionIndex] = { ...questions[questionIndex], options };
      return { ...prev, [category]: { questions } };
    });
  };

  const removeManualOption = (category: string, questionIndex: number, optionIndex: number) => {
    setEditedManual(prev => {
      const categoryData = { ...prev[category] };
      const questions = [...(categoryData.questions || [])];
      const options = questions[questionIndex].options.filter((_, i) => i !== optionIndex);
      questions[questionIndex] = { ...questions[questionIndex], options };
      return { ...prev, [category]: { questions } };
    });
  };

  // 옵션 순서 변경 (위로/아래로)
  const moveManualOption = (category: string, questionIndex: number, optionIndex: number, direction: 'up' | 'down') => {
    setEditedManual(prev => {
      const categoryData = { ...prev[category] };
      const questions = [...(categoryData.questions || [])];
      const options = [...questions[questionIndex].options];

      const newIndex = direction === 'up' ? optionIndex - 1 : optionIndex + 1;
      if (newIndex < 0 || newIndex >= options.length) return prev;

      // Swap
      [options[optionIndex], options[newIndex]] = [options[newIndex], options[optionIndex]];
      questions[questionIndex] = { ...questions[questionIndex], options };
      return { ...prev, [category]: { questions } };
    });
  };

  // Guide change handlers (reserved for future UI)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleGuideChange = (category: string, field: 'title' | 'trend', value: string) => {
    setEditedGuides(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        guide: {
          ...prev[category]?.guide,
          title: field === 'title' ? value : prev[category]?.guide?.title || '',
          points: prev[category]?.guide?.points || [],
          trend: field === 'trend' ? value : prev[category]?.guide?.trend || '',
        },
      },
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleGuidePointChange = (category: string, pointIndex: number, value: string) => {
    setEditedGuides(prev => {
      const guide = prev[category]?.guide || { title: '', points: [], trend: '' };
      const points = [...guide.points];
      points[pointIndex] = value;
      return {
        ...prev,
        [category]: {
          ...prev[category],
          guide: { ...guide, points },
        },
      };
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addGuidePoint = (category: string) => {
    setEditedGuides(prev => {
      const guide = prev[category]?.guide || { title: '', points: [], trend: '' };
      return {
        ...prev,
        [category]: {
          ...prev[category],
          guide: { ...guide, points: [...guide.points, '새 포인트'] },
        },
      };
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeGuidePoint = (category: string, pointIndex: number) => {
    setEditedGuides(prev => {
      const guide = prev[category]?.guide || { title: '', points: [], trend: '' };
      return {
        ...prev,
        [category]: {
          ...prev[category],
          guide: { ...guide, points: guide.points.filter((_, i) => i !== pointIndex) },
        },
      };
    });
  };

  // Insights handlers (주요 구매 포인트/불만 포인트)
  const handleProChange = (category: string, index: number, field: keyof ProItem, value: string | number | string[]) => {
    setEditedInsights(prev => {
      const insight = prev[category] || { category_key: category, category_name: '', pros: [], cons: [] };
      const pros = [...(insight.pros || [])];
      pros[index] = { ...pros[index], [field]: value };
      return { ...prev, [category]: { ...insight, pros } };
    });
  };

  const handleConChange = (category: string, index: number, field: keyof ConItem, value: string | number | string[]) => {
    setEditedInsights(prev => {
      const insight = prev[category] || { category_key: category, category_name: '', pros: [], cons: [] };
      const cons = [...(insight.cons || [])];
      cons[index] = { ...cons[index], [field]: value };
      return { ...prev, [category]: { ...insight, cons } };
    });
  };

  const moveProItem = (category: string, index: number, direction: 'up' | 'down') => {
    setEditedInsights(prev => {
      const insight = prev[category];
      if (!insight) return prev;
      const pros = [...insight.pros];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= pros.length) return prev;
      [pros[index], pros[newIndex]] = [pros[newIndex], pros[index]];
      // rank 재정렬
      pros.forEach((p, i) => { p.rank = i + 1; });
      return { ...prev, [category]: { ...insight, pros } };
    });
  };

  const moveConItem = (category: string, index: number, direction: 'up' | 'down') => {
    setEditedInsights(prev => {
      const insight = prev[category];
      if (!insight) return prev;
      const cons = [...insight.cons];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= cons.length) return prev;
      [cons[index], cons[newIndex]] = [cons[newIndex], cons[index]];
      // rank 재정렬
      cons.forEach((c, i) => { c.rank = i + 1; });
      return { ...prev, [category]: { ...insight, cons } };
    });
  };

  const addProItem = (category: string) => {
    setEditedInsights(prev => {
      const insight = prev[category] || { category_key: category, category_name: '', pros: [], cons: [] };
      const newId = `pro_${Date.now()}`;
      const newRank = (insight.pros?.length || 0) + 1;
      const newPro: ProItem = {
        id: newId,
        rank: newRank,
        mention_rate: 0,
        text: '새 구매 포인트',
        keywords: [],
      };
      return { ...prev, [category]: { ...insight, pros: [...(insight.pros || []), newPro] } };
    });
  };

  const addConItem = (category: string) => {
    setEditedInsights(prev => {
      const insight = prev[category] || { category_key: category, category_name: '', pros: [], cons: [] };
      const newId = `con_${Date.now()}`;
      const newRank = (insight.cons?.length || 0) + 1;
      const newCon: ConItem = {
        id: newId,
        rank: newRank,
        mention_rate: 0,
        text: '새 불만 포인트',
        keywords: [],
      };
      return { ...prev, [category]: { ...insight, cons: [...(insight.cons || []), newCon] } };
    });
  };

  const removeProItem = (category: string, index: number) => {
    setEditedInsights(prev => {
      const insight = prev[category];
      if (!insight) return prev;
      const pros = insight.pros.filter((_, i) => i !== index);
      pros.forEach((p, i) => { p.rank = i + 1; });
      return { ...prev, [category]: { ...insight, pros } };
    });
  };

  const removeConItem = (category: string, index: number) => {
    setEditedInsights(prev => {
      const insight = prev[category];
      if (!insight) return prev;
      const cons = insight.cons.filter((_, i) => i !== index);
      cons.forEach((c, i) => { c.rank = i + 1; });
      return { ...prev, [category]: { ...insight, cons } };
    });
  };

  // Question config handlers (hide, number, order)
  const toggleQuestionHidden = (questionId: string) => {
    setQuestionConfigs(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], hidden: !prev[questionId]?.hidden },
    }));
    setHasConfigChanges(true);
  };

  const updateQuestionNumber = (questionId: string, customNumber: string) => {
    setQuestionConfigs(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], customNumber },
    }));
    setHasConfigChanges(true);
  };

  const moveQuestion = (questionId: string, direction: 'up' | 'down') => {
    const currentIdx = previewQuestions.findIndex(q => q.id === questionId);
    if (currentIdx === -1) return;

    const newIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (newIdx < 0 || newIdx >= previewQuestions.length) return;

    const newQuestions = [...previewQuestions];
    [newQuestions[currentIdx], newQuestions[newIdx]] = [newQuestions[newIdx], newQuestions[currentIdx]];
    setPreviewQuestions(newQuestions);

    // Update order in configs
    const newConfigs = { ...questionConfigs };
    newQuestions.forEach((q, idx) => {
      if (newConfigs[q.id]) {
        newConfigs[q.id] = { ...newConfigs[q.id], order: idx };
      }
    });
    setQuestionConfigs(newConfigs);
    setHasConfigChanges(true);
  };

  const moveOption = (questionId: string, optionIndex: number, direction: 'up' | 'down') => {
    // 현재 질문 찾기
    const question = previewQuestions.find(q => q.id === questionId);
    if (!question) return;

    const options = [...question.options];
    const newIdx = direction === 'up' ? optionIndex - 1 : optionIndex + 1;
    if (newIdx < 0 || newIdx >= options.length) return;

    // 옵션 순서 변경
    [options[optionIndex], options[newIdx]] = [options[newIdx], options[optionIndex]];

    // previewQuestions 업데이트
    setPreviewQuestions(prev => prev.map(q => {
      if (q.id !== questionId) return q;
      return { ...q, options };
    }));

    // questionConfigs에 optionOrder 저장
    const newOptionOrder = options.map(opt => opt.value);
    setQuestionConfigs(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        hidden: prev[questionId]?.hidden ?? false,
        order: prev[questionId]?.order ?? previewQuestions.findIndex(q => q.id === questionId),
        optionOrder: newOptionOrder,
      },
    }));

    setHasConfigChanges(true);
  };

  // 질문 설정 저장
  const saveQuestionConfigs = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/admin/filters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': '1545',
        },
        body: JSON.stringify({
          type: 'questionConfigs',
          category: selectedCategory,
          data: questionConfigs,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccess('질문 설정 저장됨!');
        // 로컬 savedQuestionConfigs 업데이트
        setSavedQuestionConfigs(prev => ({
          ...prev,
          [selectedCategory]: questionConfigs,
        }));
        setHasConfigChanges(false);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(json.error || '저장에 실패했습니다.');
      }
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 필터명이 어떤 카테고리에서 사용되는지 확인
  const getFilterUsageCategories = (filterName: string): string[] => {
    const usedIn: string[] = [];
    // tips에서 확인
    Object.entries(editedTips).forEach(([cat, tips]) => {
      if (tips[filterName]) {
        usedIn.push(cat);
      }
    });
    return [...new Set(usedIn)];
  };

  // 인라인 편집 핸들러 - 질문 텍스트
  const startInlineQuestionEdit = (questionId: string, filterName: string) => {
    setEditingQuestionId(questionId);
    // 현재 질문 텍스트를 가져옴 (editedQuestions에서 또는 기본값)
    const currentText = editedQuestions[filterName] || '';
    setInlineQuestionText(currentText);
  };

  const saveInlineQuestionEdit = async (filterName: string) => {
    if (!filterName || !inlineQuestionText.trim()) {
      setEditingQuestionId(null);
      return;
    }

    // 로컬 상태 업데이트
    setEditedQuestions(prev => ({ ...prev, [filterName]: inlineQuestionText }));

    // 서버에 저장
    try {
      const res = await fetch('/api/admin/filters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': '1545',
        },
        body: JSON.stringify({
          type: 'questions',
          data: { ...editedQuestions, [filterName]: inlineQuestionText },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess('질문 텍스트 저장됨');
        // 미리보기 새로고침
        fetchPreview(selectedCategory);
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch {
      setError('저장 실패');
    }

    setEditingQuestionId(null);
  };

  const cancelInlineQuestionEdit = () => {
    setEditingQuestionId(null);
    setInlineQuestionText('');
  };

  // 인라인 편집 핸들러 - 팁 텍스트
  const startInlineTipEdit = (questionId: string, filterName: string) => {
    setEditingTipId(questionId);
    // 현재 팁 텍스트를 가져옴
    const currentTip = editedTips[selectedCategory]?.[filterName] || '';
    setInlineTipText(currentTip);
  };

  const saveInlineTipEdit = async (filterName: string) => {
    setEditingTipId(null);

    if (!filterName) return;

    // 로컬 상태 업데이트
    setEditedTips(prev => ({
      ...prev,
      [selectedCategory]: {
        ...prev[selectedCategory],
        [filterName]: inlineTipText,
      },
    }));

    // 서버에 저장
    try {
      const updatedTips = {
        ...editedTips[selectedCategory],
        [filterName]: inlineTipText,
      };
      const res = await fetch('/api/admin/filters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': '1545',
        },
        body: JSON.stringify({
          type: 'tips',
          category: selectedCategory,
          data: updatedTips,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess('팁 저장됨');
        // 미리보기 새로고침
        fetchPreview(selectedCategory);
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch {
      setError('저장 실패');
    }
  };

  const cancelInlineTipEdit = () => {
    setEditingTipId(null);
    setInlineTipText('');
  };

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-4">하드필터 관리</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="비밀번호"
            className="w-full px-4 py-3 border rounded-lg mb-3"
          />
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
          >
            로그인
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')} className="text-gray-600 hover:text-gray-900">
              <CaretLeft size={24} />
            </button>
            <h1 className="text-lg font-bold text-gray-900">하드필터 관리</h1>
          </div>
          {success && (
            <span className="text-green-600 text-sm font-medium">{success}</span>
          )}
          {error && (
            <span className="text-red-500 text-sm font-medium">{error}</span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Category Selector */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">카테고리 선택</label>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-3 border rounded-lg bg-white"
          >
            {Object.entries(CATEGORY_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Preview Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('preview')}
            className="w-full px-4 py-3 flex items-center justify-between bg-blue-50 hover:bg-blue-100"
          >
            <div className="flex items-center gap-2">
              <Eye size={20} className="text-blue-600" />
              <span className="font-semibold text-blue-900">현재 적용 질문 미리보기</span>
              <span className="text-sm text-blue-600">
                ({previewQuestions.filter(q => !questionConfigs[q.id]?.hidden).length}개 / 전체 {totalProductCount}개 제품)
              </span>
            </div>
            {expandedSections.has('preview') ? <CaretUp size={20} /> : <CaretDown size={20} />}
          </button>
          {expandedSections.has('preview') && (
            <div className="p-4 space-y-4">
              {previewLoading ? (
                <div className="text-gray-500 text-center py-4">로딩 중...</div>
              ) : previewQuestions.length === 0 ? (
                <div className="text-gray-500 text-center py-4">질문이 없습니다.</div>
              ) : (
                previewQuestions.map((q, idx) => {
                  const config = questionConfigs[q.id] || { hidden: false, order: idx };
                  const visibleIdx = previewQuestions
                    .filter((pq, i) => i < idx && !questionConfigs[pq.id]?.hidden)
                    .length;

                  return (
                    <div
                      key={q.id}
                      className={`border rounded-lg p-4 ${config.hidden ? 'bg-gray-200 opacity-60' : 'bg-gray-50'}`}
                    >
                      {/* 질문 헤더: 순서 변경 + 번호 + hide 토글 */}
                      <div className="flex items-center gap-2 mb-2">
                        {/* 순서 변경 버튼 */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveQuestion(q.id, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30"
                            title="위로 이동"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => moveQuestion(q.id, 'down')}
                            disabled={idx === previewQuestions.length - 1}
                            className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30"
                            title="아래로 이동"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>

                        {/* 질문 번호 (수정 가능) */}
                        <input
                          type="text"
                          value={config.customNumber ?? `Q${visibleIdx + 1}`}
                          onChange={e => updateQuestionNumber(q.id, e.target.value)}
                          className="w-12 px-1 py-0.5 border rounded text-sm text-center font-medium"
                          placeholder={`Q${visibleIdx + 1}`}
                        />

                        <span className="text-xs text-gray-400">{q.id}</span>
                        {q.filterName && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {q.filterName}
                          </span>
                        )}

                        {/* Hide 토글 버튼 */}
                        <button
                          onClick={() => toggleQuestionHidden(q.id)}
                          className={`ml-auto px-2 py-1 text-xs rounded ${
                            config.hidden
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {config.hidden ? '숨김 해제' : '숨기기'}
                        </button>
                      </div>

                      {/* 질문 텍스트 - 인라인 편집 가능 */}
                      <div className="mb-2 ml-8">
                        {editingQuestionId === q.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={inlineQuestionText}
                              onChange={e => setInlineQuestionText(e.target.value)}
                              className="flex-1 px-3 py-2 border-2 border-blue-400 rounded-lg text-sm font-medium focus:outline-none focus:border-blue-500"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveInlineQuestionEdit(q.filterName || '');
                                if (e.key === 'Escape') cancelInlineQuestionEdit();
                              }}
                            />
                            <button
                              onClick={() => saveInlineQuestionEdit(q.filterName || '')}
                              className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200"
                              title="저장"
                            >
                              <Check size={16} weight="bold" />
                            </button>
                            <button
                              onClick={cancelInlineQuestionEdit}
                              className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                              title="취소"
                            >
                              <X size={16} weight="bold" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className="group flex items-center gap-2 cursor-pointer hover:bg-blue-50 rounded px-2 py-1 -mx-2"
                            onClick={() => q.filterName && startInlineQuestionEdit(q.id, q.filterName)}
                          >
                            <span className="font-medium text-gray-900">{q.question}</span>
                            {q.filterName && (
                              <PencilSimple
                                size={14}
                                className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* 팁 - 인라인 편집 가능 */}
                      <div className="text-sm mb-3 ml-8">
                        {editingTipId === q.id ? (
                          <div className="flex items-start gap-2">
                            <span className="pt-2">💡</span>
                            <textarea
                              value={inlineTipText}
                              onChange={e => setInlineTipText(e.target.value)}
                              className="flex-1 px-3 py-2 border-2 border-blue-400 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                              rows={2}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Escape') cancelInlineTipEdit();
                              }}
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => saveInlineTipEdit(q.filterName || '')}
                                className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200"
                                title="저장"
                              >
                                <Check size={16} weight="bold" />
                              </button>
                              <button
                                onClick={cancelInlineTipEdit}
                                className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                title="취소"
                              >
                                <X size={16} weight="bold" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="group flex items-start gap-1 cursor-pointer hover:bg-blue-50 rounded px-2 py-1 -mx-2"
                            onClick={() => q.filterName && startInlineTipEdit(q.id, q.filterName)}
                          >
                            <span>💡</span>
                            <span className="text-blue-600">{q.tip || '(팁 없음 - 클릭하여 추가)'}</span>
                            {q.filterName && (
                              <PencilSimple
                                size={14}
                                className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* 옵션들 (1×n 세로 배열) */}
                      <div className="ml-8 space-y-2">
                        {q.options.map((opt, oi) => (
                          <div
                            key={oi}
                            className="flex items-center gap-2 p-2 bg-white border rounded-lg"
                          >
                            {/* 옵션 순서 변경 */}
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => moveOption(q.id, oi, 'up')}
                                disabled={oi === 0}
                                className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                onClick={() => moveOption(q.id, oi, 'down')}
                                disabled={oi === q.options.length - 1}
                                className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30"
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>

                            {/* 순서 번호 */}
                            <span className="text-xs text-gray-400 w-4">{oi + 1}</span>

                            {/* 옵션 라벨 */}
                            <span className="flex-1 text-sm text-gray-700">{opt.label}</span>

                            {/* 제품 개수 */}
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                              {opt.productCount ?? 0}개
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}

              {/* 질문 설정 저장 버튼 */}
              {previewQuestions.length > 0 && (
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    {hasConfigChanges ? (
                      <span className="text-orange-600">* 저장되지 않은 변경사항이 있습니다</span>
                    ) : (
                      <span>순서, 숨기기, 번호 변경 후 저장하세요</span>
                    )}
                  </div>
                  <button
                    onClick={saveQuestionConfigs}
                    disabled={saving || !hasConfigChanges}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                      hasConfigChanges
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    } disabled:opacity-50`}
                  >
                    <FloppyDisk size={16} />
                    {saving ? '저장 중...' : '질문 설정 저장'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Question Text Mappings */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('questions')}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
          >
            <span className="font-semibold text-gray-900">질문 텍스트 매핑</span>
            {expandedSections.has('questions') ? <CaretUp size={20} /> : <CaretDown size={20} />}
          </button>
          {expandedSections.has('questions') && (
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                필터명에 대응되는 질문 텍스트를 설정합니다. (모든 카테고리에 공통 적용)
              </p>
              <div className="space-y-3">
                {Object.entries(editedQuestions).map(([filterName, questionText]) => {
                  const usedCategories = getFilterUsageCategories(filterName);
                  return (
                    <div key={filterName} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex gap-3 items-center mb-2">
                        <span className="w-20 text-sm font-medium text-gray-700 shrink-0">{filterName}</span>
                        <input
                          type="text"
                          value={questionText}
                          onChange={e => handleQuestionChange(filterName, e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      {/* 사용 카테고리 태그 */}
                      <div className="flex flex-wrap gap-1 ml-20">
                        {usedCategories.length > 0 ? (
                          usedCategories.map(cat => (
                            <span
                              key={cat}
                              className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded"
                            >
                              {CATEGORY_NAMES[cat] || cat}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">팁 미설정</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => handleSave('questions')}
                disabled={saving}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <FloppyDisk size={16} />
                {saving ? '저장 중...' : '질문 텍스트 저장'}
              </button>
            </div>
          )}
        </div>

        {/* Tips for Selected Category */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('tips')}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
          >
            <span className="font-semibold text-gray-900">
              팁 편집 ({CATEGORY_NAMES[selectedCategory]})
            </span>
            {expandedSections.has('tips') ? <CaretUp size={20} /> : <CaretDown size={20} />}
          </button>
          {expandedSections.has('tips') && (
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                선택한 카테고리에서 각 필터에 표시되는 도움말 팁입니다.
              </p>
              <div className="space-y-3">
                {Object.entries(editedTips[selectedCategory] || {}).map(([filterName, tip]) => (
                  <div key={filterName} className="flex gap-3 items-start">
                    <span className="w-24 text-sm font-medium text-gray-700 shrink-0 pt-2">{filterName}</span>
                    <textarea
                      value={tip}
                      onChange={e => handleTipChange(selectedCategory, filterName, e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none"
                      rows={2}
                    />
                  </div>
                ))}
                {Object.keys(editedTips[selectedCategory] || {}).length === 0 && (
                  <div className="text-gray-500 text-sm">이 카테고리에는 설정된 팁이 없습니다.</div>
                )}
              </div>
              <button
                onClick={() => handleSave('tips', selectedCategory)}
                disabled={saving}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <FloppyDisk size={16} />
                {saving ? '저장 중...' : '팁 저장'}
              </button>
            </div>
          )}
        </div>

        {/* Manual Questions for Selected Category */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('manual')}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
          >
            <span className="font-semibold text-gray-900">
              수동 정의 질문 ({CATEGORY_NAMES[selectedCategory]})
            </span>
            {expandedSections.has('manual') ? <CaretUp size={20} /> : <CaretDown size={20} />}
          </button>
          {expandedSections.has('manual') && (
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                동적 생성이 부족할 때 사용되는 수동 정의 질문입니다. (fallback)
              </p>
              {(editedManual[selectedCategory]?.questions || []).length === 0 ? (
                <div className="text-gray-500 text-sm">이 카테고리에는 수동 정의 질문이 없습니다.</div>
              ) : (
                <div className="space-y-6">
                  {(editedManual[selectedCategory]?.questions || []).map((question, qIdx) => (
                    <div key={question.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="text-xs text-gray-400 mb-2">ID: {question.id}</div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">질문</label>
                          <input
                            type="text"
                            value={question.question}
                            onChange={e => handleManualQuestionChange(selectedCategory, qIdx, 'question', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">팁</label>
                          <input
                            type="text"
                            value={question.tip || ''}
                            onChange={e => handleManualQuestionChange(selectedCategory, qIdx, 'tip', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-2">옵션 (순서 변경 가능)</label>
                          <div className="space-y-2">
                            {question.options.map((opt, oIdx) => (
                              <div
                                key={oIdx}
                                className="flex items-center gap-2 p-2 bg-white border rounded-lg"
                              >
                                {/* 순서 표시 및 드래그 아이콘 */}
                                <div className="flex items-center gap-1 text-gray-400">
                                  <DotsSixVertical size={16} className="cursor-grab" />
                                  <span className="text-xs w-5 text-center">{oIdx + 1}</span>
                                </div>

                                {/* 위/아래 버튼 */}
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => moveManualOption(selectedCategory, qIdx, oIdx, 'up')}
                                    disabled={oIdx === 0}
                                    className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="위로 이동"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => moveManualOption(selectedCategory, qIdx, oIdx, 'down')}
                                    disabled={oIdx === question.options.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="아래로 이동"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                </div>

                                {/* 입력 필드들 - 세로 배치 */}
                                <div className="flex-1 space-y-1">
                                  <input
                                    type="text"
                                    value={opt.label}
                                    onChange={e => handleManualOptionChange(selectedCategory, qIdx, oIdx, 'label', e.target.value)}
                                    placeholder="라벨 (선택지 텍스트)"
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                  />
                                  <input
                                    type="text"
                                    value={opt.displayLabel || ''}
                                    onChange={e => handleManualOptionChange(selectedCategory, qIdx, oIdx, 'displayLabel', e.target.value)}
                                    placeholder="표시 라벨 (결과 페이지용, 선택사항)"
                                    className="w-full px-2 py-1.5 border rounded text-sm text-gray-600"
                                  />
                                </div>

                                {/* 삭제 버튼 */}
                                <button
                                  onClick={() => removeManualOption(selectedCategory, qIdx, oIdx)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="삭제"
                                >
                                  <Trash size={16} />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => addManualOption(selectedCategory, qIdx)}
                              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-blue-600 hover:border-blue-400 hover:bg-blue-50 text-sm flex items-center justify-center gap-1"
                            >
                              <Plus size={14} />
                              옵션 추가
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => handleSave('manual', selectedCategory)}
                disabled={saving}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <FloppyDisk size={16} />
                {saving ? '저장 중...' : '수동 질문 저장'}
              </button>
            </div>
          )}
        </div>

        {/* Category Insights - 주요 구매 포인트 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('pros')}
            className="w-full px-4 py-3 flex items-center justify-between bg-green-50 hover:bg-green-100"
          >
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold">👍</span>
              <span className="font-semibold text-green-900">
                주요 구매 포인트 ({CATEGORY_NAMES[selectedCategory]})
              </span>
              <span className="text-sm text-green-600">
                ({editedInsights[selectedCategory]?.pros?.length || 0}개)
              </span>
            </div>
            {expandedSections.has('pros') ? <CaretUp size={20} /> : <CaretDown size={20} />}
          </button>
          {expandedSections.has('pros') && (
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                리뷰에서 추출한 주요 구매 포인트입니다. 순서대로 표시됩니다.
              </p>
              {(editedInsights[selectedCategory]?.pros || []).length === 0 ? (
                <div className="text-gray-500 text-sm">이 카테고리에는 구매 포인트가 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {(editedInsights[selectedCategory]?.pros || []).map((pro, idx) => (
                    <div key={pro.id} className="border rounded-lg p-3 bg-green-50/50">
                      <div className="flex items-start gap-2">
                        {/* 순서 및 이동 버튼 */}
                        <div className="flex flex-col items-center gap-0.5 pt-1">
                          <button
                            onClick={() => moveProItem(selectedCategory, idx, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 text-gray-400 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <span className="text-xs font-bold text-green-600 w-5 text-center">{idx + 1}</span>
                          <button
                            onClick={() => moveProItem(selectedCategory, idx, 'down')}
                            disabled={idx === (editedInsights[selectedCategory]?.pros?.length || 0) - 1}
                            className="p-0.5 text-gray-400 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>

                        {/* 내용 입력 */}
                        <div className="flex-1 space-y-2">
                          <textarea
                            value={pro.text}
                            onChange={e => handleProChange(selectedCategory, idx, 'text', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                            rows={2}
                            placeholder="구매 포인트 텍스트"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={pro.keywords?.join(', ') || ''}
                              onChange={e => handleProChange(selectedCategory, idx, 'keywords', e.target.value.split(',').map(k => k.trim()).filter(Boolean))}
                              className="flex-1 px-2 py-1 border rounded text-xs"
                              placeholder="키워드 (쉼표로 구분)"
                            />
                            <input
                              type="number"
                              value={pro.mention_rate || 0}
                              onChange={e => handleProChange(selectedCategory, idx, 'mention_rate', parseInt(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border rounded text-xs text-center"
                              placeholder="언급률%"
                              min={0}
                              max={100}
                            />
                          </div>
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => removeProItem(selectedCategory, idx)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => addProItem(selectedCategory)}
                  className="px-4 py-2 border-2 border-dashed border-green-300 rounded-lg text-green-600 hover:border-green-400 hover:bg-green-50 text-sm flex items-center gap-1"
                >
                  <Plus size={14} />
                  구매 포인트 추가
                </button>
                <button
                  onClick={() => handleSave('insights', selectedCategory)}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <FloppyDisk size={16} />
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category Insights - 주요 불만 포인트 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => toggleSection('cons')}
            className="w-full px-4 py-3 flex items-center justify-between bg-red-50 hover:bg-red-100"
          >
            <div className="flex items-center gap-2">
              <span className="text-red-600 font-bold">👎</span>
              <span className="font-semibold text-red-900">
                주요 불만 포인트 ({CATEGORY_NAMES[selectedCategory]})
              </span>
              <span className="text-sm text-red-600">
                ({editedInsights[selectedCategory]?.cons?.length || 0}개)
              </span>
            </div>
            {expandedSections.has('cons') ? <CaretUp size={20} /> : <CaretDown size={20} />}
          </button>
          {expandedSections.has('cons') && (
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                리뷰에서 추출한 주요 불만 포인트입니다. 순서대로 표시됩니다.
              </p>
              {(editedInsights[selectedCategory]?.cons || []).length === 0 ? (
                <div className="text-gray-500 text-sm">이 카테고리에는 불만 포인트가 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {(editedInsights[selectedCategory]?.cons || []).map((con, idx) => (
                    <div key={con.id} className="border rounded-lg p-3 bg-red-50/50">
                      <div className="flex items-start gap-2">
                        {/* 순서 및 이동 버튼 */}
                        <div className="flex flex-col items-center gap-0.5 pt-1">
                          <button
                            onClick={() => moveConItem(selectedCategory, idx, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <span className="text-xs font-bold text-red-600 w-5 text-center">{idx + 1}</span>
                          <button
                            onClick={() => moveConItem(selectedCategory, idx, 'down')}
                            disabled={idx === (editedInsights[selectedCategory]?.cons?.length || 0) - 1}
                            className="p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>

                        {/* 내용 입력 */}
                        <div className="flex-1 space-y-2">
                          <textarea
                            value={con.text}
                            onChange={e => handleConChange(selectedCategory, idx, 'text', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                            rows={2}
                            placeholder="불만 포인트 텍스트"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={con.keywords?.join(', ') || ''}
                              onChange={e => handleConChange(selectedCategory, idx, 'keywords', e.target.value.split(',').map(k => k.trim()).filter(Boolean))}
                              className="flex-1 px-2 py-1 border rounded text-xs"
                              placeholder="키워드 (쉼표로 구분)"
                            />
                            <input
                              type="number"
                              value={con.mention_rate || 0}
                              onChange={e => handleConChange(selectedCategory, idx, 'mention_rate', parseInt(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border rounded text-xs text-center"
                              placeholder="언급률%"
                              min={0}
                              max={100}
                            />
                          </div>
                          <input
                            type="text"
                            value={con.deal_breaker_for || ''}
                            onChange={e => handleConChange(selectedCategory, idx, 'deal_breaker_for', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs"
                            placeholder="누구에게 치명적인지 (예: 바쁜 맞벌이 부모)"
                          />
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => removeConItem(selectedCategory, idx)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => addConItem(selectedCategory)}
                  className="px-4 py-2 border-2 border-dashed border-red-300 rounded-lg text-red-600 hover:border-red-400 hover:bg-red-50 text-sm flex items-center gap-1"
                >
                  <Plus size={14} />
                  불만 포인트 추가
                </button>
                <button
                  onClick={() => handleSave('insights', selectedCategory)}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <FloppyDisk size={16} />
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
