/**
 * OpsHeader - 顶部导航 + 店铺选择器 + 日期选择器
 * 牙伴风格：主渐变背景 linear-gradient(90deg,#2196C8,#3BA9E0)，白色文字
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronLeft, Calendar, Store, Check } from "lucide-react";

interface Shop {
  id: number;
  name: string;
  badge: string;
}

interface DateOption {
  label: string;
  value: string;
}

interface OpsHeaderProps {
  shops: Shop[];
  selectedShop: number;
  onShopChange: (id: number) => void;
  dateQuickOptions: DateOption[];
  selectedDate: string;
  dateLabel: string;
  onDateChange: (value: string, label: string) => void;
}

export default function OpsHeader({
  shops,
  selectedShop,
  onShopChange,
  dateQuickOptions,
  selectedDate,
  dateLabel,
  onDateChange,
}: OpsHeaderProps) {
  const [shopOpen, setShopOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateStart, setDateStart] = useState("2026-06-01");
  const [dateEnd, setDateEnd] = useState("2026-06-16");
  const shopRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (shopRef.current && !shopRef.current.contains(e.target as Node)) setShopOpen(false);
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleQuickDate(opt: DateOption) {
    const today = new Date();
    let label = opt.label;
    if (opt.value === "today") {
      const d = `${today.getMonth() + 1}月${today.getDate()}日`;
      label = `今日（${d}）`;
    } else if (opt.value === "month") {
      label = `本月（6月1日 - 6月16日）`;
    }
    onDateChange(opt.value, label);
    setDateOpen(false);
  }

  function handleCustomConfirm() {
    const s = dateStart.replace(/-/g, "/").slice(5).replace("/", "月") + "日";
    const e = dateEnd.replace(/-/g, "/").slice(5).replace("/", "月") + "日";
    onDateChange("custom", `${s} - ${e}`);
    setDateOpen(false);
  }

  const currentShop = shops.find((s) => s.id === selectedShop) ?? shops[0];

  return (
    <div
      style={{
        background: "linear-gradient(90deg,#2196C8,#3BA9E0)",
        padding: "14px 16px 0",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* 标题行 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: 8,
            padding: "4px 6px",
            color: "white",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
          onClick={() => history.back()}
        >
          <ChevronLeft size={18} />
        </button>

        <span style={{ fontSize: 17, fontWeight: 800, color: "white", display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          运营报表
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.22)",
              color: "white",
              whiteSpace: "nowrap",
            }}
          >
            数据对接中
          </span>
        </span>

        {/* 店铺选择器 */}
        <div ref={shopRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShopOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: 8,
              padding: "5px 10px",
              color: "white",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Store size={14} />
            <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentShop.name}
            </span>
            <ChevronDown
              size={14}
              style={{ transition: "transform 0.2s", transform: shopOpen ? "rotate(180deg)" : "none" }}
            />
          </button>

          {shopOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                minWidth: 180,
                background: "white",
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                overflow: "hidden",
                zIndex: 200,
              }}
            >
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  onClick={() => {
                    onShopChange(shop.id);
                    setShopOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "11px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid #F3F4F6",
                    fontSize: 13,
                    color: selectedShop === shop.id ? "#1E88D6" : "#374151",
                    fontWeight: selectedShop === shop.id ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {shop.name}
                    {shop.badge && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#E8F4FD",
                          color: "#1E88D6",
                        }}
                      >
                        {shop.badge}
                      </span>
                    )}
                  </span>
                  {selectedShop === shop.id && <Check size={15} color="#1E88D6" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 日期选择器 */}
      <div ref={dateRef} style={{ position: "relative", paddingBottom: 14 }}>
        <button
          onClick={() => setDateOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "rgba(255,255,255,0.12)",
            border: "none",
            borderRadius: 8,
            padding: "9px 14px",
            color: "white",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Calendar size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{dateLabel}</span>
          <ChevronDown
            size={15}
            style={{
              color: "rgba(255,255,255,0.8)",
              transition: "transform 0.2s",
              transform: dateOpen ? "rotate(180deg)" : "none",
            }}
          />
        </button>

        {dateOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              zIndex: 200,
              overflow: "hidden",
            }}
          >
            {/* 快捷选项 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: "12px 16px",
                borderBottom: "1px solid #F3F4F6",
              }}
            >
              {dateQuickOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleQuickDate(opt)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 14,
                    border: `1px solid ${selectedDate === opt.value ? "#2196C8" : "#E5E7EB"}`,
                    fontSize: 12,
                    color: selectedDate === opt.value ? "white" : "#4B5563",
                    background: selectedDate === opt.value ? "#2196C8" : "white",
                    cursor: "pointer",
                    fontWeight: selectedDate === opt.value ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 自定义日期 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px" }}>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: "1px solid #E5E7EB",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#374151",
                  outline: "none",
                  textAlign: "center",
                }}
              />
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>至</span>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: "1px solid #E5E7EB",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#374151",
                  outline: "none",
                  textAlign: "center",
                }}
              />
              <button
                onClick={handleCustomConfirm}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2196C8",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                确认
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
