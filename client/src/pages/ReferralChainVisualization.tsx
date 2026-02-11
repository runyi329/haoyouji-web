import { useState, useMemo, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, Loader2 } from 'lucide-react';
import * as echarts from 'echarts';

interface ReferralNode {
  id: number;
  name: string;
  title?: string;
  children?: ReferralNode[];
  level: number;
  directReferrals: number;
  indirectReferrals: number;
}

export default function ReferralChainVisualization() {
  const [, params] = useRoute("/parent/contacts/:contactId/referral-chain");
  const [, setLocation] = useLocation();
  const contactId = params?.contactId ? parseInt(params.contactId) : 0;
  
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const { data: chainData, isLoading } = trpc.contacts.getReferralChain.useQuery(
    { contactId },
    { enabled: contactId > 0 }
  );

  // 将链路数据转换为 ECharts 树状图格式
  const chartData = useMemo(() => {
    if (!chainData) return null;

    const convertNode = (node: ReferralNode): any => ({
      name: node.name,
      value: `${node.title || ''}`,
      children: node.children?.map(convertNode) || [],
      itemStyle: {
        color: '#3b82f6', // 蓝色
      },
      label: {
        show: true,
        position: 'top',
        fontSize: 12,
      },
    });

    return {
      name: chainData.name,
      children: chainData.children?.map(convertNode) || [],
    };
  }, [chainData]);

  // 初始化 ECharts
  useEffect(() => {
    if (!chartRef.current || !chartData) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const option = {
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
      },
      series: [
        {
          type: 'tree',
          data: [chartData],
          top: '5%',
          left: '7%',
          bottom: '5%',
          right: '7%',
          symbolSize: [90, 60],
          label: {
            position: 'inside',
            verticalAlign: 'middle',
            align: 'center',
            fontSize: 12,
            color: '#000',
          },
          leaves: {
            label: {
              position: 'bottom',
            },
          },
          expandAndCollapse: true,
          animationDuration: 550,
          animationDurationUpdate: 750,
        },
      ],
    };

    if (chartInstance.current) {
      chartInstance.current.setOption(option);
    }

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chartData]);

  // 清理 ECharts 实例
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  const handleBack = () => {
    setLocation('/');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!chainData) {
    return (
      <div className="p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <Card className="p-6 text-center">
          <p className="text-gray-500">暂无推荐链路数据</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 顶部导航 */}
      <div className="p-4 border-b border-gray-200">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="mb-2"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <h1 className="text-xl font-bold">{chainData.name} 的推荐链路</h1>
        <p className="text-sm text-gray-500 mt-1">
          直接推荐: {chainData.directReferrals} 人 | 间接推荐: {chainData.indirectReferrals} 人
        </p>
      </div>

      {/* 树状图容器 */}
      <div
        ref={chartRef}
        className="flex-1 min-h-0"
        style={{ width: '100%', height: '100%' }}
      />

      {/* 图例说明 */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-sm text-gray-600">
          <p className="mb-2">📊 推荐链路说明：</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>蓝色节点表示推荐关系中的人脉</li>
            <li>点击节点可展开/收起子推荐</li>
            <li>树状结构展示了完整的推荐层级</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
