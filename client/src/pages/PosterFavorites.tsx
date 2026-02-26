import { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { trpc } from '../lib/trpc';

// 海报模板配置
interface PosterTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  series: string;
  templateUrl: string;  // 模板图片URL
  tags: string[];
  // 二维码配置（如果有，说明需要叠加用户专属二维码）
  qrConfig?: {
    x: number;
    y: number;
    size: number;
  };
}

// COS域名前缀
const COS_BASE = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com';

// 所有海报模板（静态配置）
// 有qrConfig的海报会自动通过后端合成用户专属二维码
const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'invite-ledger',
    title: '共享账本邀请海报',
    description: '脉动共享账本试用版正式上线',
    category: 'invite',
    series: '邀请好友',
    templateUrl: `${COS_BASE}/posters/templates/invite-ledger-template-v2.jpg`,
    tags: ['邀请', '二维码', '专属'],
    qrConfig: {
      x: 557,
      y: 1135,
      size: 121,
    },
  },
  {
    id: 'marketing-ktv',
    title: 'KTV版宣传海报',
    description: '用别人的老婆赚钱 → KTV看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    templateUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/BIdmlhaAMFmWlZUX.png',
    tags: ['营销', '宣传', '脉动网'],
  },
  {
    id: 'marketing-didi',
    title: '滴滴版宣传海报',
    description: '用别人的汽车赚钱 → 滴滴看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    templateUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/DoomGMXoSjZsKEqJ.png',
    tags: ['营销', '宣传', '脉动网'],
  },
  {
    id: 'marketing-douyin',
    title: '抖音版宣传海报',
    description: '用别人的才艺赚钱 → 抖音看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    templateUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/QSPiOfWTShXrGIVA.png',
    tags: ['营销', '宣传', '脉动网'],
  },
  {
    id: 'marketing-meituan',
    title: '美团版宣传海报',
    description: '用别人的厨房赚钱 → 美团看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    templateUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/PLMlWEvujJloqzez.png',
    tags: ['营销', '宣传', '脉动网'],
  },
  {
    id: 'marketing-bank',
    title: '银行版宣传海报',
    description: '用别人的金钱赚钱 → 银行看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    templateUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/NKpRvVPDdxJHWlqe.png',
    tags: ['营销', '宣传', '脉动网'],
  },
  {
    id: 'marketing-insurance',
    title: '保险版宣传海报',
    description: '用别人的生命赚钱 → 保险看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    templateUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hJkCQwvjpIMuwwlz.png',
    tags: ['营销', '宣传', '脉动网'],
  },
];

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'invite', label: '邀请海报' },
  { value: 'marketing', label: '营销类' },
];

export default function PosterFavorites() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewPoster, setPreviewPoster] = useState<{ url: string; title: string } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  // 存储已合成的海报URL（key: templateId, value: composedUrl）
  const [composedUrls, setComposedUrls] = useState<Record<string, string>>({});

  // 获取用户邀请信息
  const { data: inviteData } = trpc.invite.getMyInviteInfo.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // 获取需要二维码的海报模板列表
  const postersNeedingQR = POSTER_TEMPLATES.filter(p => p.qrConfig && p.templateUrl);

  // 为每个需要二维码的海报调用后端合成API
  const firstQRPoster = postersNeedingQR[0];
  const { data: composedData } = trpc.posterFavorites.getComposedPoster.useQuery(
    {
      templateId: firstQRPoster?.id || '',
      templateUrl: firstQRPoster?.templateUrl || '',
      qrX: firstQRPoster?.qrConfig?.x || 0,
      qrY: firstQRPoster?.qrConfig?.y || 0,
      qrSize: firstQRPoster?.qrConfig?.size || 0,
    },
    {
      enabled: !!firstQRPoster?.templateUrl && !!inviteData?.inviteCode,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 30, // 30分钟缓存
    }
  );

  // 更新合成URL
  useEffect(() => {
    if (composedData?.composedUrl && firstQRPoster) {
      setComposedUrls(prev => ({
        ...prev,
        [firstQRPoster.id]: composedData.composedUrl,
      }));
    }
  }, [composedData]);

  // 获取海报的显示URL
  const getPosterDisplayUrl = (poster: PosterTemplate): string => {
    if (poster.qrConfig && composedUrls[poster.id]) {
      return composedUrls[poster.id];
    }
    return poster.templateUrl;
  };

  // 检查海报是否可显示
  const isPosterReady = (poster: PosterTemplate): boolean => {
    if (!poster.templateUrl) return false;
    if (poster.qrConfig) {
      return !!composedUrls[poster.id];
    }
    return true;
  };

  // 筛选海报
  const allPosters = POSTER_TEMPLATES.filter(p => p.templateUrl);
  const filteredPosters = selectedCategory === 'all'
    ? allPosters
    : allPosters.filter(p => p.category === selectedCategory);

  // 构建显示列表
  const displayPosters = filteredPosters.map(p => ({
    ...p,
    displayUrl: getPosterDisplayUrl(p),
    isReady: isPosterReady(p),
    isComposing: p.qrConfig && !composedUrls[p.id] && !!p.templateUrl,
  }));

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部导航栏 - z-20确保在最上层 */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/parent/profile')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">我的收藏</h1>
          <div className="w-9" />
        </div>
      </div>

      {/* 分类筛选器 */}
      <div className="bg-white px-4 py-3 border-b">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
      </div>

      {/* 海报网格 */}
      <div className="p-4">
        {displayPosters.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">📷</div>
            <p className="text-gray-500 text-lg">暂无收藏的海报</p>
            <p className="text-gray-400 text-sm mt-2">快去创建你的第一张海报吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {displayPosters.map((poster, index) => (
              <div
                key={poster.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  if (poster.isReady) {
                    setCurrentIndex(index);
                    setPreviewPoster({ url: poster.displayUrl, title: poster.title });
                  }
                }}
              >
                <div className="aspect-[9/16] bg-gray-100 relative overflow-hidden">
                  {/* 专属标签 - z-[5]确保不会覆盖导航栏 */}
                  {poster.qrConfig && (
                    <div className="absolute top-2 right-2 z-[5] bg-red-600 text-white text-xs px-2 py-1 rounded-full shadow-sm">
                      专属
                    </div>
                  )}
                  
                  {poster.isComposing ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-amber-100">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mb-3"></div>
                      <p className="text-xs text-gray-500">正在生成专属海报...</p>
                    </div>
                  ) : poster.isReady ? (
                    <img
                      src={poster.displayUrl}
                      alt={poster.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                      <p className="text-xs text-gray-400">暂无图片</p>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate">{poster.title}</h3>
                  <p className="text-xs text-gray-500 truncate mt-1">{poster.series}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {CATEGORIES.find(c => c.value === poster.category)?.label || '其他'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预览弹窗 */}
      {previewPoster && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setPreviewPoster(null)}
        >
          <button
            onClick={() => setPreviewPoster(null)}
            className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full hover:bg-gray-100 transition-colors shadow-lg"
          >
            <X className="w-8 h-8 text-black" strokeWidth={3} />
          </button>

          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 px-4 py-2 bg-black bg-opacity-50 rounded-full text-white text-sm pointer-events-none">
            长按图片可保存
          </div>

          <div
            className="w-full h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => setTouchStart(e.targetTouches[0].clientX)}
            onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={() => {
              const diff = touchStart - touchEnd;
              if (Math.abs(diff) > 75) {
                const newIndex = diff > 0
                  ? Math.min(currentIndex + 1, displayPosters.length - 1)
                  : Math.max(currentIndex - 1, 0);
                if (newIndex !== currentIndex) {
                  setCurrentIndex(newIndex);
                  const p = displayPosters[newIndex];
                  setPreviewPoster({ url: p.displayUrl, title: p.title });
                }
              }
            }}
          >
            <img
              src={previewPoster.url}
              alt={previewPoster.title}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
