import { useLocation, useRoute } from 'wouter';
import { PageTag } from "@/components/PageTag";
import {
  ChevronLeft,
  Plus,
  ChevronRight,
  Edit,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { avatarSrc, ageToBucket, type AvatarKey } from '@/lib/yaban-avatar';

const ICON_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban/patient";

// 功能入口配置（精简为 4 个核心记录入口）- 使用COS图片
const FEATURE_ENTRIES = [
  { icon: `${ICON_BASE}/bingli_jilu.webp`, label: '诊疗记录', route: '' },
  { icon: `${ICON_BASE}/yingxiang_jilu.webp`, label: '影像记录', route: 'media' },
  { icon: `${ICON_BASE}/shoufei_jilu.webp`, label: '收费记录', route: 'charge' },
  { icon: `${ICON_BASE}/yuyue_jilu.webp`, label: '售前售后', route: '' },
];

export default function YabanPatientDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/yaban/patient/:id');
  const id = params?.id ? Number(params.id) : 0;

  const detailQuery = trpc.yabanCustomer.detail.useQuery(
    { id },
    { enabled: id > 0, refetchOnWindowFocus: false }
  );
  const row = detailQuery.data as any;

  const patient = {
    name: row?.name || '',
    age: row?.age ? Number(row.age) : 0,
    gender: row?.gender === '女' ? 'female' : 'male',
    avatar: '',
    medicalNo: row?.medical_no || '',
    avatarKey: ((row?.avatar as AvatarKey) || (`${row?.gender === '女' ? 'female' : 'male'}_${ageToBucket(row?.age ? Number(row.age) : 0)}` as AvatarKey)),
    source: [row?.source, row?.net_consultant, row?.consultant].filter(Boolean).join(' | ') || '—',
    clinic: '上海恒愿口腔门诊部',
    lastDoctor: row?.last_doctor || '—',
    lastVisit: row?.last_visit || '',
    remark: row?.remark || '—',
    mobile: row?.mobile || '—',
    address: row?.address || '—',
    history: row?.history || '',
    nickname: row?.nickname || '—',
    birthday: row?.birthday || '—',
    zodiac: row?.zodiac || '—',
    chineseZodiac: row?.chinese_zodiac || '—',
    email: row?.email || '—',
    emergencyContact: row?.emergency_contact || '—',
    emergencyRelation: row?.emergency_relation || '',
    emergencyPhone: row?.emergency_phone || '',
    tags: [row?.patient_type].filter(Boolean) as string[],
    hasWechat: false,
  };

  // 紧急联系人：姓名（关系）电话 拼接
  const emergencyText = (() => {
    if (!row?.emergency_contact) return '—';
    const rel = row?.emergency_relation ? `（${row.emergency_relation}）` : '';
    const phone = row?.emergency_phone ? ` ${row.emergency_phone}` : '';
    return `${row.emergency_contact}${rel}${phone}`;
  })();

  // 性别标签颜色
  const genderColor = patient.gender === 'male' ? 'bg-sky-500' : 'bg-pink-400';

  if (detailQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!row) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => navigate('/yaban/patients')} className="p-1">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-lg font-bold">顾客详情</span>
            <span className="w-6" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">未找到该顾客</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/yaban')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold">顾客详情</span>
          <button className="p-1">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 患者信息卡片 */}
      <div className="bg-white px-4 py-4">
        <div className="flex items-start">
          {/* 头像 */}
          <div className="w-16 h-16 rounded-full bg-[#F0F7FA] flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={avatarSrc(patient.avatarKey)} alt={patient.name} className="w-full h-full object-cover" />
          </div>

          {/* 信息区域 */}
          <div className="ml-3 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{patient.name}</span>
                {patient.age > 0 && <span className="text-gray-500">. {patient.age}岁</span>}
              </div>
              <button
                onClick={() => navigate(`/yaban/patient/${id}/edit`)}
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

            {/* 顾客编号（带复制） */}
            <div className="mt-1.5 text-[13px] text-gray-500">
              顾客编号: <span className="text-gray-700 font-medium">{patient.medicalNo}</span>
            </div>
          </div>
        </div>

        {/* 资料概览：将个人信息尽量铺出，其余完整字段在「编辑」中查看 */}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
          <InfoItem label="昵称" value={patient.nickname} />
          <InfoItem label="生日" value={patient.birthday} />
          <InfoItem label="星座" value={patient.zodiac} />
          <InfoItem label="生肖" value={patient.chineseZodiac} />
          <InfoItem label="手机" value={patient.mobile} />
          <InfoItem label="邮箱" value={patient.email} />
          <InfoItem label="紧急联系人" value={emergencyText} full />
          <InfoItem label="地址" value={patient.address} full />
        </div>

        {/* 诊所/跟进信息 */}
        <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
          <InfoItem label="来源" value={patient.source} full />
          <InfoItem label="门店" value={patient.clinic} full />
          <InfoItem label="上次就诊医生" value={patient.lastDoctor} />
          <InfoItem label="上次就诊" value={patient.lastVisit || '—'} />
          <InfoItem label="备注" value={patient.remark} full />
        </div>
      </div>

      {/* 下半部分：4 个核心记录入口（2×2 大按钮） */}
      <div className="bg-white mt-2 px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {FEATURE_ENTRIES.map((feat, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (feat.route === 'media') {
                  navigate(`/yaban/patient/${id}/media`);
                } else if (feat.route === 'charge') {
                  navigate(`/yaban/patient/${id}/charge`);
                } else if (feat.route) {
                  navigate(feat.route);
                }
              }}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 active:bg-gray-100"
            >
              <img src={feat.icon} alt={feat.label} className="w-10 h-10 object-contain flex-shrink-0" />
              <span className="text-[15px] font-medium text-gray-800">{feat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <PageTag code="P321" />
    </div>
  );
}

// 资料概览小项：标签 + 值，full 为整行显示
function InfoItem({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-gray-400">{label}：</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}
