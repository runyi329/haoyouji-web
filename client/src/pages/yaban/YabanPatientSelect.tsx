/**
 * 牙伴 - 选择患者页面
 * 路由：/yaban/followup/patient-select
 * 淡蓝色系风格
 * 搜索框 + 全部患者下拉 + 筛选按钮
 * Tab：全部患者 / 我的患者 / 自动分组 / 手动分组
 * 患者列表：头像、姓名、年龄、标签、病历号、来源、上次就诊时间
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Search, ChevronDown, SlidersHorizontal, User } from "lucide-react";
import { PageTag } from "@/components/PageTag";

// 患者标签配置
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  female: { bg: "bg-pink-100", text: "text-pink-600" },
  male: { bg: "bg-sky-100", text: "text-sky-600" },
  phone: { bg: "bg-orange-100", text: "text-orange-600" },
  clinic: { bg: "bg-amber-100", text: "text-amber-700" },
  door: { bg: "bg-orange-100", text: "text-orange-600" },
  temp: { bg: "bg-pink-100", text: "text-pink-600" },
  old: { bg: "bg-sky-100", text: "text-sky-600" },
  D: { bg: "bg-gray-200", text: "text-gray-700" },
};

// 分组Tab
const GROUP_TABS = [
  { id: "all", label: "全部患者" },
  { id: "mine", label: "我的患者" },
  { id: "auto", label: "自动分组" },
  { id: "manual", label: "手动分组" },
];

// 模拟患者数据
interface Patient {
  id: number;
  name: string;
  age?: number;
  gender: "male" | "female";
  tags: string[];
  recordNo: string;
  source: string;
  lastDoctor?: string;
  lastVisitTime?: string;
  avatar?: string;
}

const MOCK_PATIENTS: Patient[] = [
  {
    id: 1, name: "胡仪璇", age: 27, gender: "female",
    tags: ["female", "phone", "door", "D"],
    recordNo: "017967", source: "上门客 | 附近工作",
    lastVisitTime: "2026-06-10 15:45",
  },
  {
    id: 2, name: "赵女士（王卫东的老婆）", gender: "female",
    tags: ["female", "temp", "door"],
    recordNo: "L010116902", source: "他人介绍 | 朋友介绍 | 王卫东",
  },
  {
    id: 3, name: "周勇", age: 66, gender: "male",
    tags: ["male", "old", "phone"],
    recordNo: "017966", source: "他人介绍 | 朋友介绍",
    lastVisitTime: "2026-06-10 13:00",
  },
  {
    id: 4, name: "孙泳杰", age: 27, gender: "male",
    tags: ["male", "phone"],
    recordNo: "017964", source: "他人介绍 | 员工介绍 | 鲁毅",
    lastDoctor: "鲁毅",
    lastVisitTime: "2026-06-09 10:15",
  },
  {
    id: 5, name: "吕启原", gender: "male",
    tags: ["temp"],
    recordNo: "L010116901", source: "保险渠道 | 欣健颐寿",
  },
  {
    id: 6, name: "王芯悦", gender: "female",
    tags: ["female", "temp"],
    recordNo: "L010116900", source: "他人介绍 | 朋友介绍",
  },
  {
    id: 7, name: "李明", age: 35, gender: "male",
    tags: ["male", "phone"],
    recordNo: "017960", source: "网络推广 | 美团",
    lastVisitTime: "2026-06-08 09:30",
  },
  {
    id: 8, name: "张丽华", age: 42, gender: "female",
    tags: ["female", "old", "phone"],
    recordNo: "017955", source: "他人介绍 | 老客户介绍",
    lastVisitTime: "2026-06-07 14:00",
  },
];

// 标签显示名
const TAG_LABELS: Record<string, string> = {
  female: "Q",
  male: "M",
  phone: "电",
  clinic: "诊",
  door: "门",
  temp: "临",
  old: "老",
  D: "D",
};

export default function YabanPatientSelect() {
  const [, setLocation] = useLocation();
  const [searchText, setSearchText] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [showGroupTabs, setShowGroupTabs] = useState(false);

  const handleBack = () => {
    setLocation("/yaban/followup/create");
  };

  const handleSelectPatient = (patient: Patient) => {
    // TODO: 通过状态管理传递选中的患者信息
    // 暂时使用 sessionStorage
    sessionStorage.setItem("selectedPatient", JSON.stringify({
      id: patient.id,
      name: patient.name,
    }));
    setLocation("/yaban/followup/create");
  };

  // 搜索过滤
  const filteredPatients = MOCK_PATIENTS.filter((p) => {
    if (!searchText) return true;
    return p.name.includes(searchText) || p.recordNo.includes(searchText);
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 - 蓝色渐变 */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-sky-500 to-sky-400 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">选择患者</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* 搜索栏 + 筛选 */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="输入患者名字、手机号"
              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
            />
          </div>
          {/* 全部患者下拉 */}
          <button
            onClick={() => setShowGroupTabs(!showGroupTabs)}
            className="flex items-center gap-0.5 text-sky-500 text-sm font-medium whitespace-nowrap"
          >
            全部患者
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <span className="text-gray-300">|</span>
          {/* 筛选按钮 */}
          <button className="flex items-center gap-1 text-gray-600 text-sm whitespace-nowrap">
            <SlidersHorizontal className="w-4 h-4" />
            筛选
          </button>
        </div>
      </div>

      {/* 分组Tab（点击全部患者下拉后显示） */}
      {showGroupTabs && (
        <div className="bg-white px-4 py-2 border-b border-gray-100 flex gap-2">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveGroup(tab.id);
                setShowGroupTabs(false);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeGroup === tab.id
                  ? "bg-sky-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* 患者列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-100">
          {filteredPatients.map((patient) => (
            <button
              key={patient.id}
              onClick={() => handleSelectPatient(patient)}
              className="w-full bg-white px-4 py-4 flex items-start gap-3 active:bg-gray-50 transition-colors text-left"
            >
              {/* 头像 */}
              <div className="w-11 h-11 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <User className="w-6 h-6 text-sky-300" />
              </div>

              {/* 信息 */}
              <div className="flex-1 min-w-0">
                {/* 第一行：姓名 + 年龄 + 标签 */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-bold text-gray-900">
                    {patient.name}
                  </span>
                  {patient.age && (
                    <span className="text-sm text-gray-500">
                      {patient.age}岁
                    </span>
                  )}
                </div>
                {/* 标签行 */}
                <div className="flex items-center gap-1 mb-1.5">
                  {patient.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${TAG_COLORS[tag]?.bg || "bg-gray-100"} ${TAG_COLORS[tag]?.text || "text-gray-600"}`}
                    >
                      {TAG_LABELS[tag] || tag}
                    </span>
                  ))}
                </div>
                {/* 病历号 */}
                <p className="text-xs text-gray-500 mb-0.5">
                  病历号：{patient.recordNo}
                  <span className="ml-2 text-gray-400">复制</span>
                </p>
                {/* 来源 */}
                <p className="text-xs text-gray-500 mb-0.5">
                  来源：{patient.source}
                </p>
                {/* 上次就诊医生 */}
                {patient.lastDoctor && (
                  <p className="text-xs text-gray-500 mb-0.5">
                    上次就诊医生：{patient.lastDoctor}
                  </p>
                )}
                {/* 上次就诊时间 */}
                {patient.lastVisitTime && (
                  <p className="text-xs text-gray-500">
                    上次就诊时间：{patient.lastVisitTime}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <PageTag code="P303" />
    </div>
  );
}
