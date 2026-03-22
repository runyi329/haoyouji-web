import { useState, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { ChevronLeft, ChevronRight, Copy, Check, ChevronDown, BookMarked, Plus, Trash2, ClipboardCopy } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

// ===== 提示词管理弹窗 =====
function PromptLibraryModal({ onClose }: { onClose: () => void }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const promptsQuery = trpc.beauty.aiPrompts.list.useQuery();
  const addMutation = trpc.beauty.aiPrompts.add.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.list.invalidate(),
  });
  const deleteMutation = trpc.beauty.aiPrompts.delete.useMutation({
    onSuccess: () => utils.beauty.aiPrompts.list.invalidate(),
  });

  const [newContent, setNewContent] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [mergedCopied, setMergedCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const prompts = promptsQuery.data || [];

  const handleAdd = async () => {
    const content = newContent.trim();
    if (!content) return;
    await addMutation.mutateAsync({ content });
    setNewContent('');
  };

  const handleToggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const mergedText = prompts
    .filter(p => selected.includes(p.id))
    .map(p => p.content)
    .join('\n\n');

  const handleCopyMerged = () => {
    if (!mergedText) return;
    navigator.clipboard.writeText(mergedText).then(() => {
      setMergedCopied(true);
      setTimeout(() => setMergedCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-2xl" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">提示词库</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <span className="text-gray-500 text-lg leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* 新增提示词（登录后才显示） */}
          {isAuthenticated && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">添加新提示词</p>
              <textarea
                ref={textareaRef}
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="输入提示词内容（纯文字）..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400"
                rows={3}
              />
              <button
                onClick={handleAdd}
                disabled={!newContent.trim() || addMutation.isPending}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)' }}
              >
                <Plus className="w-4 h-4" />
                {addMutation.isPending ? '添加中...' : '添加'}
              </button>
            </div>
          )}

          {/* 提示词列表 */}
          {promptsQuery.isLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">加载中...</p>
          ) : prompts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">暂无提示词，点击上方添加</p>
          ) : (
            <div className="space-y-2">
              {prompts.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleToggle(p.id)}
                  className="flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                  style={{
                    borderColor: selected.includes(p.id) ? '#E91E63' : '#E5E7EB',
                    backgroundColor: selected.includes(p.id) ? '#FFF0F5' : '#FAFAFA',
                  }}
                >
                  {/* 复选框 */}
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: selected.includes(p.id) ? 'linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)' : '#fff',
                      border: selected.includes(p.id) ? 'none' : '2px solid #D1D5DB',
                    }}
                  >
                    {selected.includes(p.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <p className="flex-1 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{p.content}</p>
                  {isAuthenticated && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteMutation.mutate({ id: p.id }); }}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部：合并框 + 一键复制 */}
        {selected.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">已选 {selected.length} 条提示词</span>
              <button
                onClick={handleCopyMerged}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{ backgroundColor: mergedCopied ? '#ECFDF5' : '#FFF0F5', color: mergedCopied ? '#10B981' : '#E91E63' }}
              >
                {mergedCopied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                {mergedCopied ? '已复制' : '一键复制合并内容'}
              </button>
            </div>
            <div
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 leading-relaxed"
              style={{ background: '#F9FAFB', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}
            >
              {mergedText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// PPT人格类型定义
const PPT_TYPES = [
  {
    id: 'skin',
    name: '我有PPT，想让它更好看',
    tag: 'Skin',
    desc: '内容和逻辑都OK，就是颜值不够，想提升设计感和专业度。',
    aiRole: '[角色：设计师]',
    aiCore: '强调明暗、色调、对齐、视觉层次与留白美学。',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
  },
  {
    id: 'skeleton',
    name: '我有一堆文字，想变成PPT',
    tag: 'Skeleton',
    desc: '有Word/笔记/报告，但不知道怎么拆成PPT的结构，需要帮我整理框架。',
    aiRole: '[角色：架构师]',
    aiCore: '强调PLC/SCQA逻辑框架、信息分层与结构化表达。',
    color: '#10B981',
    bgColor: '#ECFDF5',
  },
  {
    id: 'soul',
    name: '我只有想法，想从零做PPT',
    tag: 'Soul',
    desc: '脑子里有个方向，但还没有任何素材，需要从零帮我搭出整个PPT框架。',
    aiRole: '[角色：战略顾问]',
    aiCore: '强调受众分析、痛点挖掘与核心价值主张提炼。',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
  },
  {
    id: 'shield',
    name: '我的PPT数据很多，想让逻辑更严密',
    tag: 'Shield',
    desc: '有大量数据和研究结论，需要确保每个论点都有依据，经得起质疑。',
    aiRole: '[角色：审计官]',
    aiCore: '强调压力测试、防御性逻辑与数据可视化叙事。',
    color: '#EF4444',
    bgColor: '#FEF2F2',
  },
  {
    id: 'story',
    name: '我想做一个能打动人的PPT',
    tag: 'Story',
    desc: '有一些故事和案例，想做成能引发共鸣、让人记住的演讲型PPT。',
    aiRole: '[角色：编剧]',
    aiCore: '强调叙事曲线、情感渲染与观众心理节奏设计。',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
  },
  {
    id: 'essence',
    name: '我的PPT太多太乱，想做减法',
    tag: 'Essence',
    desc: '内容太多，每页都塞满了字，需要帮我提炼核心，做到一页一个重点。',
    aiRole: '[角色：产品经理]',
    aiCore: '强调暴力降噪、极简主义与"一页一观点"原则。',
    color: '#6B7280',
    bgColor: '#F9FAFB',
  },
];

// 第二层问题：根据类型定制
const LAYER2_QUESTIONS: Record<string, { question: string; options: string[] }[]> = {
  skin: [
    {
      question: '你的PPT目前是什么风格？',
      options: ['商务正式（深色/蓝色系）', '简约清新（白底黑字）', '活泼创意（多彩/插画）', '暂无风格，一片混乱'],
    },
    {
      question: '你希望改造后的视觉风格是？',
      options: ['高端商务（深蓝/黑金）', '科技感（深色+发光）', '清新专业（白+品牌色）', '温暖亲和（米色/暖调）'],
    },
    {
      question: '你的PPT主要用于什么场合？',
      options: ['对外客户/投资人汇报', '内部团队会议', '公开演讲/大会', '线上分享/视频录制'],
    },
  ],
  skeleton: [
    {
      question: '你现有的文字素材是什么形式？',
      options: ['Word文档/报告', '微信聊天记录/笔记', '脑图/思维导图', '口头描述，还没有文字'],
    },
    {
      question: '你的PPT核心目的是什么？',
      options: ['说服对方做决策', '传授知识/培训', '汇报工作进展', '展示产品/方案'],
    },
    {
      question: '你希望PPT的逻辑结构是？',
      options: ['问题→分析→解决方案', '现状→目标→路径', '背景→亮点→行动号召', '让AI帮我决定'],
    },
  ],
  soul: [
    {
      question: '你的PPT大概要讲什么主题？',
      options: ['商业计划/创业项目', '产品发布/功能介绍', '个人品牌/能力展示', '培训课程/知识分享'],
    },
    {
      question: '你的目标受众是谁？',
      options: ['投资人/老板', '客户/用户', '同事/团队', '大众/粉丝'],
    },
    {
      question: '你希望受众看完后有什么感受？',
      options: ['信任你，愿意合作', '理解你的产品，想购买', '学到东西，有收获', '被激励，愿意行动'],
    },
  ],
  shield: [
    {
      question: '你的数据来源是什么？',
      options: ['市场调研报告', '公司内部数据', '学术论文/研究', '多方数据混合'],
    },
    {
      question: '你的PPT需要应对什么质疑？',
      options: ['数据真实性质疑', '逻辑推理质疑', '可行性质疑', '竞品对比质疑'],
    },
    {
      question: '你的核心论点有几个？',
      options: ['1个核心论点', '2-3个并列论点', '4-5个递进论点', '还不确定'],
    },
  ],
  story: [
    {
      question: '你想用什么故事打动受众？',
      options: ['真实案例/客户故事', '个人经历/成长故事', '行业痛点/共鸣场景', '数据背后的人物故事'],
    },
    {
      question: '你希望受众的情绪走向是？',
      options: ['共情→信任→行动', '震惊→好奇→认同', '感动→激励→改变', '轻松→愉悦→记忆'],
    },
    {
      question: '你的演讲时长大概是多少？',
      options: ['5分钟以内', '10-15分钟', '20-30分钟', '30分钟以上'],
    },
  ],
  essence: [
    {
      question: '你现在的PPT大概有多少页？',
      options: ['10-20页', '20-40页', '40-60页', '60页以上'],
    },
    {
      question: '你最想保留的核心信息是什么？',
      options: ['核心数据和结论', '解决方案和行动项', '品牌故事和价值观', '让AI帮我判断'],
    },
    {
      question: '精简后你希望保留多少页？',
      options: ['5页以内（极致精简）', '10页左右', '15-20页', '越少越好，不设限'],
    },
  ],
};

// 第三层问题：通用深化问题
const LAYER3_QUESTIONS = [
  {
    question: '你的PPT需要多少张幻灯片？',
    options: ['5-10张（简洁版）', '10-20张（标准版）', '20-30张（详细版）', '30张以上（完整版）'],
  },
  {
    question: '你的受众对这个话题的了解程度？',
    options: ['完全不了解（小白）', '有一点了解', '比较了解', '专业人士'],
  },
  {
    question: '你希望PPT的语言风格是？',
    options: ['正式专业', '轻松口语化', '学术严谨', '创意活泼'],
  },
  {
    question: '你有没有特定的品牌色或配色要求？',
    options: ['有，我会告诉AI', '没有，让AI自由发挥', '参考竞品风格', '使用行业通用配色'],
  },
];

type Step = 'layer1' | 'layer2' | 'layer3' | 'result';

export default function PptGuide() {
  const [, setLocation] = useLocation();
  const params = useParams() as { id?: string };
  const ledgerId = params.id;
  const [step, setStep] = useState<Step>('layer1');
  const [selectedType, setSelectedType] = useState<string>('');
  const [layer2Answers, setLayer2Answers] = useState<string[]>([]);
  const [layer3Answers, setLayer3Answers] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);

  const selectedTypeData = PPT_TYPES.find(t => t.id === selectedType);
  const layer2Questions = selectedType ? LAYER2_QUESTIONS[selectedType] || [] : [];

  // 生成最终提示词
  const generatePrompt = () => {
    if (!selectedTypeData) return '';
    const l2q = layer2Questions;
    const l3q = LAYER3_QUESTIONS;

    const l2Lines = layer2Answers.map((ans, i) =>
      `- ${l2q[i]?.question}：${ans}`
    ).join('\n');
    const l3Lines = layer3Answers.map((ans, i) =>
      `- ${l3q[i]?.question}：${ans}`
    ).join('\n');

    return `你是一位专业的PPT制作顾问，请根据以下需求为我生成一份完整的PPT内容方案。

【客户类型】
${selectedTypeData.aiRole} — ${selectedTypeData.name}
核心诉求：${selectedTypeData.desc}
AI策略：${selectedTypeData.aiCore}

【需求详情】
${l2Lines}

【制作规格】
${l3Lines}

【输出要求】
1. 请先给出PPT的整体框架（目录/章节结构）
2. 逐页给出每张幻灯片的标题、核心内容要点（3-5条）
3. 对关键页面给出视觉设计建议（配色、图表类型、排版方向）
4. 最后给出一段完整的AI生图提示词，用于生成封面图

请用专业、简洁的语言输出，确保内容直接可用。`;
  };

  const handleCopy = () => {
    const prompt = generatePrompt();
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSelectType = (typeId: string) => {
    setSelectedType(typeId);
    setLayer2Answers([]);
    setLayer3Answers([]);
    setCurrentQ(0);
    setStep('layer2');
  };

  // 第一层：选择类型
  if (step === 'layer1') {
    const mainTypes = PPT_TYPES.slice(0, 3);
    const moreTypes = PPT_TYPES.slice(3);

    return (
      <div className="min-h-screen bg-gray-50">
        {/* 顶部导航 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation(-1 as any)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">AI PPT 引导助手</h1>
            <p className="text-xs text-gray-500">第 1 步 / 共 3 步</p>
          </div>
          {/* 提示词库按鈕 */}
          <button
            onClick={() => setLocation(ledgerId ? `/ledger/${ledgerId}/ppt-prompt-library` : '/ppt-prompt-library')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: 'linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)', color: '#E91E63' }}
          >
            <BookMarked className="w-3.5 h-3.5" />
            提示词
          </button>
        </div>

        <div className="px-4 pt-5 pb-8">
          {/* 说明文字 */}
          <p className="text-sm text-gray-500 mb-4">选择最符合你现状的类型，我们将为你定制专属提示词</p>

          {/* 前3个主要类型卡片 */}
          <div className="space-y-3">
            {mainTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => handleSelectType(type.id)}
                className="w-full text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.98]"
                style={{ backgroundColor: type.bgColor, borderColor: type.color + '30' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 mb-1">{type.name}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{type.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 ml-2" style={{ color: type.color }} />
                </div>
              </button>
            ))}
          </div>

          {/* 展开更多按钮 */}
          {!showMore && (
            <button
              onClick={() => setShowMore(true)}
              className="w-full mt-3 py-3 flex items-center justify-center gap-1.5 rounded-xl text-sm text-gray-500 border border-gray-200 bg-white"
            >
              <ChevronDown className="w-4 h-4" />
              <span>展开更多特殊场景（辩论 / 动员 / 极客）</span>
            </button>
          )}

          {/* 后3个折叠类型卡片 */}
          {showMore && (
            <div className="space-y-3 mt-3">
              {moreTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleSelectType(type.id)}
                  className="w-full text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.98]"
                  style={{ backgroundColor: type.bgColor, borderColor: type.color + '30' }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900 mb-1">{type.name}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{type.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 ml-2" style={{ color: type.color }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 第二层：类型专属问题
  if (step === 'layer2') {
    const q = layer2Questions[currentQ];
    if (!q) return null;
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => {
            if (currentQ === 0) setStep('layer1');
            else setCurrentQ(q => q - 1);
          }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">深入了解你的需求</h1>
            <p className="text-xs text-gray-500">第 2 步 · 问题 {currentQ + 1} / {layer2Questions.length}</p>
          </div>
          {/* 进度条 */}
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${((currentQ + 1) / layer2Questions.length) * 100}%`,
                backgroundColor: selectedTypeData?.color || '#3B82F6'
              }}
            />
          </div>
        </div>

        <div className="px-4 pt-6 pb-8">
          {/* 类型标签 */}
          {selectedTypeData && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-4"
              style={{ backgroundColor: selectedTypeData.bgColor, color: selectedTypeData.color }}>
              {selectedTypeData.name}
            </div>
          )}

          {/* 问题 */}
          <h2 className="text-lg font-bold text-gray-900 mb-5">{q.question}</h2>

          {/* 选项 */}
          <div className="space-y-3">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  const newAnswers = [...layer2Answers];
                  newAnswers[currentQ] = opt;
                  setLayer2Answers(newAnswers);
                  if (currentQ < layer2Questions.length - 1) {
                    setCurrentQ(currentQ + 1);
                  } else {
                    setCurrentQ(0);
                    setStep('layer3');
                  }
                }}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 font-medium active:scale-[0.98] transition-all"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 第三层：通用规格问题
  if (step === 'layer3') {
    const q = LAYER3_QUESTIONS[currentQ];
    if (!q) return null;
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => {
            if (currentQ === 0) { setStep('layer2'); setCurrentQ(layer2Questions.length - 1); }
            else setCurrentQ(q => q - 1);
          }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">最后几个问题</h1>
            <p className="text-xs text-gray-500">第 3 步 · 问题 {currentQ + 1} / {LAYER3_QUESTIONS.length}</p>
          </div>
          {/* 进度条 */}
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${((currentQ + 1) / LAYER3_QUESTIONS.length) * 100}%`, backgroundColor: '#6B7280' }}
            />
          </div>
        </div>

        <div className="px-4 pt-6 pb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-5">{q.question}</h2>

          <div className="space-y-3">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  const newAnswers = [...layer3Answers];
                  newAnswers[currentQ] = opt;
                  setLayer3Answers(newAnswers);
                  if (currentQ < LAYER3_QUESTIONS.length - 1) {
                    setCurrentQ(currentQ + 1);
                  } else {
                    setStep('result');
                  }
                }}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 font-medium active:scale-[0.98] transition-all"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 结果页
  if (step === 'result') {
    const prompt = generatePrompt();
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setCurrentQ(LAYER3_QUESTIONS.length - 1); setStep('layer3'); }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">你的专属提示词已生成</h1>
        </div>

        <div className="px-4 pt-5 pb-8">
          {/* 类型总结 */}
          {selectedTypeData && (
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: selectedTypeData.bgColor }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold" style={{ color: selectedTypeData.color }}>{selectedTypeData.name}</span>
              </div>
              <p className="text-xs text-gray-600">{selectedTypeData.aiRole} · {selectedTypeData.aiCore}</p>
            </div>
          )}

          {/* 提示词 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">完整提示词</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{ backgroundColor: copied ? '#ECFDF5' : '#EFF6FF', color: copied ? '#10B981' : '#3B82F6' }}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '一键复制'}
              </button>
            </div>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-sans">{prompt}</pre>
          </div>

          {/* 推荐工具 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">推荐AI工具</p>
            <div className="space-y-2">
              {[
                { name: 'ChatGPT / Claude', desc: '生成PPT文字内容和结构框架' },
                { name: 'Gamma', desc: '一键生成可编辑的精美PPT' },
                { name: 'Beautiful.ai', desc: '智能排版，自动美化设计' },
                { name: 'Canva AI', desc: '丰富模板+AI辅助设计' },
              ].map(tool => (
                <div key={tool.name} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  <div>
                    <span className="text-xs font-medium text-gray-800">{tool.name}</span>
                    <span className="text-xs text-gray-500 ml-1.5">{tool.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 重新开始 */}
          <button
            onClick={() => { setStep('layer1'); setSelectedType(''); setLayer2Answers([]); setLayer3Answers([]); setCurrentQ(0); setShowMore(false); }}
            className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 font-medium"
          >
            重新选择类型
          </button>
        </div>
      </div>
    );
  }

  return null;
}
