/**
 * 牙伴齿科管理 - 患者列表页
 * 路由：/yaban/patients
 * 搜索 + 筛选 + 患者卡片列表，点击卡片跳转患者详情页
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, Search, Filter, Phone, Copy } from "lucide-react";
import { toast } from "sonner";

// 患者标签类型
type TagType = "female" | "male" | "phone" | "visit" | "door" | "old" | "new" | "vip";

const TAG_CONFIG: Record<TagType, { label: string; bg: string; text: string }> = {
  female: { label: "\u2640", bg: "bg-orange-400", text: "text-white" },
  male: { label: "\u2642", bg: "bg-sky-400", text: "text-white" },
  phone: { label: "\u7535", bg: "bg-sky-400", text: "text-white" },
  visit: { label: "\u4e34", bg: "bg-orange-400", text: "text-white" },
  door: { label: "\u95e8", bg: "bg-orange-400", text: "text-white" },
  old: { label: "\u8001", bg: "bg-sky-400", text: "text-white" },
  new: { label: "D", bg: "bg-gray-500", text: "text-white" },
  vip: { label: "V", bg: "bg-amber-500", text: "text-white" },
};

// 模拟患者数据
const MOCK_PATIENTS = [
  {
    id: 1,
    name: "\u80e1\u4eea\u7480",
    age: 27,
    gender: "female" as const,
    tags: ["female", "phone", "door", "new"] as TagType[],
    recordNo: "017967",
    source: "\u4e0a\u95e8\u5ba2 | \u9644\u8fd1\u5de5\u4f5c",
    lastVisit: "2026-06-10 15:45",
    lastDoctor: "",
    avatar: "",
  },
  {
    id: 2,
    name: "\u8d75\u5973\u58eb",
    nickname: "\u738b\u536b\u4e1c\u7684\u8001\u5a46",
    age: 0,
    gender: "female" as const,
    tags: ["female", "visit", "door"] as TagType[],
    recordNo: "L010116902",
    source: "\u4ed6\u4eba\u4ecb\u7ecd | \u670b\u53cb\u4ecb\u7ecd | \u738b\u536b\u4e1c",
    lastVisit: "",
    lastDoctor: "",
    avatar: "",
  },
  {
    id: 3,
    name: "\u5468\u52c7",
    age: 66,
    gender: "male" as const,
    tags: ["male", "old", "phone"] as TagType[],
    recordNo: "017966",
    source: "\u4ed6\u4eba\u4ecb\u7ecd | \u670b\u53cb\u4ecb\u7ecd",
    lastVisit: "2026-06-10 13:00",
    lastDoctor: "",
    avatar: "",
  },
  {
    id: 4,
    name: "\u5b59\u6cf3\u6770",
    age: 27,
    gender: "male" as const,
    tags: ["male", "phone"] as TagType[],
    recordNo: "017964",
    source: "\u4ed6\u4eba\u4ecb\u7ecd | \u5458\u5de5\u4ecb\u7ecd | \u9c81\u6bc5",
    lastVisit: "2026-06-09 10:15",
    lastDoctor: "\u9c81\u6bc5",
    avatar: "",
  },
  {
    id: 5,
    name: "\u738b\u5efa\u56fd",
    age: 55,
    gender: "male" as const,
    tags: ["male", "phone", "old"] as TagType[],
    recordNo: "017960",
    source: "\u4ed6\u4eba\u4ecb\u7ecd | \u670b\u53cb\u4ecb\u7ecd",
    lastVisit: "2026-06-08 09:30",
    lastDoctor: "\u674e\u660e",
    avatar: "",
  },
  {
    id: 6,
    name: "\u5218\u82b3",
    age: 34,
    gender: "female" as const,
    tags: ["female", "phone", "door", "vip"] as TagType[],
    recordNo: "017955",
    source: "\u7f51\u7edc\u9884\u7ea6 | \u7f8e\u56e2",
    lastVisit: "2026-06-07 14:20",
    lastDoctor: "\u5f20\u4f1f",
    avatar: "",
  },
];

// 筛选选项
const FILTER_OPTIONS = [
  { id: "all", label: "\u5168\u90e8\u60a3\u8005" },
  { id: "today", label: "\u4eca\u65e5\u5c31\u8bca" },
  { id: "week", label: "\u672c\u5468\u5c31\u8bca" },
  { id: "new", label: "\u65b0\u60a3\u8005" },
  { id: "vip", label: "VIP\u60a3\u8005" },
];

export default function YabanPatientList() {
  const [, setLocation] = useLocation();
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const handleBack = () => {
    setLocation("/yaban");
  };

  const handleCopyRecordNo = (recordNo: string) => {
    navigator.clipboard.writeText(recordNo);
    toast.success("\u75c5\u5386\u53f7\u5df2\u590d\u5236");
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

  const currentFilterLabel = FILTER_OPTIONS.find((f) => f.id === activeFilter)?.label || "\u5168\u90e8\u60a3\u8005";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">\u60a3\u8005</h1>
          <button
            onClick={() => toast.info("\u65b0\u589e\u60a3\u8005\u529f\u80fd\u5f00\u53d1\u4e2d")}
            className="p-1"
          >
            <Plus className="w-6 h-6 text-sky-500" />
          </button>
        </div>
      </div>

      {/* 搜索栏 + 筛选 */}
      <div className="sticky top-[53px] z-40 bg-white px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {/* 搜索输入框 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="\u8f93\u5165\u60a3\u8005\u540d\u5b57\u3001\u624b\u673a\u53f7"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </div>
          {/* 筛选按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-1 text-sm text-sky-600 font-medium whitespace-nowrap"
            >
              <span>{currentFilterLabel}</span>
              <span className="text-gray-300 mx-1">|</span>
              <Filter className="w-4 h-4" />
              <span>\u7b5b\u9009</span>
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
            <p className="text-gray-400 text-sm">\u672a\u627e\u5230\u5339\u914d\u7684\u60a3\u8005</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredPatients.map((patient) => (
              <div
                key={patient.id}
                className="bg-white px-4 py-4 active:bg-gray-50 transition-colors"
              >
                {/* 点击区域：头像 + 信息 */}
                <div
                  className="flex gap-3 cursor-pointer"
                  onClick={() => handlePatientClick(patient.id)}
                >
                  {/* 头像 */}
                  <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {patient.avatar ? (
                      <img src={patient.avatar} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-b from-sky-100 to-sky-50 flex items-center justify-center">
                        <svg viewBox="0 0 40 40" className="w-10 h-10">
                          <circle cx="20" cy="15" r="7" fill="#90CAF9" />
                          <ellipse cx="20" cy="35" rx="12" ry="10" fill="#90CAF9" />
                          {/* 口罩 */}
                          <rect x="12" y="17" width="16" height="8" rx="3" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="0.5" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* 信息区 */}
                  <div className="flex-1 min-w-0">
                    {/* 姓名 + 年龄 */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base font-bold text-gray-900">
                        {patient.name}
                      </span>
                      {patient.nickname && (
                        <span className="text-sm text-gray-500">
                          ({patient.nickname})
                        </span>
                      )}
                      {patient.age > 0 && (
                        <>
                          <span className="text-gray-300">\u00b7</span>
                          <span className="text-base font-bold text-gray-900">
                            {patient.age}\u5c81
                          </span>
                        </>
                      )}
                    </div>

                    {/* 标签 */}
                    <div className="flex items-center gap-1 mb-1.5">
                      {patient.tags.map((tag, idx) => {
                        const config = TAG_CONFIG[tag];
                        return (
                          <span
                            key={idx}
                            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${config.bg} ${config.text}`}
                          >
                            {config.label}
                          </span>
                        );
                      })}
                    </div>

                    {/* 病历号 */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm text-gray-500">
                        \u75c5\u5386\u53f7\uff1a{patient.recordNo}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyRecordNo(patient.recordNo);
                        }}
                        className="text-xs text-gray-400"
                      >
                        \u590d\u5236
                      </button>
                    </div>

                    {/* 来源 */}
                    <p className="text-sm text-gray-500 mb-0.5">
                      \u6765\u6e90\uff1a{patient.source}
                    </p>

                    {/* 上次就诊医生 */}
                    {patient.lastDoctor && (
                      <p className="text-sm text-gray-500 mb-0.5">
                        \u4e0a\u6b21\u5c31\u8bca\u533b\u751f\uff1a{patient.lastDoctor}
                      </p>
                    )}

                    {/* 上次就诊时间 */}
                    {patient.lastVisit && (
                      <p className="text-sm text-gray-500">
                        \u4e0a\u6b21\u5c31\u8bca\u65f6\u95f4\uff1a{patient.lastVisit}
                      </p>
                    )}
                  </div>
                </div>

                {/* 底部操作按钮 */}
                <div className="flex items-center justify-center gap-3 mt-3 pl-[68px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("\u9884\u7ea6\u529f\u80fd\u5f00\u53d1\u4e2d");
                    }}
                    className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 font-medium text-center active:bg-gray-50"
                  >
                    \u9884\u7ea6
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("\u6302\u53f7\u529f\u80fd\u5f00\u53d1\u4e2d");
                    }}
                    className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 font-medium text-center active:bg-gray-50"
                  >
                    \u6302\u53f7
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info("\u6536\u8d39\u529f\u80fd\u5f00\u53d1\u4e2d");
                    }}
                    className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 font-medium text-center active:bg-gray-50"
                  >
                    \u6536\u8d39
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
