import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

interface Props {
  ledgerId: number;
}

export default function LedgerMemberManage({ ledgerId }: Props) {
  const [, setLocation] = useLocation();
  const { data: members, isLoading } = trpc.equity.getLedgerMemberReferrals.useQuery({ ledgerId });

  // 构建推荐关系树：以推荐人为key，列出被推荐人
  const buildTree = (list: any[]) => {
    const map: Record<string, any[]> = {};
    const roots: any[] = [];
    list.forEach((m) => {
      if (!m.invitedByUserId) {
        roots.push(m);
      } else {
        if (!map[m.invitedByUserId]) map[m.invitedByUserId] = [];
        map[m.invitedByUserId].push(m);
      }
    });
    return { roots, map };
  };

  const renderMember = (m: any, depth: number, map: Record<string, any[]>) => {
    const children = map[m.userId] || [];
    return (
      <div key={m.userId} style={{ marginLeft: depth * 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            marginBottom: 6,
            background: depth === 0 ? "#1a1a1a" : "#111",
            borderRadius: 8,
            borderLeft: `3px solid ${depth === 0 ? "#C8A84B" : "#6b5a2a"}`,
          }}
        >
          {/* 层级缩进线 */}
          {depth > 0 && (
            <span style={{ color: "#6b5a2a", marginRight: 8, fontSize: 12 }}>
              {"└─".repeat(1)}
            </span>
          )}
          {/* 股东编号 */}
          {m.shareNo && (
            <span
              style={{
                fontSize: 11,
                color: "#C8A84B",
                fontWeight: "bold",
                marginRight: 8,
                minWidth: 36,
              }}
            >
              {m.shareNo}
            </span>
          )}
          {/* 姓名 */}
          <span style={{ flex: 1, fontSize: 14, color: "#f0f0f0", fontWeight: depth === 0 ? "bold" : "normal" }}>
            {m.userName || `用户${m.userId}`}
          </span>
          {/* 推荐人标注 */}
          {m.inviterName ? (
            <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
              由 <span style={{ color: "#C8A84B" }}>{m.inviterName}</span> 推荐
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>创始人</span>
          )}
        </div>
        {children.map((child) => renderMember(child, depth + 1, map))}
      </div>
    );
  };

  const { roots, map } = members ? buildTree(members) : { roots: [], map: {} };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f0f0f0" }}>
      {/* 顶部导航 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 16px",
          background: "linear-gradient(135deg, #1A1200 0%, #0D0A00 100%)",
          borderBottom: "1px solid #C8A84B",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
          style={{
            background: "linear-gradient(135deg, #1A1200 0%, #0D0A00 100%)",
            border: "1px solid #C8A84B",
            borderRadius: 8,
            padding: "6px 14px",
            color: "#C8A84B",
            fontSize: 13,
            cursor: "pointer",
            marginRight: 12,
            textShadow: "0 0 8px rgba(240,208,80,0.6)",
          }}
        >
          返回
        </button>
        <span
          style={{
            fontSize: 16,
            fontWeight: "bold",
            background: "linear-gradient(180deg, #FFE566 0%, #D4A020 50%, #C8920A 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          成员管理
        </span>
      </div>

      {/* 说明 */}
      <div style={{ padding: "12px 16px 4px", fontSize: 12, color: "#666" }}>
        以下展示各成员在脉动网注册时的邀请推荐关系
      </div>

      {/* 成员列表 */}
      <div style={{ padding: "8px 16px 32px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#666" }}>加载中...</div>
        ) : members && members.length > 0 ? (
          roots.map((root) => renderMember(root, 0, map))
        ) : (
          <div style={{ textAlign: "center", padding: 40, color: "#666" }}>暂无数据</div>
        )}
      </div>

      {/* 统计 */}
      {members && members.length > 0 && (
        <div
          style={{
            margin: "0 16px 24px",
            padding: "12px 16px",
            background: "#111",
            borderRadius: 8,
            border: "1px solid #2a2000",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 12, color: "#888" }}>
            共 <span style={{ color: "#C8A84B", fontWeight: "bold" }}>{members.length}</span> 位成员
          </span>
          <span style={{ fontSize: 12, color: "#888" }}>
            缺少推荐人：
            <span style={{ color: "#e05050", fontWeight: "bold" }}>
              {members.filter((m: any) => !m.invitedByUserId && m.shareNo).length}
            </span>{" "}
            位
          </span>
        </div>
      )}
    </div>
  );
}
