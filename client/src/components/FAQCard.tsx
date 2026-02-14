import React, { useState } from 'react';
import { HelpCircle, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

/**
 * 常见问题卡片 - 红白风格版本
 * 对标第一层和第二层的视觉风格
 * 使用原来的三个问题
 */
export default function FAQCard() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const faqs: FAQItem[] = [
    {
      id: 'equity-calculation',
      question: '我投这点钱到底占多少股？',
      answer: `您的股权占比 = (您的投资金额 ÷ 投资池总额) × 20%

举例：
- 您投资：10,000元
- 投资池总额：6,600,000元
- 您的占比：(10,000 ÷ 6,600,000) × 20% = 0.0303%

这个比例是固定的，写入《电子股权投资协议》，受法律保护。`,
    },
    {
      id: 'dilution-protection',
      question: '别人投的多了，我会被稀释吗？',
      answer: `不会。好友集采用"固定权重锚定"机制：

1. 投资股份池占总股本的20%，这个比例是固定的
2. 您在投资池中的占比 = 您的投资金额 ÷ 投资池总额
3. 无论后续有多少人加入，您在投资池中的占比永不稀释

举例：
- 您投资10,000元，投资池总额100万，您占投资池的1%
- 即使投资池总额增加到200万，您依然占投资池的1%
- 您的实际股权 = 1% × 20% = 0.2%（固定不变）`,
    },
    {
      id: 'compliance',
      question: '比例动态在变，如何保证合规又不乱？',
      answer: `好友集采用"三层保障机制"确保合规：

1. 法律保障
   - 《电子股权投资协议》明确约定股权计算规则
   - 每次变动均生成唯一Hash校验值，防止篡改
   - 所有协议受《中华人民共和国电子签名法》保护

2. 技术保障
   - 实时计算引擎：每次有人投资，系统自动重新计算所有人的股权
   - 区块链存证：关键数据上链，不可篡改
   - 透明化展示：您可以随时查看自己的股权明细

3. 制度保障
   - 公司章程明确规定股权池比例（投资池20%）
   - 股东大会决议需2/3以上股东同意
   - 专业律师审核所有股权变动`,
    },
  ];

  const copyText = (text: string, index?: number) => {
    navigator.clipboard.writeText(text).then(() => {
      if (index !== undefined) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      }
      toast.success('已复制到剪贴板');
    });
  };

  const copyAllFAQs = () => {
    const allText = faqs.map((faq, i) => 
      `${i + 1}. ${faq.question}\n\n${faq.answer}\n\n`
    ).join('---\n\n');
    copyText(allText);
  };

  return (
    <div className="space-y-0">
      {/* 红色顶盖 */}
      <div 
        className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-5 rounded-t-2xl rounded-b-none shadow-none border-none cursor-pointer transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm opacity-90">常见问题</span>
          <div className="flex items-center space-x-2">
            <HelpCircle className="w-5 h-5 opacity-90" />
            <svg
              className={`w-5 h-5 opacity-90 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        <div className="flex items-baseline space-x-2">
          <span className="text-5xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {faqs.length}
          </span>
          <span className="text-2xl opacity-90">个</span>
        </div>
        
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs opacity-60">核心问题解答</span>
          <span className="text-xs opacity-60 bg-white/10 px-2 py-0.5 rounded-full">
            股权相关
          </span>
        </div>

        {/* 展开后的详细内容 */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
            {faqs.map((faq, index) => (
              <div key={faq.id} className="bg-white/10 rounded-xl p-3">
                <div className="text-sm font-semibold mb-2">{index + 1}. {faq.question}</div>
                <div className="text-xs opacity-80 leading-relaxed whitespace-pre-line">
                  {faq.answer}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 白色/浅灰容器 */}
      <div className="bg-gray-50 rounded-t-none rounded-b-3xl shadow-sm border-none p-5">
        {/* 手风琴列表 */}
        <div className="space-y-3 mb-4">
          {faqs.map((faq, index) => (
            <div key={faq.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* 问题标题 */}
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full p-4 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-900 text-left">
                  {index + 1}. {faq.question}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ml-2 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* 答案内容 */}
              {openIndex === index && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-3">
                    {faq.answer}
                  </div>
                  <button
                    onClick={() => copyText(faq.answer, index)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {copiedIndex === index ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制此答案</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 虚线分割 */}
        <div className="border-t border-dashed border-gray-300 my-4"></div>

        {/* 底部总复制按钮 */}
        <button
          onClick={copyAllFAQs}
          className="w-full py-3 bg-white border-2 border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-2"
        >
          {copiedAll ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-green-600">已复制全部</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>复制全部问答</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
