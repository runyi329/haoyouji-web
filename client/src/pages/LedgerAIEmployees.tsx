import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 预设的虚拟成员头像列表
const AVATAR_PRESETS = [
  { type: "grandfather", name: "点我", emoji: "👴" },
  { type: "father", name: "点我", emoji: "👨" },
  { type: "mother", name: "点我", emoji: "👩" },
  { type: "son", name: "点我", emoji: "👦" },
  { type: "daughter", name: "点我", emoji: "👧" },
  { type: "boy", name: "点我", emoji: "👶" },
  { type: "child1", name: "点我", emoji: "🧒" },
  { type: "man1", name: "点我", emoji: "👨‍💼" },
  { type: "man2", name: "点我", emoji: "👍" },
  { type: "man3", name: "点我", emoji: "🕴️" },
  { type: "dog", name: "点我", emoji: "🐶" },
  { type: "cat", name: "点我", emoji: "🐱" },
];

const LedgerAIEmployees = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");

  // 获取已添加的AI雇员列表
  const { data: aiEmployees = [], refetch } = trpc.ledger.getAIEmployees.useQuery({
    ledgerId,
  });

  // 添加AI雇员
  const addAIEmployeeMutation = trpc.ledger.addAIEmployee.useMutation({
    onSuccess: () => {
      toast.success("AI雇员添加成功");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "添加失败");
    },
  });

  // 删除AI雇员
  const removeAIEmployeeMutation = trpc.ledger.removeAIEmployee.useMutation({
    onSuccess: () => {
      toast.success("AI雇员已删除");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  // 处理添加AI雇员
  const handleAddAIEmployee = (avatarType: string, name: string) => {
    addAIEmployeeMutation.mutate({
      ledgerId,
      avatarType,
      nickname: name,
    });
  };

  // 处理删除AI雇员
  const handleRemoveAIEmployee = (employeeId: number) => {
    removeAIEmployeeMutation.mutate({
      ledgerId,
      employeeId,
    });
  };

  // 检查某个头像类型是否已添加
  const isAvatarAdded = (avatarType: string) => {
    return aiEmployees.some((emp: any) => emp.avatarType === avatarType);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="container flex items-center h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${id}/settings`)}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="w-6 h-6 text-[#424242]" />
          </button>
          <div className="flex-1" />
        </div>
      </div>

      {/* AI雇员图标 */}
      <div className="flex justify-center py-8">
        <div className="w-24 h-24 rounded-full border-2 border-[#E0E0E0] flex items-center justify-center bg-white">
          <span className="text-5xl">🤖</span>
        </div>
      </div>

      {/* AI雇员功能说明 */}
      <div className="px-4 pb-6">
        <h2 className="text-base font-medium text-[#424242] mb-2">
          AI雇员功能说明：
        </h2>
        <p className="text-sm text-[#757575] leading-relaxed">
          AI雇员是一个智能助手，记账时可以选择AI雇员作为收支人，方便统计其花费情况。
          更重要的是，AI雇员能够通过人工智能全面分析账本、按照您的要求监督账本，
          帮助您更好地管理财务。
        </p>
      </div>

      {/* 可选虚拟成员 */}
      <div className="bg-white px-4 py-3">
        <h3 className="text-sm text-[#757575] mb-3">可选虚拟成员</h3>
        <div className="grid grid-cols-5 gap-4">
          {AVATAR_PRESETS.map((avatar) => (
            <button
              key={avatar.type}
              onClick={() => handleAddAIEmployee(avatar.type, avatar.name)}
              disabled={isAvatarAdded(avatar.type) || addAIEmployeeMutation.isPending}
              className="flex flex-col items-center gap-2 disabled:opacity-40"
            >
              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-3xl">
                {avatar.emoji}
              </div>
              <span className="text-xs text-[#757575]">{avatar.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 已加入虚拟成员 */}
      <div className="bg-white mt-3 px-4 py-3">
        <h3 className="text-sm text-[#757575] mb-3">已加入虚拟成员</h3>
        {aiEmployees.length === 0 ? (
          <div className="text-center py-12 text-[#757575] text-sm">
            还没有加入虚拟成员呢
          </div>
        ) : (
          <div className="space-y-3">
            {aiEmployees.map((employee: any) => {
              const avatarInfo = AVATAR_PRESETS.find(
                (a) => a.type === employee.avatarType
              );
              return (
                <div
                  key={employee.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">
                      {avatarInfo?.emoji || "🤖"}
                    </div>
                    <span className="text-sm text-[#424242]">
                      {employee.nickname || avatarInfo?.name || "AI雇员"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveAIEmployee(employee.id)}
                    disabled={removeAIEmployeeMutation.isPending}
                    className="text-[#D32F2F] text-sm px-3 py-1 hover:bg-[#FFEBEE] rounded"
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LedgerAIEmployees;
