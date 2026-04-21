import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const LEDGER_ID = 52;
const YJH_USER_ID = 4957151;

export default function AfRatioEditPage() {
  const params = useParams<{ userId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const targetUserId = parseInt(params.userId || "0");

  // 获取该成员的所有受益人拨比
  const { data: ratioList = [], isLoading, refetch } = trpc.ledger.afGetMemberPayoutRatios.useQuery(
    { ledgerId: LEDGER_ID, sourceUserId: targetUserId },
    { enabled: !!targetUserId }
  );

  // 获取该成员信息（从邀请树数据中获取名字）
  const { data: treeData } = trpc.ledger.afGetInviteTree.useQuery(
    { ledgerId: LEDGER_ID },
    { staleTime: 5 * 60 * 1000 }
  );
  const targetUser = treeData?.users?.find((u: any) => u.id === targetUserId);
  const targetName = targetUserId === YJH_USER_ID ? "YJH" : (targetUser?.name || `用户${targetUserId}`);

  // 编辑状态：key = beneficiaryUserId
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");

  const setRatioMutation = trpc.ledger.afSetYjhPayoutRatio.useMutation({
    onSuccess: () => {
      refetch();
      setEditingId(null);
      setInputVal("");
    },
    onError: (err) => {
      alert("保存失败：" + err.message);
    },
  });

  // 计算总分配（基于当前列表，编辑中的用输入值替代）
  const calcTotal = (excludeId?: number, addVal?: number) => {
    return ratioList.reduce((sum: number, r: any) => {
      const ratio = r.beneficiaryUserId === excludeId
        ? (addVal ?? 0)
        : parseFloat(r.ratio || "0");
      return sum + ratio;
    }, 0);
  };

  const totalRatio = calcTotal();
  const remaining = parseFloat((100 - totalRatio).toFixed(1));

  // 当前编辑时，已分配（不含正在编辑的那一项）
  const allocatedExcludingEditing = editingId !== null
    ? parseFloat(calcTotal(editingId, 0).toFixed(1))
    : totalRatio;
  const remainingForEditing = parseFloat((100 - allocatedExcludingEditing).toFixed(1));

  const handleSave = (beneficiaryUserId: number) => {
    const val = parseFloat(inputVal);
    if (isNaN(val) || val < 0) {
      alert("请输入有效的百分比（≥ 0）");
      return;
    }
    // 检查是否超过100%
    const otherTotal = parseFloat(calcTotal(beneficiaryUserId, 0).toFixed(1));
    const newTotal = parseFloat((otherTotal + val).toFixed(1));
    if (newTotal > 100) {
      alert(`超出限制！其他人已分配 ${otherTotal}%，最多还能分配 ${parseFloat((100 - otherTotal).toFixed(1))}%`);
      return;
    }
    // 检查小数位数
    const decimalStr = inputVal.toString().split(".")[1];
    if (decimalStr && decimalStr.length > 1) {
      alert("波比只允许保留小数点后一位（如 33.4%）");
      return;
    }
    setRatioMutation.mutate({
      ledgerId: LEDGER_ID,
      sourceUserId: targetUserId,
      beneficiaryUserId,
      newRatio: val,
    });
  };

  // 权限检查
  const isYJH = user?.id === YJH_USER_ID;
  const isSysAdmin = user?.role === "admin" || user?.role === "super_admin";
  if (!isYJH && !isSysAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">无权限查看</p>
      </div>
    );
  }

  const isOver = totalRatio > 100.05;
  const isComplete = Math.abs(totalRatio - 100) < 0.05;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F5F5F5" }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center px-4 py-3 border-b border-gray-100"
        style={{ backgroundColor: "#fff" }}
      >
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-gray-600 mr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">
            {targetName} 的拨比设置
          </div>
        </div>
      </div>

      {/* 分配进度条 */}
      <div className="mx-4 mt-3 mb-1 bg-white rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">这条链的分配情况</span>
          <span
            className="text-xs font-bold"
            style={{ color: isOver ? "#C62828" : isComplete ? "#2E7D32" : "#E65100" }}
          >
            {isOver ? `超出 ${parseFloat((totalRatio - 100).toFixed(1))}%` :
             isComplete ? "✓ 已分配 100%" :
             `已分配 ${totalRatio.toFixed(1)}%，剩余 ${remaining}%`}
          </span>
        </div>
        {/* 进度条 */}
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F0F0F0" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(totalRatio, 100)}%`,
              backgroundColor: isOver ? "#C62828" : isComplete ? "#2E7D32" : "#E65100",
            }}
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 py-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : ratioList.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无拨比配置</div>
        ) : (
          <div className="space-y-2">
            {ratioList.map((r: any) => {
              const isEditing = editingId === r.beneficiaryUserId;
              const ratio = parseFloat(r.ratio || "0");
              const isSelf = r.name?.includes("（本人）");

              // 编辑中：实时计算剩余
              const liveInputVal = parseFloat(inputVal) || 0;
              const liveTotal = isEditing
                ? parseFloat(calcTotal(r.beneficiaryUserId, liveInputVal).toFixed(1))
                : totalRatio;
              const liveRemaining = parseFloat((100 - liveTotal).toFixed(1));

              return (
                <div
                  key={r.beneficiaryUserId}
                  className="bg-white rounded-xl px-4 py-3 shadow-sm"
                  style={{ border: isSelf ? "1px solid #FFCCBC" : "1px solid #F0F0F0" }}
                >
                  {/* 上行：名字 + 拨比 */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: isSelf ? "#BF360C" : "#333" }}
                      >
                        {r.name || "未知"}
                      </span>
                      {r.username && (
                        <span className="text-xs text-gray-400">@{r.username}</span>
                      )}
                    </div>

                    {/* 右侧：拨比 + 编辑 */}
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            className="w-16 text-center text-sm border border-orange-300 rounded-lg px-2 py-1 outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSave(r.beneficiaryUserId);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <span className="text-sm text-gray-500">%</span>
                          <button
                            onClick={() => handleSave(r.beneficiaryUserId)}
                            disabled={setRatioMutation.isPending}
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "#C62828" }}
                          >
                            <Check className="w-4 h-4 text-white" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400 px-1"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(r.beneficiaryUserId);
                            setInputVal(ratio.toFixed(1));
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold"
                          style={{
                            backgroundColor: ratio > 0 ? "#FFF3E0" : "#F5F5F5",
                            color: ratio > 0 ? "#E65100" : "#9E9E9E",
                            border: ratio > 0 ? "1px solid #FFCC80" : "1px solid #E0E0E0",
                          }}
                        >
                          {ratio.toFixed(1)}%
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 编辑中：实时提示剩余 */}
                  {isEditing && (
                    <div
                      className="mt-2 text-xs rounded-lg px-3 py-1.5"
                      style={{
                        backgroundColor: liveTotal > 100 ? "#FFEBEE" : liveTotal === 100 ? "#E8F5E9" : "#FFF8E1",
                        color: liveTotal > 100 ? "#C62828" : liveTotal === 100 ? "#2E7D32" : "#E65100",
                      }}
                    >
                      {liveTotal > 100
                        ? `⚠️ 已超出 ${parseFloat((liveTotal - 100).toFixed(1))}%，请减小数值`
                        : liveTotal === 100
                        ? `✓ 刚好分配完 100%`
                        : `已分配 ${liveTotal.toFixed(1)}%，还剩 ${liveRemaining}% 可分配`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 底部说明 */}
        <div className="mt-6 px-2">
          <p className="text-xs text-gray-400 leading-relaxed">
            · 点击右侧百分比数字可修改拨比<br />
            · 所有受益人拨比之和应为 100%，不允许超出<br />
            · 波比只保留小数点后一位（如 33.4%）<br />
            · 标注「本人」的行为该成员自己的分成
          </p>
        </div>
      </div>
    </div>
  );
}
