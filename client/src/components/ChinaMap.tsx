import React, { useEffect, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { useMediaQuery } from '@/hooks/use-media-query';

// ProvinceStats interface
interface ProvinceStats {
  name: string;
  value: number;
}

interface ChinaMapProps {
  data: ProvinceStats[];
  onProvinceClick: (provinceName: string) => void;
  selectedProvince: string | null;
}

// 省份简称映射（长名字 -> 短名字）
const provinceShortNames: Record<string, string> = {
  '北京市': '北京', '天津市': '天津', '上海市': '上海', '重庆市': '重庆',
  '河北省': '河北', '山西省': '山西', '辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江',
  '江苏省': '江苏', '浙江省': '浙江', '安徽省': '安徽', '福建省': '福建', '江西省': '江西', '山东省': '山东',
  '河南省': '河南', '湖北省': '湖北', '湖南省': '湖南', '广东省': '广东', '海南省': '海南',
  '四川省': '四川', '贵州省': '贵州', '云南省': '云南', '陕西省': '陕西', '甘肃省': '甘肃', '青海省': '青海',
  '内蒙古自治区': '内蒙', '广西壮族自治区': '广西', '西藏自治区': '西藏', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
  '台湾省': '台湾', '香港特别行政区': '香港', '澳门特别行政区': '澳门'
};

// 反向映射（短名字 -> 长名字），用于将后端数据转换为地图数据
const provinceFullNames: Record<string, string> = {
  '北京': '北京市', '天津': '天津市', '上海': '上海市', '重庆': '重庆市',
  '河北': '河北省', '山西': '山西省', '辽宁': '辽宁省', '吉林': '吉林省', '黑龙江': '黑龙江省',
  '江苏': '江苏省', '浙江': '浙江省', '安徽': '安徽省', '福建': '福建省', '江西': '江西省', '山东': '山东省',
  '河南': '河南省', '湖北': '湖北省', '湖南': '湖南省', '广东': '广东省', '海南': '海南省',
  '四川': '四川省', '贵州': '贵州省', '云南': '云南省', '陕西': '陕西省', '甘肃': '甘肃省', '青海': '青海省',
  '内蒙古': '内蒙古自治区', '广西': '广西壮族自治区', '西藏': '西藏自治区', '宁夏': '宁夏回族自治区', '新疆': '新疆维吾尔自治区',
  '台湾': '台湾省', '香港': '香港特别行政区', '澳门': '澳门特别行政区'
};

// 标签位置人工微调（经纬度偏移量）
// 针对拥挤区域（京津冀、长三角、珠三角）进行手动偏移
const labelOffsets: Record<string, [number, number]> = {
  '北京市': [-0.5, 0.8],   // 向西北移
  '天津市': [0.8, -0.2],   // 向东南移
  '河北省': [-0.5, -0.5],  // 向西南移
  '上海市': [1.2, 0.2],    // 向东移入海
  '江苏省': [0, 0.5],      // 略微北移
  '浙江省': [0, -0.5],     // 略微南移
  '安徽省': [-0.5, 0],     // 略微西移
  '香港特别行政区': [1.5, -0.5], // 向东南移入海
  '澳门特别行政区': [-1.5, -0.5], // 向西南移入海
  '广东省': [0, 0.5],      // 略微北移
  '重庆市': [0.5, 0.5],    // 略微东北移，避开四川
  '宁夏回族自治区': [0, 0.5] // 略微北移
};

const ChinaMap: React.FC<ChinaMapProps> = ({ data, onProvinceClick, selectedProvince }) => {
  const [geoJson, setGeoJson] = useState<any>(null);
  const chartRef = useRef<ReactECharts>(null);
  const isMobile = !useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    // 加载地图数据
    fetch('/china.json')
      .then(response => response.json())
      .then(data => {
        // 应用人工微调的坐标偏移
        const adjustedGeoJson = JSON.parse(JSON.stringify(data));
        adjustedGeoJson.features.forEach((feature: any) => {
          const name = feature.properties.name;
          if (labelOffsets[name] && feature.properties.cp) {
            feature.properties.cp = [
              feature.properties.cp[0] + labelOffsets[name][0],
              feature.properties.cp[1] + labelOffsets[name][1]
            ];
          }
        });

        echarts.registerMap('china', adjustedGeoJson);
        setGeoJson(adjustedGeoJson);
      })
      .catch(error => console.error('Error loading map data:', error));
  }, []);

  // 处理点击事件
  const onChartClick = (params: any) => {
    if (params.componentType === 'series') {
      // 将长名字转换为短名字，因为后端查询需要短名字
      const shortName = provinceShortNames[params.name] || params.name;
      onProvinceClick(shortName);
    }
  };

  const getOption = () => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const value = params.value || 0;
          return `${params.name}<br/>好友人数: ${value}`;
        },
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: '#e4e4e7',
        textStyle: {
          color: '#18181b',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14
        },
        padding: [12, 16],
        extraCssText: 'box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1); border-radius: 12px;'
      },
      geo: {
        map: 'china',
        roam: !isMobile,
        zoom: 1.2,
        scaleLimit: {
          min: 1,
          max: 5
        },
        label: {
          show: !isMobile,
          color: '#64748b',
          fontSize: 10,
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 14,
          formatter: (params: any) => {
            if (!params.value || isNaN(params.value)) return '';
            const shortName = provinceShortNames[params.name] || params.name;
            return `{name|${shortName}}\n{count|${params.value}}`;
          },
          rich: {
            name: {
              color: '#64748b',
              fontSize: 10,
              align: 'center',
              padding: [0, 0, 2, 0]
            },
            count: {
              color: 'var(--color-primary)',
              fontSize: 11,
              fontWeight: 'bold',
              align: 'center'
            }
          }
        },
        itemStyle: {
          areaColor: '#fafafa',
          borderColor: '#e4e4e7',
          borderWidth: 0.5
        },
        emphasis: {
          label: {
            show: !isMobile
          },
          itemStyle: {
            areaColor: 'color-mix(in srgb, var(--color-primary) 30%, white)',
            borderColor: 'color-mix(in srgb, var(--color-primary) 60%, white)',
            borderWidth: 1
          }
        },
        select: {
          label: {
            show: true,
            color: '#fff'
          },
          itemStyle: {
            areaColor: 'var(--color-primary)',
            borderColor: 'var(--color-primary)',
            borderWidth: 1
          }
        }
      },
      visualMap: {
        show: true,
        type: 'piecewise', // 分段式图例
        left: 'left',
        bottom: 'bottom',
        orient: 'vertical',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 5,
        textStyle: {
          color: '#64748b',
          fontSize: 10
        },
        pieces: [
          { min: 10, label: '10+ 人', color: 'var(--color-primary)' },
          { min: 5, max: 9, label: '5-9 人', color: 'color-mix(in srgb, var(--color-primary) 60%, white)' },
          { min: 1, max: 4, label: '1-4 人', color: 'color-mix(in srgb, var(--color-primary) 30%, white)' },
          { value: 0, label: '0 人', color: '#f4f4f5' }
        ],
        seriesIndex: 0 // 仅作用于第一个系列（地图）
      },
      series: [
        {
          name: '好友分布',
          type: 'map',
          geoIndex: 0, // 关联到 geo 组件
          data: data
            .filter(item => item.name !== '海外' && item.name !== '其他') // 过滤掉海外和其他
            .map(item => ({
              name: provinceFullNames[item.name] || item.name, // 将短名字转换为长名字
              value: item.value
            }))
        },
        // 添加波纹特效系列
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          rippleEffect: {
            brushType: 'stroke',
            scale: 4,
            period: 2
          },
          symbolSize: 10,
          itemStyle: {
            color: 'var(--color-primary)',
            shadowBlur: 10,
            shadowColor: 'var(--color-primary)'
          },
          zlevel: 1,
          data: selectedProvince ? data.filter(item => item.name === selectedProvince).map(item => {
            // 从geoJson中获取中心点
            const feature = geoJson.features.find((f: any) => f.properties.name === item.name);
            return {
              name: item.name,
              value: feature ? [...feature.properties.cp, item.value] : [0, 0, item.value]
            };
          }) : []
        }
      ]
    };
  };

  if (!geoJson) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground font-sans text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactECharts
        ref={chartRef}
        option={getOption()}
        style={{ height: '100%', width: '100%' }}
        onEvents={{
          click: onChartClick
        }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
};

export default ChinaMap;
