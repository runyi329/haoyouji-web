import React, { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { MoreVertical, Image, Share2 } from 'lucide-react';

interface Tier {
  levelChar1: string;
  levelChar2: string;
  contacts: number;
  tagsPerPerson: number;
  frequency: number;
  benefit: string;
}

const PromotionRules: React.FC = () => {
  const [, setLocation] = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const userTiers: Tier[] = [
    {
      levelChar1: '标准',
      levelChar2: '用户',
      contacts: 10,
      tagsPerPerson: 1,
      frequency: 1,
      benefit: '全功能免费使用+脉动网礼品兑换'
    },
    {
      levelChar1: '高级',
      levelChar2: '用户',
      contacts: 20,
      tagsPerPerson: 2,
      frequency: 2,
      benefit: '标准权限全覆盖+私域好友共享会'
    },
    {
      levelChar1: '超级',
      levelChar2: '用户',
      contacts: 30,
      tagsPerPerson: 3,
      frequency: 3,
      benefit: '高级权限全覆盖+AI社交优先体验'
    }
  ];

  const nodeTiers: Tier[] = [
    {
      levelChar1: '标准',
      levelChar2: '节点',
      contacts: 50,
      tagsPerPerson: 3,
      frequency: 3,
      benefit: '专属邀请码+推荐加贡献持股权奖励'
    },
    {
      levelChar1: '高级',
      levelChar2: '节点',
      contacts: 100,
      tagsPerPerson: 5,
      frequency: 5,
      benefit: '标准权限全覆盖+业务端资源扶持'
    },
    {
      levelChar1: '超级',
      levelChar2: '节点',
      contacts: 150,
      tagsPerPerson: 8,
      frequency: 10,
      benefit: '高级权限全覆盖+受邀联合创始人'
    }
  ];

  // 生成长图
  const handleSaveImage = async () => {
    if (!contentRef.current) {
      toast.error('页面元素未找到');
      return;
    }
    
    setIsGenerating(true);
    setShowMenu(false);
    
    try {
      toast.info('正在生成长图,请稍候...');
      
      // 简化配置，只使用基本参数
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f9fafb',
        logging: true
      });
      
      // 转换为图片并下载
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = '晋升攻略.png';
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          toast.success('长图已保存!');
        } else {
          toast.error('图片生成失败');
        }
        setIsGenerating(false);
      }, 'image/png');
    } catch (error) {
      console.error('生成长图失败:', error);
      toast.error(`生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setIsGenerating(false);
    }
  };

  // 分享链接
  const handleShareLink = () => {
    const url = window.location.href;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        toast.success('链接已复制到剪贴板!');
        setShowMenu(false);
      }).catch(() => {
        toast.error('复制失败,请手动复制');
      });
    } else {
      toast.error('您的浏览器不支持自动复制');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#8B0000] text-white p-4 flex items-center justify-between shadow-lg sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={() => setLocation('/parent')} className="mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">晋升攻略</h1>
        </div>
        
        {/* 三点菜单 */}
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            disabled={isGenerating}
          >
            <MoreVertical className="w-6 h-6" />
          </button>
          
          {/* 下拉菜单 */}
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl z-30 overflow-hidden">
                <button
                  onClick={handleSaveImage}
                  className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  disabled={isGenerating}
                >
                  <Image className="w-5 h-5" />
                  <span>{isGenerating ? '生成中...' : '保存长图'}</span>
                </button>
                <button
                  onClick={handleShareLink}
                  className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors border-t border-gray-100"
                >
                  <Share2 className="w-5 h-5" />
                  <span>分享链接</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 内容区域（用于截图） */}
      <div ref={contentRef}>
      {/* 用户层 */}
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-2">用户层(使用型)</h2>
        <p className="text-sm text-gray-600 mb-4">
          适合专注于个人人脉整理与日常社交的用户,我们为您准备了丰富的礼品与活动。
        </p>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {userTiers.map((tier, index) => (
                <>
                  {/* 第1行:等级名称 + 3个指标 */}
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        人脉×<span className="font-bold text-gray-800">{tier.contacts}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        标签×<span className="font-bold text-gray-800">{tier.tagsPerPerson}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-xs text-gray-600">
                        联络×<span className="font-bold text-gray-800">{tier.frequency}</span>
                      </div>
                    </td>
                  </tr>
                  {/* 第2行:权益(合并3列,添加上边框) */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50 border-t border-gray-200">
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {tier.benefit}
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 节点层 */}
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-2">节点层(经营型)</h2>
        <p className="text-sm text-gray-600 mb-4">
          适合致力于人脉资产经营与价值创造的合作伙伴,您将深度参与公司的成长和利润分享。
        </p>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {nodeTiers.map((tier, index) => (
                <>
                  {/* 第1行:等级名称 + 3个指标 */}
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        人脉×<span className="font-bold text-gray-800">{tier.contacts}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        标签×<span className="font-bold text-gray-800">{tier.tagsPerPerson}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-xs text-gray-600">
                        联络×<span className="font-bold text-gray-800">{tier.frequency}</span>
                      </div>
                    </td>
                  </tr>
                  {/* 第2行:权益(合并3列,添加上边框) */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50 border-t border-gray-200">
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {tier.benefit}
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 考核指标说明 */}
      <div className="p-4 pb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-700 mb-3">晋升攻略</h3>
          <div className="space-y-2 text-xs text-gray-600 leading-relaxed">
            <p>
              <span className="font-semibold text-gray-700">人脉:</span>
              账户内添加的联系人数量,不考虑信息完整度。
            </p>
            <p>
              <span className="font-semibold text-gray-700">标签:</span>
              所有联系人的平均标签数。例如3人中2人标签为0、1人标签为9,平均值为3。包含全局标签和个人标签。
            </p>
            <p>
              <span className="font-semibold text-gray-700">联络:</span>
              每个自然周(周一至周日)登记联络人脉的次数。本周权益取决于上周是否达标,上周达标本周享有权益,本周未达标下周失去权益。系统会提示您本周还差多少次联络。
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default PromotionRules;
