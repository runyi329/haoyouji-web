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

  // 编辑状态
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

  const totalRatio = ratioList.reduce((sum: number, r: any) => sum + parseFloat(r.ratio || "0"), 0);
  const isOver = Math.abs(totalRatio - 100) > 0.5;

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

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F5F5F5" }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center px-4 py-3 border-b border-gray-100"
        style={{ backgroundColor: "#fff" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${LEDGER_ID}/af-invite-tree`)}
          className="flex items-center gap-1.5 text-gray-600 mr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">
            {targetName} 的拨比设置
          </div>
          <div className="text-xs text-gray-400">
            总分成：
            <span style={{ color: isOver ? "#C62828" : "#2E7D32", fontWeight: 700 }}>
              {totalRatio.toFixed(1)}%
            </span>
            {isOver && <span className="ml-1 text-red-500">（未达100%）</span>}
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 py-4">
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
              return (
                <div
                  key={r.beneficiaryUserId}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm"
                  style={{ border: isSelf ? "1px solid #FFCCBC" : "1px solid #F0F0F0" }}
                >
                  {/* 左侧：名字 */}
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
                            if (e.key === "Enter")
                              setRatioMutation.mutate({
                                ledgerId: LEDGER_ID,
                                sourceUserId: targetUserId,
                                beneficiaryUserId: r.beneficiaryUserId,
                                newRatio: parseFloat(inputVal) || 0,
                              });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <span className="text-sm text-gray-500">%</span>
                        <button
                          onClick={() =>
                            setRatioMutation.mutate({
                              ledgerId: LEDGER_ID,
                              sourceUserId: targetUserId,
                              beneficiaryUserId: r.beneficiaryUserId,
                              newRatio: parseFloat(inputVal) || 0,
                            })
                          }
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
              );
            })}
          </div>
        )}

        {/* 底部说明 */}
        <div className="mt-6 px-2">
          <p className="text-xs text-gray-400 leading-relaxed">
            · 点击右侧百分比数字可修改拨比<br />
            · 所有受益人拨比之和应为 100%<br />
            · 标注「本人」的行为该成员自己的分成
          </p>
        </div>
      </div>
    </div>
  );
}
