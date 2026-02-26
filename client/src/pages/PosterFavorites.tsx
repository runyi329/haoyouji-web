import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { trpc } from '../lib/trpc';
import QRCode from 'qrcode';

// 海报二维码位置配置
// 每张海报都可以定义二维码的叠加位置和大小
interface QRConfig {
  x: number;      // 二维码左上角X坐标（相对于海报原始尺寸）
  y: number;      // 二维码左上角Y坐标
  size: number;   // 二维码尺寸（正方形）
  posterWidth: number;  // 海报原始宽度
  posterHeight: number; // 海报原始高度
}

interface PosterItem {
  id: number | string;
  title: string;
  description: string;
  category: string;
  series: string;
  url: string;
  thumbnailUrl: string;
  tags: string[];
  qrConfig?: QRConfig; // 如果有，说明需要叠加二维码
}

// 硬编码的海报数据
const POSTERS: PosterItem[] = [
  {
    id: 'invite-1',
    title: '共享账本邀请海报',
    description: '脉动共享账本试用版正式上线',
    category: 'invite',
    series: '邀请好友',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/ghWnvIHiWfySJPfG.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/ghWnvIHiWfySJPfG.png',
    tags: ['邀请', '二维码', '专属'],
    qrConfig: {
      x: 820,
      y: 1580,
      size: 230,
      posterWidth: 1080,
      posterHeight: 1920,
    }
  },
  {
    id: 1,
    title: 'KTV版宣传海报',
    description: '用别人的老婆赚钱 → KTV看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/BIdmlhaAMFmWlZUX.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/BIdmlhaAMFmWlZUX.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 2,
    title: '滴滴版宣传海报',
    description: '用别人的汽车赚钱 → 滴滴看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/DoomGMXoSjZsKEqJ.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/DoomGMXoSjZsKEqJ.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 3,
    title: '抖音版宣传海报',
    description: '用别人的才艺赚钱 → 抖音看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/QSPiOfWTShXrGIVA.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/QSPiOfWTShXrGIVA.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 4,
    title: '美团版宣传海报',
    description: '用别人的厨房赚钱 → 美团看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/PLMlWEvujJloqzez.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/PLMlWEvujJloqzez.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 5,
    title: '银行版宣传海报',
    description: '用别人的金钱赚钱 → 银行看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/NKpRvVPDdxJHWlqe.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/NKpRvVPDdxJHWlqe.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 6,
    title: '保险版宣传海报',
    description: '用别人的生命赚钱 → 保险看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hJkCQwvjpIMuwwlz.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hJkCQwvjpIMuwwlz.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  }
];

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'invite', label: '邀请海报' },
  { value: 'marketing', label: '营销类' },
  { value: 'product', label: '产品教程' },
  { value: 'target', label: '特定对象' },
  { value: 'brand', label: '品牌宣传' },
  { value: 'event', label: '活动类' },
  { value: 'other', label: '其他' }
];

export default function PosterFavorites() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewPoster, setPreviewPoster] = useState<PosterItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  // 存储已合成的海报（带二维码的）
  const [composedPosters, setComposedPosters] = useState<Record<string, string>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 获取用户邀请码
  const { data: inviteData } = trpc.invite.getMyInviteInfo.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // 为需要二维码的海报生成合成图
  const composePosterWithQR = useCallback(async (poster: PosterItem, inviteCode: string) => {
    const qrConfig = poster.qrConfig;
    if (!qrConfig || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = qrConfig.posterWidth;
    canvas.height = qrConfig.posterHeight;

    return new Promise<string>((resolve, reject) => {
      const posterImg = new Image();
      posterImg.crossOrigin = 'anonymous';
      posterImg.onload = async () => {
        ctx.drawImage(posterImg, 0, 0, qrConfig.posterWidth, qrConfig.posterHeight);

        // 生成二维码
        const inviteLink = `https://jiangyuchen.cn/login?invite=${inviteCode}`;
        try {
          const qrDataUrl = await QRCode.toDataURL(inviteLink, {
            width: qrConfig.size,
            margin: 1,
            color: { dark: '#000000', light: '#FFFFFF' },
            errorCorrectionLevel: 'M',
          });

          const qrImg = new Image();
          qrImg.onload = () => {
            // 先画白色背景
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(qrConfig.x - 5, qrConfig.y - 5, qrConfig.size + 10, qrConfig.size + 10);
            // 再画二维码
            ctx.drawImage(qrImg, qrConfig.x, qrConfig.y, qrConfig.size, qrConfig.size);
            resolve(canvas.toDataURL('image/png', 0.95));
          };
          qrImg.onerror = () => resolve(poster.url); // 失败时用原图
          qrImg.src = qrDataUrl;
        } catch {
          resolve(poster.url);
        }
      };
      posterImg.onerror = () => resolve(poster.url);
      posterImg.src = poster.url;
    });
  }, []);

  // 当邀请码加载完成后，为所有需要二维码的海报生成合成图
  useEffect(() => {
    if (!inviteData?.inviteCode) return;

    const postersNeedingQR = POSTERS.filter(p => p.qrConfig);
    postersNeedingQR.forEach(async (poster) => {
      const key = String(poster.id);
      if (composedPosters[key]) return; // 已生成

      const composed = await composePosterWithQR(poster, inviteData.inviteCode);
      if (composed) {
        setComposedPosters(prev => ({ ...prev, [key]: composed }));
      }
    });
  }, [inviteData, composePosterWithQR]);

  // 获取海报的实际显示URL（如果有合成图则用合成图）
  const getPosterUrl = (poster: PosterItem, forThumbnail = false) => {
    const key = String(poster.id);
    if (poster.qrConfig && composedPosters[key]) {
      return composedPosters[key];
    }
    return forThumbnail ? poster.thumbnailUrl : poster.url;
  };

  // 筛选海报
  const filteredPosters = selectedCategory === 'all'
    ? POSTERS
    : POSTERS.filter(p => p.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 隐藏的Canvas用于合成海报 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 顶部导航栏 */}
      <div className="bg-white border-b sticky top-0 z-10">
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
        {filteredPosters.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">📷</div>
            <p className="text-gray-500 text-lg">暂无收藏的海报</p>
            <p className="text-gray-400 text-sm mt-2">快去创建你的第一张海报吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredPosters.map((poster, index) => (
              <div
                key={poster.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setCurrentIndex(index);
                  setPreviewPoster(poster);
                }}
              >
                <div className="aspect-[9/16] bg-gray-100 relative">
                  {poster.qrConfig && (
                    <div className="absolute top-2 right-2 z-10 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                      专属
                    </div>
                  )}
                  <img
                    src={getPosterUrl(poster, true)}
                    alt={poster.title}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
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

      {/* 预览弹窗 - 支持左右滑动切换 */}
      {previewPoster && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setPreviewPoster(null)}
        >
          {/* 关闭按钮 */}
          <button
            onClick={() => setPreviewPoster(null)}
            className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full hover:bg-gray-100 transition-colors shadow-lg"
          >
            <X className="w-8 h-8 text-black" strokeWidth={3} />
          </button>

          {/* 页码显示 */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 px-4 py-2 bg-black bg-opacity-50 rounded-full text-white text-sm pointer-events-none">
            {currentIndex + 1} / {filteredPosters.length}
          </div>

          {/* 图片容器 - 支持触摸滑动 */}
          <div
            className="w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              setTouchStart(e.targetTouches[0].clientX);
            }}
            onTouchMove={(e) => {
              setTouchEnd(e.targetTouches[0].clientX);
            }}
            onTouchEnd={() => {
              if (touchStart - touchEnd > 75) {
                if (currentIndex < filteredPosters.length - 1) {
                  const newIndex = currentIndex + 1;
                  setCurrentIndex(newIndex);
                  setPreviewPoster(filteredPosters[newIndex]);
                }
              }
              if (touchStart - touchEnd < -75) {
                if (currentIndex > 0) {
                  const newIndex = currentIndex - 1;
                  setCurrentIndex(newIndex);
                  setPreviewPoster(filteredPosters[newIndex]);
                }
              }
            }}
          >
            <img
              src={getPosterUrl(previewPoster)}
              alt={previewPoster.title}
              className="max-w-full max-h-full object-contain"
              onContextMenu={(e) => {
                // 允许长按保存
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
