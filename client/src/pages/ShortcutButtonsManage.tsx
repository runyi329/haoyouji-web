import { useParams, useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";

const SHORTCUT_KEYS = ["gold", "qq", "oil", "stock", "digitalB", "ledger59", "ethPosition"] as const;
const SHORTCUT_LABELS: Record<string, string> = {
  gold: "黄金",
  qq: "QQ",
  oil: "石油",
  stock: "股票",
  digitalB: "数字B",
  ledger59: "蓄水池",
  ethPosition: "ETH持仓",
};
const DEFAULT_SHORTCUTS = { gold: false, qq: false, oil: false, stock: false, digitalB: false, ledger59: false, ethPosition: false };
type ShortcutValues = { gold: boolean; qq: boolean; oil: boolean; stock: boolean; digitalB: boolean; ledger59: boolean; ethPosition: boolean };
type ShortcutMap = Record<string, ShortcutValues>;

export default function ShortcutButtonsManage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const ledgerId = Number(id);

  // 本地状态（乐观更新用）
  const [localMap, setLocalMap] = useState<ShortcutMap>({});
  // 正在保存的按钮 key: `${userId}-${key}`
  const [savingSet, setSavingSet] = useState<Set<string>>(new Set());
  // 是否已初始化本地状态
  const initializedRef = useRef(false);

  // 获取成员列表
  const { data: permData, isLoading: membersLoading } = (trpc as any).ledger.getMemberPermissions.useQuery({ ledgerId });
  const members = permData?.members || [];

  // 获取所有成员的快捷按钮配置
  const { data: serverMap, isLoading: shortcutLoading } = (trpc as any).ledger.getShortcutButtons.useQuery({ ledgerId });

  // 服务器数据加载后同步到本地状态（仅首次）
  useEffect(() => {
    if (serverMap && !initializedRef.current) {
      const normalized: ShortcutMap = {};
      for (const [uid, val] of Object.entries(serverMap || {})) {
        normalized[String(uid)] = {
          gold: !!(val as any)?.gold,
          qq: !!(val as any)?.qq,
          oil: !!(val as any)?.oil,
          stock: !!(val as any)?.stock,
          digitalB: !!(val as any)?.digitalB,
          ledger59: !!(val as any)?.ledger59,
          ethPosition: !!(val as any)?.ethPosition,
        };
      }
      setLocalMap(normalized);
      initializedRef.current = true;
    }
  }, [serverMap]);

  const utils = (trpc as any).useUtils();

  const updateMutation = (trpc as any).ledger.updateShortcutButtons.useMutation({
    onSuccess: () => {
      // 成功后刷新服务器数据
      utils.ledger.getShortcutButtons.invalidate({ ledgerId });
    },
    onError: (err: any, variables: any) => {
      // 回滚乐观更新：恢复到服务器数据
      const uid = String(variables.targetUserId);
      const serverVal = (serverMap as any)?.[variables.targetUserId] || (serverMap as any)?.[uid];
      setLocalMap(prev => ({
        ...prev,
        [uid]: serverVal
          ? { gold: !!serverVal.gold, qq: !!serverVal.qq, oil: !!serverVal.oil, stock: !!serverVal.stock, digitalB: !!serverVal.digitalB, ledger59: !!serverVal.ledger59, ethPosition: !!serverVal.ethPosition }
          : DEFAULT_SHORTCUTS,
      }));
      toast.error(err.message || "保存失败，请重试");
    },
    onSettled: (_data: any, _err: any, variables: any) => {
      const uid = String(variables.targetUserId);
      setSavingSet(prev => {
        const next = new Set(prev);
        SHORTCUT_KEYS.forEach(k => next.delete(`${uid}-${k}`));
        return next;
      });
    },
  });

  const handleToggle = (userId: number, key: typeof SHORTCUT_KEYS[number]) => {
    const uid = String(userId);
    const current = localMap[uid] || DEFAULT_SHORTCUTS;
    const newShortcuts = { ...current, [key]: !current[key] };

    // 乐观更新本地状态
    setLocalMap(prev => ({ ...prev, [uid]: newShortcuts }));
    setSavingSet(prev => new Set(prev).add(`${uid}-${key}`));

    updateMutation.mutate({
      ledgerId,
      targetUserId: userId,
      shortcuts: newShortcuts,
    });
  };

  const isLoading = membersLoading || shortcutLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white p-3 flex items-center">
        <button onClick={() => navigate(`/ledger/${ledgerId}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-5">
          快捷按钮管理
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#A80000]" />
        </div>
      ) : (
        <>
          {/* 表头 */}
          <div
            className="border-b border-gray-300 text-sm text-gray-700 font-medium bg-white sticky top-[44px] z-10 shadow-sm"
            style={{ display: "grid", gridTemplateColumns: "minmax(72px, 1fr) repeat(7, 1fr)" }}
          >
            <div className="py-3 px-2 text-center">成员</div>
            {SHORTCUT_KEYS.map((key) => (
              <div key={key} className="py-3 px-2 text-center border-l border-gray-200">
                {key === 'digitalB' ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/btc_icon_trimmed_9f204c04.png" alt="数字B" className="w-5 h-5 rounded-full object-cover" />
                    <span className="text-[10px] leading-none">数字B</span>
                  </div>
                ) : key === 'ledger59' ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/gZMsAzlHHuDFuUTJ.png" alt="蓄水池" className="w-5 h-5 rounded-full object-cover" />
                    <span className="text-[10px] leading-none">蓄水池</span>
                  </div>
                ) : key === 'ethPosition' ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <svg width="18" height="18" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="#343434"/>
                      <path d="M127.962 0L0 212.32L127.962 287.958V154.158V0Z" fill="#8C8C8C"/>
                      <path d="M127.961 312.187L126.386 314.107V412.301L127.961 416.962L255.931 236.551L127.961 312.187Z" fill="#3C3C3B"/>
                      <path d="M127.962 416.962V312.187L0 236.551L127.962 416.962Z" fill="#8C8C8C"/>
                      <path d="M127.961 287.957L255.923 212.319L127.961 154.158V287.957Z" fill="#141414"/>
                      <path d="M0 212.319L127.962 287.957V154.158L0 212.319Z" fill="#393939"/>
                    </svg>
                    <span className="text-[10px] leading-none">ETH持仓</span>
                  </div>
                ) : SHORTCUT_LABELS[key]}
              </div>
            ))}
          </div>

          {/* 成员列表 */}
          <div className="bg-white">
            {members.map((member: any) => {
              const uid = String(member.userId);
              const shortcuts = localMap[uid] || DEFAULT_SHORTCUTS;
              return (
                <div
                  key={member.id}
                  className="border-b border-gray-100"
                  style={{ display: "grid", gridTemplateColumns: "minmax(72px, 1fr) repeat(7, 1fr)" }}
                >
                  {/* 成员头像+名字 */}
                  <div className="py-3 px-2 flex flex-col items-center justify-center gap-1">
                    <UserAvatar
                      username={member.userName}
                      avatar={member.userAvatar}
                      size="sm"
                    />
                    <span className="text-xs text-gray-600 truncate max-w-[60px] text-center">
                      {member.userName}
                    </span>
                  </div>

                  {/* 4个开关 */}
                  {SHORTCUT_KEYS.map((key) => {
                    const isOn = shortcuts[key];
                    const isSaving = savingSet.has(`${uid}-${key}`);
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-center border-l border-gray-100 cursor-pointer active:opacity-60 transition-opacity ${isSaving ? "opacity-50 pointer-events-none" : ""}`}
                        onClick={() => handleToggle(member.userId, key)}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                        ) : (
                          <span
                            className={`text-sm font-bold px-2 py-1 rounded ${
                              isOn
                                ? "text-white bg-[#4CAF50]"
                                : "text-white bg-[#D32F2F]"
                            }`}
                          >
                            {isOn ? "开" : "关"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* 说明 */}
          <div className="p-4 text-xs text-gray-500">
            <p className="mb-2">
              <span className="text-[#4CAF50] font-medium">开</span>：该成员进入账本时可看到对应快捷按钮
            </p>
            <p>
              <span className="text-[#D32F2F] font-medium">关</span>：该成员进入账本时不显示对应快捷按钮
            </p>
          </div>
        </>
      )}
    </div>
  );
}
