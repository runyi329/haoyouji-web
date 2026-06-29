/**
 * 牙伴 - 选择患者页面
 * 路由：/yaban/followup/patient-select
 * 淡蓝色系风格
 * 搜索框 + 真实客户档案数据（trpc.yabanCustomer.searchCustomer）
 * 选中后通过 sessionStorage 传回随访创建页
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Search, User } from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";
import { trpc } from "@/lib/trpc";

export default function YabanPatientSelect() {
  const [, setLocation] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [searchText, setSearchText] = useState("");

  const handleBack = () => {
    setLocation("/yaban/followup/create");
  };

  // 真实客户搜索：空关键字返回前50个客户，输入后按姓名/手机号过滤
  const { data: patients, isLoading } = trpc.yabanCustomer.searchCustomerOnly.useQuery(
    { query: searchText.trim() },
    { keepPreviousData: true }
  );

  const handleSelectPatient = (patient: { id: number; name: string; mobile: string }) => {
    sessionStorage.setItem("selectedPatient", JSON.stringify({
      id: patient.id,
      name: patient.name,
      mobile: patient.mobile || "",
    }));
    setLocation("/yaban/followup/create");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 - 蓝色渐变 */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-sky-500 to-sky-400 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-semibold leading-tight">选择顾客</h1>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <div className="w-6" />
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="输入顾客名字、手机号"
            className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
          />
        </div>
      </div>

      {/* 患者列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
        ) : !patients || patients.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {searchText ? "未找到匹配的顾客" : "暂无顾客"}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => handleSelectPatient(patient)}
                className="w-full bg-white px-4 py-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
              >
                {/* 头像 */}
                <div className="w-11 h-11 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <User className="w-6 h-6 text-sky-300" />
                </div>
                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-gray-900 mb-0.5">
                    {patient.name}
                  </div>
                  {patient.mobile && (
                    <p className="text-xs text-gray-500">
                      手机号：{patient.mobile}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
