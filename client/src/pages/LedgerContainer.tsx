import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import LedgerSwipeContainer from "@/components/LedgerSwipeContainer";
import Ledger from "./Ledger";
import LedgerDetail from "./LedgerDetail";

export default function LedgerContainer() {
  const [, params] = useRoute("/ledger/:id?");
  const [, setLocation] = useLocation();
  
  // 根据URL确定当前视图
  const currentView = params?.id ? "detail" : "list";
  const ledgerId = params?.id ? parseInt(params.id) : null;

  // 处理视图切换
  const handleViewChange = (view: "list" | "detail") => {
    if (view === "list") {
      setLocation("/ledger");
    } else {
      // 读取最后访问的账本ID
      const lastLedgerId = localStorage.getItem('lastVisitedLedgerId');
      if (lastLedgerId) {
        setLocation(`/ledger/${lastLedgerId}`);
      }
    }
  };

  return (
    <LedgerSwipeContainer
      listPage={<Ledger />}
      detailPage={<LedgerDetail />}
      currentView={currentView}
      onViewChange={handleViewChange}
    />
  );
}
