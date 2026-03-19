import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';

// PPT人格类型定义
const PPT_TYPES = [
  {
    id: 'skin',
    name: '优化型',
    tag: 'Skin',
    desc: '有PPT，内容满意，求美化。',
    detail: '你已经有完整的PPT，内容和逻辑都OK，只是觉得视觉上不够专业、不够好看，希望提升颜值和设计感。',
    aiRole: '[角色：设计师]',
    aiCore: '强调明暗、色调、对齐、视觉层次与留白美学。',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
  },
  {
    id: 'skeleton',
    name: '重构型',
    tag: 'Skeleton',
    desc: '有文字素材，求逻辑摆盘。',
    detail: '你有大量文字内容（Word文档、笔记、报告），但不知道怎么拆解成PPT的逻辑结构，需要帮你重新组织框架。',
    aiRole: '[角色：架构师]',
    aiCore: '强调PLC/SCQA逻辑框架、信息分层与结构化表达。',
    color: '#10B981',
    bgColor: '#ECFDF5',
  },
  {
    id: 'soul',
    name: '孵化型',
    tag: 'Soul',
    desc: '只有想法，求战略定位。',
    detail: '你只有一个模糊的想法或方向，还没有任何素材，需要从零开始帮你梳理核心主题、受众定位和内容骨架。',
    aiRole: '[角色：战略顾问]',
    aiCore: '强调受众分析、痛点挖掘与核心价值主张提炼。',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
  },
  {
    id: 'shield',
    name: '辩论型',
    tag: 'Shield',
    desc: '数据复杂，求严密逻辑。',
    detail: '你的PPT包含大量数据、研究结论或专业论证，需要确保每个论点都有充分依据，逻辑无懈可击。',
    aiRole: '[角色：审计官]',
    aiCore: '强调压力测试、防御性逻辑与数据可视化叙事。',
    color: '#EF4444',
    bgColor: '#FEF2F2',
  },
  {
    id: 'story',
    name: '动员型',
    tag: 'Story',
    desc: '零散感性素材，求共鸣。',
    detail: '你有一些感性的故事、案例或情感素材，想做一个能打动人心、引发共鸣的演讲型PPT。',
    aiRole: '[角色：编剧]',
    aiCore: '强调叙事曲线、情感渲染与观众心理节奏设计。',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
  },
  {
    id: 'essence',
    name: '极客型',
    tag: 'Essence',
    desc: '信息冗余，求极致精简。',
    detail: '你的PPT内容太多太杂，每页都塞满了文字，需要帮你做减法，提炼核心信息，做到一页一个核心观点。',
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
  const [step, setStep] = useState<Step>('layer1');
  const [selectedType, setSelectedType] = useState<string>('');
  const [layer2Answers, setLayer2Answers] = useState<string[]>([]);
  const [layer3Answers, setLayer3Answers] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [copied, setCopied] = useState(false);

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
${selectedTypeData.aiRole} — ${selectedTypeData.name}型（${selectedTypeData.tag}）
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

  // 第一层：选择类型
  if (step === 'layer1') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* 顶部导航 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation(-1 as any)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">AI PPT 引导助手</h1>
            <p className="text-xs text-gray-500">第 1 步 / 共 3 步</p>
          </div>
        </div>

        <div className="px-4 pt-5 pb-8">
          {/* 标题区 */}
          <div className="mb-5">
            <p className="text-sm text-gray-500">选择最符合你现状的类型，我们将为你定制专属提示词</p>
          </div>

          {/* 类型卡片 */}
          <div className="space-y-3">
            {PPT_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setSelectedType(type.id);
                  setLayer2Answers([]);
                  setLayer3Answers([]);
                  setCurrentQ(0);
                  setStep('layer2');
                }}
                className="w-full text-left rounded-2xl border-2 border-transparent p-4 transition-all active:scale-98"
                style={{ backgroundColor: type.bgColor, borderColor: type.color + '30' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold" style={{ color: type.color }}>{type.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: type.color + '20', color: type.color }}>
                        {type.tag}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 font-medium">{type.desc}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{type.detail}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 mt-1 shrink-0 ml-2" style={{ color: type.color }} />
                </div>
              </button>
            ))}
          </div>
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
              <span>{selectedTypeData.name}型</span>
              <span className="opacity-60">·</span>
              <span>{selectedTypeData.tag}</span>
            </div>
          )}

          <h2 className="text-lg font-bold text-gray-900 mb-5 leading-snug">{q.question}</h2>

          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
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
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 font-medium active:scale-98 transition-all hover:border-gray-300"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 第三层：通用深化问题
  if (step === 'layer3') {
    const q = LAYER3_QUESTIONS[currentQ];
    if (!q) return null;
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => {
            if (currentQ === 0) { setCurrentQ(layer2Questions.length - 1); setStep('layer2'); }
            else setCurrentQ(q => q - 1);
          }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">制作规格确认</h1>
            <p className="text-xs text-gray-500">第 3 步 · 问题 {currentQ + 1} / {LAYER3_QUESTIONS.length}</p>
          </div>
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all bg-gray-800"
              style={{ width: `${((currentQ + 1) / LAYER3_QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="px-4 pt-6 pb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-4 bg-gray-100 text-gray-600">
            最后几步，马上生成你的专属提示词
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-5 leading-snug">{q.question}</h2>

          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
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
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 font-medium active:scale-98 transition-all hover:border-gray-300"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 结果页：生成提示词
  if (step === 'result') {
    const prompt = generatePrompt();
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setCurrentQ(LAYER3_QUESTIONS.length - 1); setStep('layer3'); }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">你的专属 AI 提示词</h1>
            <p className="text-xs text-gray-500">复制后粘贴到任意 AI 工具即可</p>
          </div>
        </div>

        <div className="px-4 pt-5 pb-8">
          {/* 人格标签 */}
          {selectedTypeData && (
            <div className="flex items-center gap-3 p-4 rounded-2xl mb-4"
              style={{ backgroundColor: selectedTypeData.bgColor }}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold" style={{ color: selectedTypeData.color }}>
                    {selectedTypeData.name}型 · {selectedTypeData.tag}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{selectedTypeData.aiRole} — {selectedTypeData.aiCore}</p>
              </div>
            </div>
          )}

          {/* 提示词内容 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
            <pre className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{prompt}</pre>
          </div>

          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-98"
            style={{ backgroundColor: copied ? '#10B981' : '#1A56DB' }}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制！去粘贴到 AI 工具' : '一键复制提示词'}
          </button>

          {/* 重新开始 */}
          <button
            onClick={() => {
              setStep('layer1');
              setSelectedType('');
              setLayer2Answers([]);
              setLayer3Answers([]);
              setCurrentQ(0);
            }}
            className="w-full mt-3 py-3 rounded-2xl text-gray-600 font-medium text-sm border border-gray-200 bg-white"
          >
            重新测试
          </button>

          {/* 推荐AI工具 */}
          <div className="mt-5 p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <p className="text-xs font-semibold text-amber-800 mb-2">推荐使用以下 AI 工具</p>
            <div className="space-y-1.5">
              {['ChatGPT / Claude（内容生成）', 'Kimi / 豆包（中文优化）', 'Gamma / Beautiful.ai（自动生成PPT）', 'Canva AI / MindShow（一键成片）'].map(tool => (
                <div key={tool} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs text-amber-700">{tool}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
