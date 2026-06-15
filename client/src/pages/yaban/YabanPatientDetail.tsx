import { useLocation, useRoute } from 'wouter';
import { PageTag } from "@/components/PageTag";
import {
  ChevronLeft,
  Edit,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { avatarSrc, avatarBg, ageToBucket, type AvatarKey } from '@/lib/yaban-avatar';

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
    source: row?.source || '—',
    netConsultant: row?.net_consultant || '',
    consultant: row?.consultant || '',
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

  // AI健康标签：history 存为 "名称|名称##备注"，取名称部分显示
  const healthTags = (() => {
    const raw = (row?.history || '').toString();
    if (!raw) return '';
    const names = raw.split('##')[0] || '';
    return names.replace(/\|/g, '、').trim();
  })();

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
          <button
            onClick={() => navigate(`/yaban/patient/${id}/edit`)}
            className="p-1 text-white"
            aria-label="编辑"
          >
            <Edit className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 顾客信息卡片（统一电子档案表：照片为表内跨行单元格，所有字段均在表中） */}
      <div className="bg-white px-4 py-4">
        <div className="flex border-t border-l border-gray-200 rounded-md overflow-hidden">
          {/* 左侧：字段格子自适应横排 */}
          <div className="flex-1 min-w-0 flex flex-wrap content-start">
            <InfoItem label="姓名" value={patient.name || '—'} />
            <InfoItem label="性别" value={patient.gender === 'male' ? '男' : '女'} />
            <InfoItem label="年龄" value={patient.age > 0 ? `${patient.age}岁` : '—'} />
            <InfoItem label="顾客类型" value={patient.tags.join('、') || '—'} />
            <InfoItem label="顾客编号" value={patient.medicalNo || '—'} wide />
            <InfoItem label="手机" value={patient.mobile} wide />
          </div>
          {/* 右上角：照片单元格（方格渐变底 + 居中圆形头像） */}
          <div
            className="w-[96px] aspect-square self-start border-r border-b border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${avatarBg(patient.avatarKey)} 0%, ${avatarBg(patient.avatarKey)}99 100%)` }}
          >
            <img
              src={avatarSrc(patient.avatarKey)}
              alt={patient.name}
              className="w-[78px] h-[78px] rounded-full object-cover bg-white/30"
            />
          </div>
        </div>

        {/* 资料档案表（续）：线框网格，字段自适应横排 */}
        <div className="flex flex-wrap border-l border-gray-200 overflow-hidden">
          <InfoItem label="昵称" value={patient.nickname} />
          <InfoItem label="生日" value={patient.birthday} />
          <InfoItem label="星座" value={patient.zodiac} />
          <InfoItem label="生肖" value={patient.chineseZodiac} />
          <InfoItem label="邮箱" value={patient.email} wide />
          <InfoItem label="紧急联系人" value={emergencyText} wide />
          <InfoItem label="地址" value={patient.address} full />
          <InfoItem label="来源" value={patient.source} />
          {patient.netConsultant && <InfoItem label="网电咨询师" value={patient.netConsultant} />}
          {patient.consultant && <InfoItem label="咨询师" value={patient.consultant} />}
          <InfoItem label="上次就诊医生" value={patient.lastDoctor} />
          <InfoItem label="上次就诊" value={patient.lastVisit || '—'} />
          <InfoItem label="门店" value={patient.clinic} full />
          {healthTags && <InfoItem label="健康标签" value={healthTags} full />}
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

// 资料档案格子：带右/下边框，label 在上、value 在下
// full=整行；wide=约半行；默认窄格随内容自适应横排
function InfoItem({ label, value, full, wide }: { label: string; value: string; full?: boolean; wide?: boolean }) {
  const basis = full ? 'w-full' : wide ? 'basis-[48%] grow' : 'grow basis-[30%]';
  return (
    <div className={`${basis} min-w-0 border-r border-b border-gray-200 px-2.5 py-1.5`}>
      <div className="text-[11px] text-gray-400 leading-tight">{label}</div>
      <div className="text-[13px] text-gray-700 leading-snug break-words">{value}</div>
    </div>
  );
}
