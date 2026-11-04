import { useLayoutEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearLedgerViewAsState } from "@/lib/authIdentity";
import Wallet from "../Wallet";

/** 米伴与脉动网首页共用完整钱包；只替换色调，不复制资金与流水逻辑。 */
export default function MibanWallet() {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let mounted = true;
    clearLedgerViewAsState();
    // 钱包旧查询key没有身份维度，先取消并移除再挂载本人钱包，不能显示旧成员缓存。
    const predicate = (query: { queryKey: readonly unknown[] }) => {
      const route = query.queryKey[0];
      if (!Array.isArray(route)) return false;
      return route[0] === "recharge"
        || (route[0] === "ledger" && route[1] === "afGetMyRechargeHistory");
    };
    void queryClient.cancelQueries({ predicate }).finally(() => {
      queryClient.removeQueries({ predicate });
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, [queryClient]);

  if (!ready) return <div className="min-h-screen bg-[#F8F6F3]" aria-label="正在读取本人钱包" />;
  return <Wallet appearance="miban" />;
}
