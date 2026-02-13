import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import ChinaMap from '@/components/ChinaMap';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, MapPin, UserCheck, UserX, Smile, Layers2, Layers3, Handshake, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';

// 省份简称映射
const provinceShortNames: Record<string, string> = {
  '北京市': '北京', '天津市': '天津', '上海市': '上海', '重庆市': '重庆',
  '河北省': '河北', '山西省': '山西', '辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江',
  '江苏省': '江苏', '浙江省': '浙江', '安徽省': '安徽', '福建省': '福建', '江西省': '江西', '山东省': '山东',
  '河南省': '河南', '湖北省': '湖北', '湖南省': '湖南', '广东省': '广东', '海南省': '海南',
  '四川省': '四川', '贵州省': '贵州', '云南省': '云南', '陕西省': '陕西', '甘肃省': '甘肃', '青海省': '青海',
  '内蒙古自治区': '内蒙', '广西壮族自治区': '广西', '西藏自治区': '西藏', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
  '台湾省': '台湾', '香港特别行政区': '香港', '澳门特别行政区': '澳门',
  '海外': '海外', '其他': '其他'
};

// 所有省份列表(包括海外和其他)
const allProvinces = [
  '北京市', '天津市', '上海市', '重庆市',
  '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省',
  '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '海南省',
  '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省',
  '内蒙古自治区', '广西壮族自治区', '西藏自治区', '宁夏回族自治区', '新疆维吾尔自治区',
  '台湾省', '香港特别行政区', '澳门特别行政区',
  '海外', '其他'
];

// 颜色映射函数
function mapColorToTheme(color: string): string {
  const colorMap: Record<string, string> = {
    '#3b82f6': 'var(--color-primary)',
    '#A80000': 'var(--color-secondary)',
    '#ec4899': 'var(--color-accent)',
    '#f59e0b': 'var(--color-accent2)',
  };
  return colorMap[color] || color;
}

// 根据距离上次联络的天数返回颜色
function getInteractionStatusColor(days: number | null): string {
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#9333EA';
  const secondary = getComputedStyle(document.documentElement).getPropertyValue('--color-secondary').trim() || '#A78BFA';
  const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--color-accent2').trim() || '#8B7FA0';
  
  if (days === null) return accent2;
  if (days <= 30) return primary;
  if (days <= 90) return secondary;
  return accent2;
}

// 格式化日期
function formatDate(timestamp: number | null): string {
  if (!timestamp) return '从未联络';
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export default function RegionMap() {
  const [, setLocation] = useLocation();
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isMobile = !useMediaQuery("(min-width: 768px)");
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalContacts, setTotalContacts] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 获取区域统计数据
  const { data: regionStatsData = [] } = trpc.contacts.regions.stats.useQuery();

  // 获取选中省份的人脉列表（分页）
  const { data: regionData, isLoading, isFetching } = trpc.contacts.regions.list.useQuery(
    { 
      region: selectedProvince || '',
      page: currentPage,
      pageSize: 50
    },
    { enabled: !!selectedProvince }
  );

  // 当选中省份变化时，重置分页
  useEffect(() => {
    if (selectedProvince) {
      setCurrentPage(1);
      setAllContacts([]);
      setHasMore(true);
      setTotalContacts(0);
    }
  }, [selectedProvince]);

  // 当获取到新数据时，更新本地状态
  useEffect(() => {
    if (regionData) {
      if (currentPage === 1) {
        // 第一页，替换所有数据
        setAllContacts(regionData.contacts || []);
      } else {
        // 后续页面，追加数据
        setAllContacts(prev => [...prev, ...(regionData.contacts || [])]);
      }
      setHasMore(regionData.hasMore || false);
      setTotalContacts(regionData.total || 0);
      setIsLoadingMore(false);
    }
  }, [regionData, currentPage]);

  // 使用后端返回的动态排序结果（已按人脉数量降序，海外和其他在最后）
  const provinceStats = useMemo(() => {
    return regionStatsData;
  }, [regionStatsData]);

  const totalStats = regionStatsData.reduce((sum, s) => sum + s.value, 0);
  const activeProvinces = regionStatsData.filter(s => s.value > 0).length;

  // 当选择省份时，如果是移动端，打开抽屉
  useEffect(() => {
    if (selectedProvince && isMobile) {
      setIsDrawerOpen(true);
    }
  }, [selectedProvince, isMobile]);

  const handleDrawerOpenChange = (open: boolean) => {
    setIsDrawerOpen(open);
    if (!open) {
      setTimeout(() => setSelectedProvince(null), 300);
    }
  };

  const handleProvinceClick = (provinceName: string) => {
    setSelectedProvince(provinceName);
  };

  const handleContactClick = (contactId: number, isShared?: boolean, sharerName?: string) => {
    if (isShared) {
      // 如果是共享人脉，提示用户找共享人
      alert(`这是 ${sharerName || '其他用户'} 共享给您的人脉，请联系共享人查看详情`);
      return;
    }
    // 如果是自己的人脉，正常跳转
    setLocation(`/parent/contacts/${contactId}`);
  };

  // 处理无限滚动
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // 当滚动到底部时，加载更多
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !isLoadingMore && !isFetching) {
      setIsLoadingMore(true);
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMore, isLoadingMore, isFetching]);

  // 监听滚动事件
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 渲染人脉列表
  const renderContactsList = () => {
    // 加载中状态
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      );
    }

    // 无人脉状态（只在确认获取到数据后显示）
    if (!isLoading && allContacts.length === 0 && totalContacts === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-8">
          该地区暂无人脉
        </p>
      );
    }

    return (
      <>
        <div className="space-y-2">
          {allContacts.map((contact: any) => (
            <div
              key={contact.id}
              onClick={() => handleContactClick(contact.id, contact.isShared, contact.sharerName)}
              className="w-full p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors cursor-pointer"
            >
              {/* 头部：名字 + 状态图标 */}
              <div className="flex items-center gap-2 mb-1">
                <div className="font-medium text-base">{contact.name}</div>
                {/* 推荐人状态 */}
                {contact.hasReferrer !== undefined && (
                  contact.hasReferrer ? (
                    <UserCheck className="h-4 w-4" style={{ color: contact.isShared ? '#9ca3af' : 'var(--color-primary)' }} />
                  ) : (
                    <UserX className="h-4 w-4 text-gray-400" />
                  )
                )}
                {/* 累计沟通次数 */}
                {contact.totalInteractions > 0 && (
                  <div className="flex items-center gap-0.5" style={{ color: contact.isShared ? '#9ca3af' : 'var(--color-primary)' }}>
                    <Smile className="h-4 w-4" />
                    <span className="text-xs font-medium">×{contact.totalInteractions}</span>
                  </div>
                )}
                {/* 直接推荐数 */}
                {contact.directReferrals > 0 && (
                  <div className="flex items-center gap-0.5" style={{ color: contact.isShared ? '#9ca3af' : 'var(--color-primary)' }}>
                    <Layers2 className="h-4 w-4" />
                    <span className="text-xs font-medium">×{contact.directReferrals}</span>
                  </div>
                )}
                {/* 间接推荐数 */}
                {contact.indirectReferrals > 0 && (
                  <div className="flex items-center gap-0.5" style={{ color: contact.isShared ? '#9ca3af' : 'var(--color-primary)' }}>
                    <Layers3 className="h-4 w-4" />
                    <span className="text-xs font-medium">×{contact.indirectReferrals}</span>
                  </div>
                )}
                {/* 共享标识 */}
                {contact.isShared && (
                  <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-primary)' }}>
                    <Handshake className="h-3 w-3" />
                    <span>{contact.sharerName}</span>
                  </div>
                )}
              </div>
              
              {/* 称谂 */}
              {contact.title && (
                <div className="text-sm text-muted-foreground mb-2">{contact.title}</div>
              )}
              
              {/* 联络状态 */}
              <div 
                className="text-xs pt-2 border-t border-gray-100 dark:border-gray-700 mb-2"
                style={{ color: getInteractionStatusColor(contact.daysSinceLastInteraction) }}
              >
                {contact.daysSinceLastInteraction !== null ? (
                  <div>距今 {contact.daysSinceLastInteraction} 天 · 距上次 {formatDate(contact.lastInteractionDate)}</div>
                ) : (
                  <div>从未联络</div>
                )}
              </div>
              
              {/* 标签显示 */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag: any) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: mapColorToTheme(tag.color || '#3b82f6'),
                        color: mapColorToTheme(tag.color || '#3b82f6'),
                      }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 加载更多指示器 */}
        {isFetching && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}

        {/* 已加载完成提示 */}
        {!hasMore && allContacts.length > 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">已加载全部 {totalContacts} 条人脉</p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </Button>
          <h1 className="font-semibold text-lg">区域分布</h1>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{totalStats} 人脉</span>
          <span>{activeProvinces} 省份</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* Map Area */}
        <div className={`
          relative bg-white w-full transition-all duration-300 ease-in-out
          ${isMobile ? 'h-[38vh] shrink-0 border-b border-gray-100' : 'flex-1 h-full'}
        `}>
          <ChinaMap
            data={provinceStats}
            onProvinceClick={handleProvinceClick}
            selectedProvince={selectedProvince}
          />
        </div>

        {/* Mobile Stats List */}
        {isMobile && (
          <div className="flex-1 bg-gray-50/30 overflow-y-auto relative">
            <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">省份统计</h2>
              <span className="text-xs text-gray-500">{activeProvinces} 个省份</span>
            </div>

            <div className="p-2 pt-2">
              <div className="grid grid-cols-6 gap-1.5">
                {provinceStats
                  .map((stat) => (
                    <button
                      key={stat.name}
                      onClick={() => handleProvinceClick(stat.name)}
                      className={`
                        aspect-square rounded-lg border transition-all duration-200
                        flex flex-col items-center justify-center gap-0.5 p-1
                        ${selectedProvince === stat.name
                          ? 'bg-primary text-primary-foreground border-primary shadow-md scale-105'
                          : stat.value > 0
                          ? 'bg-white border-gray-200 hover:border-primary hover:shadow-sm active:scale-95'
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                        }
                      `}
                    >
                      <span className={`
                        text-base font-bold leading-none
                        ${selectedProvince === stat.name ? 'text-primary-foreground' : 'text-primary'}
                      `}>
                        {stat.value}
                      </span>
                      <span className="text-[10px] leading-none">
                        {stat.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sidebar */}
        {!isMobile && selectedProvince && (
          <div className="w-80 bg-background border-l border-border overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {selectedProvince}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                共 {totalContacts} 位人脉
              </p>
            </div>

            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-4"
            >
              {renderContactsList()}
            </div>
          </div>
        )}

        {/* Mobile Drawer */}
        {isMobile && selectedProvince && (
          <Drawer open={isDrawerOpen} onOpenChange={handleDrawerOpenChange}>
            <DrawerContent className="h-[60vh]">
              <DrawerHeader>
                <DrawerTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  {selectedProvince}
                </DrawerTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  共 {totalContacts} 位人脉
                </p>
              </DrawerHeader>
              <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-4 pb-4"
              >
                {renderContactsList()}
              </div>
            </DrawerContent>
          </Drawer>
        )}
      </main>
    </div>
  );
}
