import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ChevronLeft,
  Plus,
  ChevronRight,
  MessageSquare,
  Phone,
  Mail,
  Edit,
} from 'lucide-react';

const ICON_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban/patient";

// 模拟患者数据
const MOCK_PATIENT = {
  id: '1',
  name: '王榕涛',
  age: 26,
  gender: 'male',
  avatar: '',
  medicalNo: '007754',
  source: '他人介绍 | 员工介绍 | 洪紫钥',
  clinic: '上海恒愿口腔门诊部',
  lastDoctor: '郑奎',
  lastVisit: '2026-06-09 17:00',
  remark: '治疗8折',
  tags: ['电', '门', 'B1'],
  hasWechat: true,
};

// 功能入口配置 - 使用COS图片
const FEATURE_ENTRIES = [
  { icon: `${ICON_BASE}/xiangxi_ziliao.webp`, label: '详细资料', route: '' },
  { icon: `${ICON_BASE}/huiyuan_xinxi.webp`, label: '会员信息', route: '' },
  { icon: `${ICON_BASE}/yuyue_jilu.webp`, label: '预约记录', route: '' },
  { icon: `${ICON_BASE}/suifang_jilu.webp`, label: '随访记录', route: '' },
  { icon: `${ICON_BASE}/bingli_jilu.webp`, label: '病历记录', route: '' },
  { icon: `${ICON_BASE}/yingxiang_jilu.webp`, label: '影像记录', route: '' },
  { icon: `${ICON_BASE}/shoufei_jilu.webp`, label: '收费记录', route: '' },
  { icon: `${ICON_BASE}/qinyou_guanxi.webp`, label: '亲友关系', route: '' },
  { icon: `${ICON_BASE}/zixun_jilu.webp`, label: '咨询记录', route: '' },
  { icon: `${ICON_BASE}/huifang_jilu.webp`, label: '回访记录', route: '' },
  { icon: `${ICON_BASE}/wendang_jilu.webp`, label: '文档记录', route: '' },
  { icon: `${ICON_BASE}/jiancha.webp`, label: '检查', route: '' },
];

export default function YabanPatientDetail() {
  const [, navigate] = useLocation();
  const patient = MOCK_PATIENT;

  // 性别标签颜色
  const genderColor = patient.gender === 'male' ? 'bg-sky-500' : 'bg-pink-400';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/yaban')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold">患者详情</span>
          <button className="p-1">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 患者信息卡片 */}
      <div className="bg-white px-4 py-4">
        <div className="flex items-start">
          {/* 头像 */}
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {patient.avatar ? (
              <img src={patient.avatar} alt={patient.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl text-gray-400">{patient.name[0]}</span>
            )}
          </div>

          {/* 信息区域 */}
          <div className="ml-3 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{patient.name}</span>
                <span className="text-gray-500">. {patient.age}岁</span>
              </div>
              <button
                onClick={() => {}}
                className="flex items-center text-sky-500 text-sm"
              >
                <Edit className="w-4 h-4 mr-0.5" />
                编辑
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 标签 */}
            <div className="flex items-center gap-1 mt-1">
              <span className={`w-5 h-5 rounded-full ${genderColor} flex items-center justify-center`}>
                <span className="text-white text-[10px]">
                  {patient.gender === 'male' ? 'M' : 'F'}
                </span>
              </span>
              {patient.hasWechat && (
                <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-[10px]">W</span>
                </span>
              )}
              {patient.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-sky-500"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* 详细信息 */}
            <div className="mt-2 space-y-1 text-[13px] text-gray-500">
              <div>
                病历号: <span className="text-gray-700 font-medium">{patient.medicalNo}</span>
                <span className="ml-2 text-sky-500 text-[12px]">复制</span>
              </div>
              <div>来源: {patient.source}</div>
              <div>门店: {patient.clinic}</div>
              <div>上次就诊医生: {patient.lastDoctor}</div>
              <div>备注: {patient.remark}</div>
            </div>

            {/* 快捷标签按钮 */}
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-1 rounded text-[11px] font-bold text-white bg-green-500">
                医生微信
              </span>
              <span className="px-2 py-1 rounded text-[11px] font-bold text-white bg-sky-500">
                门诊微信
              </span>
              <span className="px-2 py-1 rounded text-[11px] font-bold text-white bg-amber-500">
                B1
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 功能入口网格 */}
      <div className="bg-white mt-2 px-4 py-4">
        <div className="grid grid-cols-4 gap-y-5">
          {FEATURE_ENTRIES.map((feat, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (feat.route) {
                  navigate(feat.route);
                }
              }}
              className="flex flex-col items-center gap-1.5"
            >
              <img src={feat.icon} alt={feat.label} className="w-12 h-12 object-contain" />
              <span className="text-[12px] text-gray-700">{feat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="mt-auto bg-white border-t border-gray-100 px-4 py-3">
        <div className="flex items-center justify-around">
          <button className="flex items-center gap-1 text-gray-600 text-[13px]">
            <MessageSquare className="w-5 h-5 text-sky-500" />
            发微信
          </button>
          <button className="flex items-center gap-1 text-gray-600 text-[13px]">
            <Mail className="w-5 h-5 text-sky-500" />
            发短信
          </button>
          <button className="flex items-center gap-1 text-gray-600 text-[13px]">
            <Phone className="w-5 h-5 text-sky-500" />
            打电话
          </button>
        </div>
      </div>
    </div>
  );
}
