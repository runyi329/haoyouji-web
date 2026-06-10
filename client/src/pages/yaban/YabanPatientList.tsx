/**
 * 牙伴齿科管理 - 患者列表页
 * 路由：/yaban/patients
 * 搜索 + 筛选 + 患者卡片列表，点击卡片跳转患者详情页
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, Search, Filter } from "lucide-react";
import { toast } from "sonner";

// 患者标签类型及配色（参考图2样式）
type TagType = "female" | "male" | "phone" | "visit" | "door" | "old" | "new" | "vip";

interface TagConfig {
  label: string;
  bg: string;
  text: string;
}

const TAG_CONFIG: Record<TagType, TagConfig> = {
  female: { label: "\u2640", bg: "#F97316", text: "#FFFFFF" },
  male: { label: "\u2642", bg: "#0EA5E9", text: "#FFFFFF" },
  phone: { label: "\u7535", bg: "#0EA5E9", text: "#FFFFFF" },
  visit: { label: "\u4E34", bg: "#F97316", text: "#FFFFFF" },
  door: { label: "\u95E8", bg: "#F97316", text: "#FFFFFF" },
  old: { label: "\u8001", bg: "#0EA5E9", text: "#FFFFFF" },
  new: { label: "D", bg: "#6B7280", text: "#FFFFFF" },
  vip: { label: "V", bg: "#D97706", text: "#FFFFFF" },
};

// 模拟患者数据
interface Patient {
  id: number;
  name: string;
  nickname?: string;
  age: number;
  gender: "female" | "male";
  tags: TagType[];
  recordNo: string;
  source: string;
  lastVisit: string;
  lastDoctor: string;
  avatar: string;
}

const MOCK_PATIENTS: Patient[] = [
  {
    id: 1,
    name: "\u80E1\u4EEA\u7480",
    age: 27,
    gender: "female",
    tags: ["female", "phone", "door", "new"],
    recordNo: "017967",
    source: "\u4E0A\u95E8\u5BA2 | \u9644\u8FD1\u5DE5\u4F5C",
    lastVisit: "2026-06-10 15:45",
    lastDoctor: "",
    avatar: "",
  },
  {
    id: 2,
    name: "\u8D75\u5973\u58EB",
    nickname: "\u738B\u536B\u4E1C\u7684\u8001\u5A46",
    age: 0,
    gender: "female",
    tags: ["female", "visit", "door"],
    recordNo: "L010116902",
    source: "\u4ED6\u4EBA\u4ECB\u7ECD | \u670B\u53CB\u4ECB\u7ECD | \u738B\u536B\u4E1C",
    lastVisit: "",
    lastDoctor: "",
    avatar: "",
  },
  {
    id: 3,
    name: "\u5468\u52C7",
    age: 66,
    gender: "male",
    tags: ["male", "old", "phone"],
    recordNo: "017966",
    source: "\u4ED6\u4EBA\u4ECB\u7ECD | \u670B\u53CB\u4ECB\u7ECD",
    lastVisit: "2026-06-10 13:00",
    lastDoctor: "",
    avatar: "",
  },
  {
    id: 4,
    name: "\u5B59\u6CF3\u6770",
    age: 27,
    gender: "male",
    tags: ["male", "phone"],
    recordNo: "017964",
    source: "\u4ED6\u4EBA\u4ECB\u7ECD | \u5458\u5DE5\u4ECB\u7ECD | \u9C81\u6BC5",
    lastVisit: "2026-06-09 10:15",
    lastDoctor: "\u9C81\u6BC5",
    avatar: "",
  },
  {
    id: 5,
    name: "\u738B\u5EFA\u56FD",
    age: 55,
    gender: "male",
    tags: ["male", "phone", "old"],
    recordNo: "017960",
    source: "\u4ED6\u4EBA\u4ECB\u7ECD | \u670B\u53CB\u4ECB\u7ECD",
    lastVisit: "2026-06-08 09:30",
    lastDoctor: "\u674E\u660E",
    avatar: "",
  },
  {
    id: 6,
    name: "\u5218\u82B3",
    age: 34,
    gender: "female",
    tags: ["female", "phone", "door", "vip"],
    recordNo: "017955",
    source: "\u7F51\u7EDC\u9884\u7EA6 | \u7F8E\u56E2",
    lastVisit: "2026-06-07 14:20",
    lastDoctor: "\u5F20\u4F1F",
    avatar: "",
  },
];

// 筛选选项
const FILTER_OPTIONS = [
  { id: "all", label: "\u5168\u90E8\u60A3\u8005" },
  { id: "today", label: "\u4ECA\u65E5\u5C31\u8BCA" },
  { id: "week", label: "\u672C\u5468\u5C31\u8BCA" },
  { id: "new", label: "\u65B0\u60A3\u8005" },
  { id: "vip", label: "VIP\u60A3\u8005" },
];

// 头像组件 - 参考图2的戴口罩头像样式
function PatientAvatar({ gender }: { gender: "female" | "male" }) {
  const skinColor = gender === "female" ? "#FDDCBD" : "#E8D5C4";
  const hairColor = gender === "female" ? "#4A3728" : "#3D3D3D";
  const maskColor = "#B2E0F0";
  const maskStrap = "#8ECFE0";

  return (
    <div className="w-[56px] h-[56px] rounded-full bg-[#F0F7FA] flex items-center justify-center flex-shrink-0 overflow-hidden">
      <svg viewBox="0 0 56 56" className="w-full h-full">
        {/* 头发 */}
        {gender === "female" ? (
          <>
            <ellipse cx="28" cy="20" rx="13" ry="14" fill={hairColor} />
            <ellipse cx="28" cy="22" rx="10" ry="11" fill={skinColor} />
            {/* 刘海 */}
            <path d="M18 18 Q22 10 28 12 Q34 10 38 18 Q36 14 28 15 Q20 14 18 18Z" fill={hairColor} />
          </>
        ) : (
          <>
            <ellipse cx="28" cy="20" rx="12" ry="13" fill={hairColor} />
            <ellipse cx="28" cy="22" rx="10" ry="11" fill={skinColor} />
            <rect x="17" y="12" width="22" height="8" rx="4" fill={hairColor} />
          </>
        )}
        {/* 口罩 */}
        <rect x="19" y="24" width="18" height="10" rx="4" fill={maskColor} />
        <line x1="19" y1="28" x2="14" y2="24" stroke={maskStrap} strokeWidth="1.2" />
        <line x1="37" y1="28" x2="42" y2="24" stroke={maskStrap} strokeWidth="1.2" />
        {/* 口罩褶皱 */}
        <line x1="22" y1="27" x2="34" y2="27" stroke={maskStrap} strokeWidth="0.5" opacity="0.6" />
        <line x1="22" y1="29.5" x2="34" y2="29.5" stroke={maskStrap} strokeWidth="0.5" opacity="0.6" />
        <line x1="22" y1="32" x2="34" y2="32" stroke={maskStrap} strokeWidth="0.5" opacity="0.6" />
        {/* 眼睛 */}
        <circle cx="24" cy="21" r="1.2" fill="#333" />
        <circle cx="32" cy="21" r="1.2" fill="#333" />
        {/* 身体 */}
        <ellipse cx="28" cy="50" rx="14" ry="12" fill={maskColor} />
      </svg>
    </div>
  );
}

export default function YabanPatientList() {
  const [, setLocation] = useLocation();
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const handleBack = () => {
    setLocation("/yaban");
  };

  const handleCopyRecordNo = (e: React.MouseEvent, recordNo: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(recordNo);
    toast.success("\u75C5\u5386\u53F7\u5DF2\u590D\u5236");
  };

  const handlePatientClick = (patientId: number) => {
    setLocation(`/yaban/patient/${patientId}`);
  };

  // 搜索过滤
  const filteredPatients = MOCK_PATIENTS.filter((p) => {
    if (!searchText) return true;
    return (
      p.name.includes(searchText) ||
      p.recordNo.includes(searchText) ||
      (p.nickname && p.nickname.includes(searchText))
    );
  });

  const currentFilterLabel =
    FILTER_OPTIONS.find((f) => f.id === activeFilter)?.label || "\u5168\u90E8\u60A3\u8005";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-[48px]">
          <button onClick={handleBack} className="p-1 -ml-1">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-[17px] font-bold text-gray-900">
            {"\u60A3\u8005"}
          </h1>
          <button
            onClick={() => toast.info("\u65B0\u589E\u60A3\u8005\u529F\u80FD\u5F00\u53D1\u4E2D")}
            className="p-1 -mr-1"
          >
            <Plus className="w-6 h-6 text-sky-500" />
          </button>
        </div>
      </div>

      {/* 搜索栏 + 筛选 */}
      <div className="sticky top-[48px] z-40 bg-white px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {/* 搜索输入框 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={"\u8F93\u5165\u60A3\u8005\u540D\u5B57\u3001\u624B\u673A\u53F7"}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 placeholder-gray-400 outline-none border border-gray-200 focus:border-sky-300 focus:ring-1 focus:ring-sky-100"
            />
          </div>
          {/* 筛选按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-0.5 text-sm whitespace-nowrap"
            >
              <span className="text-sky-600 font-medium">{currentFilterLabel}</span>
              <span className="text-sky-600">{"\u25BC"}</span>
              <span className="text-gray-300 mx-0.5">|</span>
              <Filter className="w-3.5 h-3.5 text-sky-600" />
              <span className="text-sky-600 font-medium">{"\u7B5B\u9009"}</span>
            </button>
            {/* 筛选下拉 */}
            {showFilterDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[120px] z-50">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setActiveFilter(option.id);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm ${
                      activeFilter === option.id
                        ? "text-sky-600 bg-sky-50 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 患者列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm">{"\u672A\u627E\u5230\u5339\u914D\u7684\u60A3\u8005"}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredPatients.map((patient) => (
              <div
                key={patient.id}
                className="bg-white px-4 py-3.5 active:bg-gray-50 transition-colors"
              >
                {/* 点击区域：头像 + 信息 */}
                <div
                  className="flex gap-3 cursor-pointer"
                  onClick={() => handlePatientClick(patient.id)}
                >
                  {/* 头像 */}
                  <PatientAvatar gender={patient.gender} />

                  {/* 信息区 */}
                  <div className="flex-1 min-w-0">
                    {/* 姓名 + 年龄 */}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-[16px] font-bold text-gray-900 leading-tight">
                        {patient.name}
                      </span>
                      {patient.nickname && (
                        <span className="text-[13px] text-gray-500">
                          ({patient.nickname})
                        </span>
                      )}
                      {patient.age > 0 && (
                        <>
                          <span className="text-gray-300 text-sm">{"\u00B7"}</span>
                          <span className="text-[16px] font-bold text-gray-900">
                            {patient.age}{"\u5C81"}
                          </span>
                        </>
                      )}
                    </div>

                    {/* 标签 */}
                    <div className="flex items-center gap-1 mb-2">
                      {patient.tags.map((tag, idx) => {
                        const config = TAG_CONFIG[tag];
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-[4px] text-[11px] font-bold"
                            style={{
                              backgroundColor: config.bg,
                              color: config.text,
                            }}
                          >
                            {config.label}
                          </span>
                        );
                      })}
                    </div>

                    {/* 病历号 */}
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] text-gray-600">
                        {"\u75C5\u5386\u53F7\uFF1A"}{patient.recordNo}
                      </span>
                      <button
                        onClick={(e) => handleCopyRecordNo(e, patient.recordNo)}
                        className="text-[12px] text-gray-400 border-b border-gray-300 leading-tight"
                      >
                        {"\u590D\u5236"}
                      </button>
                    </div>

                    {/* 来源 */}
                    <p className="text-[13px] text-gray-500 mb-0.5 leading-relaxed">
                      {"\u6765\u6E90\uFF1A"}{patient.source}
                    </p>

                    {/* 上次就诊医生 */}
                    {patient.lastDoctor && (
                      <p className="text-[13px] text-gray-500 mb-0.5">
                        {"\u4E0A\u6B21\u5C31\u8BCA\u533B\u751F\uFF1A"}{patient.lastDoctor}
                      </p>
                    )}

                    {/* 上次就诊时间 */}
                    {patient.lastVisit && (
                      <p className="text-[13px] text-gray-500">
                        {"\u4E0A\u6B21\u5C31\u8BCA\u65F6\u95F4\uFF1A"}{patient.lastVisit}
                      </p>
                    )}
                  </div>
                </div>

                {/* 底部操作按钮 */}
                <div className="flex items-center gap-3 mt-3 ml-[68px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("\u9884\u7EA6\u529F\u80FD\u5F00\u53D1\u4E2D");
                    }}
                    className="flex-1 py-[7px] border border-gray-200 rounded-full text-[13px] text-gray-700 font-medium text-center active:bg-gray-50"
                  >
                    {"\u9884\u7EA6"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("\u6302\u53F7\u529F\u80FD\u5F00\u53D1\u4E2D");
                    }}
                    className="flex-1 py-[7px] border border-gray-200 rounded-full text-[13px] text-gray-700 font-medium text-center active:bg-gray-50"
                  >
                    {"\u6302\u53F7"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("\u6536\u8D39\u529F\u80FD\u5F00\u53D1\u4E2D");
                    }}
                    className="flex-1 py-[7px] border border-gray-200 rounded-full text-[13px] text-gray-700 font-medium text-center active:bg-gray-50"
                  >
                    {"\u6536\u8D39"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 点击筛选下拉外部关闭 */}
      {showFilterDropdown && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowFilterDropdown(false)}
        />
      )}
    </div>
  );
}
