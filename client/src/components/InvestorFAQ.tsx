import { useState } from 'react';
import { ChevronDown, Shield, LogOut, TrendingUp } from 'lucide-react';

interface FAQItem {
  id: string;
  question: string;
  icon: any;
  iconColor: string;
  answer: string;
}

/**
 * 智能化FAQ
 * 手风琴式折叠布局，三个核心投资人问题
 */
export default function InvestorFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = [
    {
      id: 'dilution-protection',
      question: '比例动态在变，如何保证我的权益不被稀释？',
      icon: Shield,
      iconColor: 'text-[#1976D2]',
      answer: `
**核心保护机制**

好友集采用"动态股权池 + 固定权重锚定"双重机制：

**1. 投资股份（原始核心权证）**
- 性质：固定权重，永久锁定
- 计算：您的投资金额 ÷ 投资池总额 × 20%
- 保障：无论后续有多少人加入，您在投资池中的占比**永不稀释**

**2. L杠杆系数的"反稀释"设计**
- 机制：持股排名越高，L系数越大
- 效果：即使新股东加入导致总股本增加，L系数会**自动放大您的分红权重**
- 公式：实际分红权 = 账面股权 × L系数

**3. 极端情况处理**
如公司进行下一轮融资，新投资人占股30%：
- 您的账面股权可能从0.4%变为0.3%（因总股本增加）
- 但您的**实际分红权**通过L系数调整后，依然保持在0.4%以上

**4. 法律与技术双重保障**
- 法律：《电子股权投资协议》明确约定"投资股份不可稀释条款"
- 技术：每次股权变动均生成唯一Hash校验值，防止后台篡改
      `.trim(),
    },
    {
      id: 'exit-mechanism',
      question: '如果我中途退出，股份如何处置？',
      icon: LogOut,
      iconColor: 'text-orange-600',
      answer: `
**退出权利与限制**

好友集尊重每位股东的退出权利，设置了"分阶段退出机制"：

**1. 锁定期与解锁规则**

*投资股份*
- 锁定期：12个月
- 12个月后：可申请退出，按当时公司估值回购
- 24个月后：可自由转让给其他股东或外部投资人

*邀请贡献*
- 锁定期：6个月
- 6个月后：可申请退出，按当时估值回购
- 特殊条款：您邀请的股东继续活跃，可保留50%的二级网络溢价

**2. 退出定价机制**
- 正常退出（锁定期后）：**100%估值回购**
- 提前退出（锁定期内）：**80%估值回购**（20%流动性折扣）
- 违约退出（如违反竞业协议）：**50%估值回购**

**3. 退出流程**
1. 在"合伙人保障中心"提交退出申请
2. 公司15个工作日内完成审核
3. 双方确认退出价格
4. 签署《股权退出协议》
5. 30个工作日内完成支付

**4. 优先购买权**
其他股东享有优先购买权：
- 优先级：持股排名前10 > 您的直接邀请人 > 其他股东
- 期限：15个工作日内决定
- 价格：与公司回购价格一致

**5. 特殊保护**
如您退出后公司估值大幅上涨（6个月内上涨超50%），您有权要求**补偿差价的30%**
      `.trim(),
    },
    {
      id: 'leverage-continuity',
      question: '下一轮融资时，我的杠杆系数L依然有效吗？',
      icon: TrendingUp,
      iconColor: 'text-[#4CAF50]',
      answer: `
**L杠杆系数的本质**

L系数不是"临时激励"，而是好友集股权架构的**核心设计**，代表您的**持续贡献价值**。

**1. L系数在融资中的演变**

*当前阶段*（Pre-A轮，估值6600万）
- 公式：L = 1 + (总股东数 - 您的排名) × 0.01
- 示例：您排名第1，L = 1 + (660 - 1) × 0.01 = 7.59x

*下一轮融资*（A轮，假设估值2亿）
- L系数**不会归零**，作为"历史贡献基数"保留
- 新公式：L_new = L_old × 0.7 + (新排名系数) × 0.3
- 示例：
  - L_old = 7.59x
  - 新排名系数 = 10.95x（假设新股东增至1000人，您排名第5）
  - L_new = 7.59 × 0.7 + 10.95 × 0.3 = **8.60x**
- 结果：L系数**不降反升**

**2. L系数的"抗稀释"设计**

案例说明：
- 融资前：持有1%股权，L系数7.59x，实际分红权 = **7.59%**
- A轮融资：新投资人占股30%，账面股权被稀释至0.7%
- 融资后：L系数升至8.60x，实际分红权 = 0.7% × 8.60 = **6.02%**
- 对比：虽然账面股权从1%降至0.7%，但实际分红权仅从7.59%降至6.02%，**稀释幅度仅为20.7%**（而非30%）

**3. 法律保障**
- 协议约定：《电子股权投资协议》第8条明确"L系数在任何资本运作中均应保留和延续"
- 股东大会：任何对L系数的调整，必须经**全体股东2/3以上**同意

**4. 特殊情况处理**

*公司被收购*
- L系数有效，收购方需承继股权架构，或按L系数调整后的实际分红权进行补偿

*公司IPO上市*
- L系数转化为"优先股权益"
- 普通股按账面股权，L系数溢价部分转化为优先分红权或额外期权

**5. 终极价值**
L系数的设计哲学：**"让早期信任者，享受长期红利"**。
您在估值6600万时加入，承担了最大风险，L系数就是公司对您"早期信任 + 持续贡献"的永久回报。
      `.trim(),
    },
  ];

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">投资人常见问题</h3>
        <span className="text-xs text-gray-400">解决90%的心理顾虑</span>
      </div>

      {/* FAQ列表 */}
      <div className="space-y-2">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          const Icon = faq.icon;

          return (
            <div
              key={faq.id}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                isOpen
                  ? 'bg-white border-blue-400 shadow-lg'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* 问题标题（可点击） */}
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${
                    isOpen ? 'from-blue-500 to-cyan-500' : 'from-gray-100 to-gray-200'
                  } flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${isOpen ? 'text-white' : faq.iconColor}`} />
                  </div>
                  <span className={`text-sm font-semibold ${
                    isOpen ? 'text-[#424242]' : 'text-gray-900'
                  }`}>
                    {faq.question}
                  </span>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    isOpen ? 'transform rotate-180' : ''
                  }`}
                />
              </button>

              {/* 答案内容（展开时显示） */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-100 animate-in slide-in-from-top-2 duration-300">
                  <div className="pt-4 prose prose-sm max-w-none">
                    {faq.answer.split('\n\n').map((paragraph, i) => {
                      // 处理标题（**文字**）
                      if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                        return (
                          <h4 key={i} className="text-sm font-bold text-gray-900 mt-3 mb-2">
                            {paragraph.replace(/\*\*/g, '')}
                          </h4>
                        );
                      }
                      
                      // 处理列表项（以*或-开头）
                      if (paragraph.startsWith('*') || paragraph.startsWith('-')) {
                        const items = paragraph.split('\n').filter(line => line.trim());
                        return (
                          <ul key={i} className="space-y-1 text-xs text-gray-700 mb-3">
                            {items.map((item, j) => (
                              <li key={j} className="flex items-start space-x-2">
                                <span className="text-[#1976D2] mt-1">•</span>
                                <span dangerouslySetInnerHTML={{ 
                                  __html: item.replace(/^[*-]\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
                                }} />
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      
                      // 普通段落
                      return (
                        <p 
                          key={i} 
                          className="text-xs text-gray-700 leading-relaxed mb-2"
                          dangerouslySetInnerHTML={{ 
                            __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* 底部操作 */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <button className="text-xs text-[#1976D2] hover:text-blue-700 font-semibold flex items-center space-x-1">
                      <span>查看完整《股权管理手册》</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className="bg-gray-100 rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-gray-600 leading-relaxed">
          <span className="font-semibold text-gray-900">更多问题？</span>
          如您有其他疑问，可随时联系合伙人服务团队，我们将在24小时内为您解答。
        </p>
      </div>
    </div>
  );
}
