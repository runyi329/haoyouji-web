import { useState, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const YJH_USER_ID_CONST = 4957151;

type TreeUser = {
  id: number;
  name: string;
  invitedByUserId: number | null;
  selfRatio: number; // 自留比例（source=self, beneficiary=self）
};

type PayoutRelation = {
  sourceUserId: number;
  beneficiaryUserId: number;
  ratio: number;
};

// ===== 紧凑节点卡片 =====
function FamilyCard({
  user,
  yjhUserId,
  ledgerId,
  onNavigate,
}: {
  user: TreeUser;
  yjhUserId: number;
  ledgerId: number;
  onNavigate: (path: string) => void;
}) {
  const isYJH = user.id === yjhUserId;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: isYJH ? "1.5px solid #C62828" : "1px solid #BDBDBD",
        backgroundColor: isYJH ? "#FFEBEE" : "#FAFAFA",
        borderRadius: 4,
        padding: "2px 4px",
        minWidth: 36,
        maxWidth: 56,
        cursor: "pointer",
        boxShadow: isYJH
          ? "0 1px 3px rgba(198,40,40,0.18)"
          : "0 1px 2px rgba(0,0,0,0.07)",
        userSelect: "none",
      }}
      onClick={() => onNavigate(`/ledger/${ledgerId}/af-ratio/${user.id}`)}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: isYJH ? "#C62828" : "#333",
          maxWidth: 52,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: "13px",
        }}
      >
        {isYJH ? "YJH" : user.name || "未知"}
      </span>
      {/* 名字下方：自留比例 */}
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          lineHeight: "12px",
          color: user.selfRatio > 0 ? "#1B5E20" : "#9E9E9E",
        }}
      >
        {user.selfRatio > 0 ? `自${user.selfRatio.toFixed(1)}%` : "0%"}
      </span>
    </div>
  );
}

// ===== 连接线上的上级抽成标签（0% 也显示）=====
function EdgeLabel({ ratio }: { ratio: number }) {
  const isZero = ratio <= 0;
  return (
    <div
      style={{
        fontSize: 7,
        fontWeight: 700,
        color: isZero ? "#9E9E9E" : "#E65100",
        backgroundColor: isZero ? "#F5F5F5" : "#FFF3E0",
        border: `1px solid ${isZero ? "#E0E0E0" : "#FFE0B2"}`,
        borderRadius: 3,
        padding: "0 2px",
        lineHeight: "11px",
        whiteSpace: "nowrap",
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 3,
      }}
    >
      ↑{isZero ? "0%" : `${ratio.toFixed(1)}%`}
    </div>
  );
}

// ===== 递归节点 =====
function FamilyNode({
  node,
  allUsers,
  yjhUserId,
  collapsedIds,
  toggleCollapse,
  ledgerId,
  onNavigate,
  ratioMap,
  parentId,
}: {
  node: TreeUser;
  allUsers: TreeUser[];
  yjhUserId: number;
  collapsedIds: Set<number>;
  toggleCollapse: (id: number) => void;
  ledgerId: number;
  onNavigate: (path: string) => void;
  ratioMap: Map<string, number>; // key: "sourceUserId-beneficiaryUserId"
  parentId: number | null;
}) {
  const children = allUsers.filter((u) => u.invitedByUserId === node.id);
  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = children.length > 0;

  // 连接线上的数字 = 上级从这个人身上能拿到多少
  // 即 source=当前节点, beneficiary=父节点 的 ratio
  // 如果没有设置（新人），则自动计算：100% 减去这条链上面所有已设置的橙色数字和自留之和
  let edgeRatio = 0;
  if (parentId !== null) {
    const dbRatio = ratioMap.get(`${node.id}-${parentId}`);
    if (dbRatio !== undefined && dbRatio > 0) {
      // 数据库里有设置，直接用
      edgeRatio = dbRatio;
    } else {
      // 没有设置，自动计算：从当前节点往上追溯，累加所有祖先的 selfRatio
      // 连接线 = 100% - 链上所有祖先的 selfRatio 之和
      let ancestorTotal = 0;
      let cur = parentId;
      while (cur !== null) {
        const ancestor = allUsers.find(u => u.id === cur);
        if (!ancestor) break;
        ancestorTotal += ancestor.selfRatio;
        cur = ancestor.invitedByUserId;
      }
      edgeRatio = Math.max(0, parseFloat((100 - ancestorTotal).toFixed(1)));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* 连接线（从父节点到当前节点）+ 上级抽成标签（始终显示）*/}
      {parentId !== null && (
        <div style={{ position: "relative", width: 1, height: 20, backgroundColor: "#BDBDBD" }}>
          <EdgeLabel ratio={edgeRatio} />
        </div>
      )}

      <div style={{ position: "relative", paddingBottom: hasChildren ? 6 : 0 }}>
        <FamilyCard
          user={node}
          yjhUserId={yjhUserId}
          ledgerId={ledgerId}
          onNavigate={onNavigate}
        />
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(node.id);
            }}
            style={{
              position: "absolute",
              bottom: -2,
              left: "50%",
              transform: "translateX(-50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: isCollapsed ? "#C62828" : "#9E9E9E",
              color: "#fff",
              border: "1.5px solid #fff",
              fontSize: 9,
              cursor: "pointer",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              padding: 0,
            }}
          >
            {isCollapsed ? "+" : "−"}
          </button>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 1, height: 6, backgroundColor: "#BDBDBD" }} />
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              position: "relative",
              gap: 0,
            }}
          >
            {children.map((child, idx) => (
              <div
                key={child.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  paddingLeft: idx > 0 ? 6 : 0,
                  paddingRight: idx < children.length - 1 ? 6 : 0,
                }}
              >
                <FamilyNode
                  node={child}
                  allUsers={allUsers}
                  yjhUserId={yjhUserId}
                  collapsedIds={collapsedIds}
                  toggleCollapse={toggleCollapse}
                  ledgerId={ledgerId}
                  onNavigate={onNavigate}
                  ratioMap={ratioMap}
                  parentId={node.id}
                />
              </div>
            ))}
            {children.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  height: 1,
                  backgroundColor: "#BDBDBD",
                  width: "calc(100% - 12px)",
                  zIndex: 1,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AfWaveTreePage() {
  const [, params] = useRoute("/ledger/:id/af-wave-tree");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? Number(params.id) : 0;
  const { data: user } = trpc.auth.me.useQuery();

  // 账本基本信息（判断权限，与 AfInviteTreePage 保持一致）
  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const ledgerLoaded = !ledgerLoading && !!ledgerData;

  // isYJH 判断（与 AfInviteTreePage 保持一致）
  const isYJH =
    (user as any)?.id === YJH_USER_ID_CONST ||
    (user as any)?.id === 870413 ||
    isOwner ||
    isAdmin;

  // viewAsUserId 逻辑：owner/admin 且不是 YJH 本人时，以 YJH 视角查询
  const inviteTreeViewAsId = ledgerLoaded
    ? ((isOwner || isAdmin) && (user as any)?.id !== YJH_USER_ID_CONST
        ? YJH_USER_ID_CONST
        : undefined)
    : undefined;

  const { data: inviteTreeData, isLoading } = trpc.ledger.afGetInviteTree.useQuery(
    { ledgerId, ...(inviteTreeViewAsId ? { viewAsUserId: inviteTreeViewAsId } : {}) },
    { enabled: ledgerLoaded && !!ledgerId }
  );

  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const toggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 构建波比关系映射：key = "sourceUserId-beneficiaryUserId" -> ratio
  const ratioMap = useMemo(() => {
    const map = new Map<string, number>();
    const allRatios = (inviteTreeData as any)?.allPayoutRatios ?? [];
    for (const r of allRatios) {
      map.set(`${r.sourceUserId}-${r.beneficiaryUserId}`, r.ratio);
    }
    return map;
  }, [inviteTreeData]);

  // 构建树用户数据
  const treeUsers: TreeUser[] = useMemo(() => {
    return (inviteTreeData?.users ?? []).map((u: any) => {
      // 自留比例：source=self, beneficiary=self
      const selfRatio = ratioMap.get(`${u.id}-${u.id}`) ?? u.payoutRatio ?? 0;
      return {
        id: u.id,
        name: u.name,
        invitedByUserId: u.invitedByUserId ?? null,
        selfRatio,
      };
    });
  }, [inviteTreeData, ratioMap]);

  // 链完整性检查：从每个叶子节点往上追溯，检查链上所有 selfRatio 之和是否 = 100%
  const chainWarnings: { memberName: string; total: number; gap: number }[] = [];
  if (treeUsers.length > 0) {
    const userMap = new Map(treeUsers.map(u => [u.id, u]));
    const childIds = new Set(treeUsers.filter(u => u.invitedByUserId !== null).map(u => u.invitedByUserId!));
    const leafUsers = treeUsers.filter(u => u.id !== YJH_USER_ID_CONST && !childIds.has(u.id));
    for (const leaf of leafUsers) {
      let chainTotal = 0;
      let current: TreeUser | undefined = leaf;
      while (current) {
        chainTotal += current.selfRatio;
        current = current.invitedByUserId ? userMap.get(current.invitedByUserId) : undefined;
      }
      const rounded = parseFloat(chainTotal.toFixed(1));
      if (rounded > 100.0) {
        chainWarnings.push({
          memberName: leaf.name || `用户${leaf.id}`,
          total: rounded,
          gap: parseFloat((rounded - 100.0).toFixed(1)),
        });
      }
    }
  }

  const rootNodes = treeUsers.filter(
    (u) => u.invitedByUserId === null || u.id === YJH_USER_ID_CONST
  );

  if (!isYJH) {
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
          onClick={() => setLocation(`/ledger/${ledgerId}/af-invite-tree`)}
          className="flex items-center gap-1.5 text-gray-600 mr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">波比树状图</div>
          <div className="text-xs text-gray-400">
            共 {treeUsers.length} 人 · 点击节点可编辑
          </div>
        </div>
        {/* 链完整性状态 */}
        <div className="flex-shrink-0">
          {chainWarnings.length === 0 ? (
            <span className="text-xs font-medium" style={{ color: "#388E3C" }}>
              ✓ 正常
            </span>
          ) : (
            <span className="text-xs font-bold" style={{ color: "#D32F2F" }}>
              ⚠️ {chainWarnings.length} 人异常
            </span>
          )}
        </div>
      </div>

      {/* 图例说明 */}
      <div className="mx-4 mt-2 flex items-center gap-4 flex-wrap" style={{ fontSize: 10 }}>
        <span style={{ color: "#1B5E20" }}>■ 名字下方 = 自留比例</span>
        <span style={{ color: "#E65100" }}>■ 连接线 ↑ = 上级抽成</span>
        <span style={{ color: "#9E9E9E" }}>■ 0% = 未分配</span>
      </div>

      {/* 链异常提示 */}
      {chainWarnings.length > 0 && (
        <div className="mx-4 mt-2 space-y-1">
          {chainWarnings.slice(0, 5).map((w, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg px-3 py-1.5"
              style={{ backgroundColor: "#FFF3F3", border: "1px solid #FFCDD2" }}
            >
              <span className="text-xs" style={{ color: "#B71C1C" }}>
                {w.memberName} 已分配 {w.total.toFixed(1)}%
              </span>
              <span className="text-xs font-bold" style={{ color: "#D32F2F" }}>
                {w.gap > 0
                  ? `缺 ${w.gap.toFixed(1)}%`
                  : `超 ${Math.abs(w.gap).toFixed(1)}%`}
              </span>
            </div>
          ))}
          {chainWarnings.length > 5 && (
            <div className="text-xs text-gray-400 text-center">
              还有 {chainWarnings.length - 5} 人异常...
            </div>
          )}
        </div>
      )}

      {/* 树状图主体 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : treeUsers.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无成员数据</div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              padding: "12px 12px 24px",
            }}
          >
            <div style={{ minWidth: "max-content" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {rootNodes.map((node) => (
                  <FamilyNode
                    key={node.id}
                    node={node}
                    allUsers={treeUsers}
                    yjhUserId={YJH_USER_ID_CONST}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    ledgerId={ledgerId}
                    onNavigate={setLocation}
                    ratioMap={ratioMap}
                    parentId={null}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-3 border-t border-gray-100" style={{ backgroundColor: "#fff" }}>
        <p className="text-xs text-gray-400 leading-relaxed">
          · 名字下方绿色数字 = 该成员自留比例<br />
          · 连接线上橙色 ↑ 数字 = 上级从该成员拿的抽成<br />
          · 新注册成员默认 0%，需手动分配<br />
          · 点击节点跳转到波比编辑页
        </p>
      </div>
    </div>
  );
}
