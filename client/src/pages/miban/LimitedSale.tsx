import { useState, useEffect } from "react";
import { Link } from "wouter";
import { mtrpc } from "./mibanTrpc";

export default function LimitedSale() {
  // 天桂梨规格（动态最低价）
  const { data: pearSpecs } = mtrpc.pear.getSpecs.useQuery({ productKey: 'tiangui-pear' });
  const pearMinPrice = pearSpecs && pearSpecs.length > 0
    ? Math.min(...pearSpecs.map((s: any) => s.price))
    : 88;

  // 天桂梨倒计时：截止北京时 2026-07-25 00:00:00
  const PEAR_DEADLINE = new Date('2026-07-25T00:00:00+08:00').getTime();
  const [pearCountdown, setPearCountdown] = useState('');
  const [pearExpired, setPearExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = PEAR_DEADLINE - Date.now();
      if (diff <= 0) {
        setPearCountdown('已结束');
        setPearExpired(true);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setPearCountdown(`${d}天 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // 天桂梨卡片内容（下架时禁止跳转）
  const PearCardInner = (
    <div
      className="relative overflow-hidden rounded-2xl transition-transform"
      style={{
        background: pearExpired ? "#EFEFEF" : "#F4F4F4",
        height: 160,
        opacity: pearExpired ? 0.7 : 1,
      }}
    >
      {/* 大图 */}
      <img
        src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/bxCCxBmoQFldHQma.png"
        alt="天桂梨"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 160,
          height: 160,
          objectFit: "contain",
          objectPosition: "top right",
          pointerEvents: "none",
          filter: pearExpired ? "grayscale(60%)" : "none",
        }}
      />
      {/* 地理标志图标 */}
      <img
        src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/siulsrQuLsYyDqwV.png"
        alt="地理标志"
        style={{
          position: "absolute",
          right: 160 - 32 - 8,
          bottom: 8,
          width: 32,
          height: 32,
          objectFit: "contain",
          zIndex: 4,
          pointerEvents: "none",
          filter: pearExpired ? "grayscale(80%)" : "none",
        }}
      />
      {/* 顶部条：倒计时或已下架 */}
      <div
        className="absolute top-0 left-0 flex items-center gap-2 px-4"
        style={{
          background: pearExpired
            ? "linear-gradient(to right, #999 70%, rgba(153,153,153,0))"
            : "linear-gradient(to right, #FF6900 70%, rgba(255,105,0,0))",
          height: 32,
          zIndex: 4,
          width: "72%",
        }}
      >
        {pearExpired ? (
          <span className="text-[12px] font-bold text-white" style={{ letterSpacing: "0.08em" }}>已下架</span>
        ) : (
          <>
            <span className="text-[12px] font-bold text-white" style={{ letterSpacing: "0.08em", whiteSpace: "nowrap" }}>夏季限卖</span>
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>·</span>
            <span className="text-[12px] font-mono font-bold text-white" style={{ letterSpacing: "0.04em" }}>{pearCountdown}</span>
          </>
        )}
      </div>
      {/* 文字区 */}
      <div className="absolute flex flex-col justify-end pb-4 px-4" style={{ zIndex: 3, left: 0, top: 36, bottom: 0, width: "58%", boxSizing: "border-box" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: pearExpired ? "#999" : "#111", lineHeight: 1.3, margin: 0, marginBottom: 3 }}>天桂梨</h3>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: pearExpired ? "#bbb" : "#4a9e5c", fontWeight: 600, letterSpacing: "0.02em" }}>地理标志产品 · 绿色食品</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#aaa" }}>江西广丰 · 糖度 13%+</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!pearExpired && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#FF6900" }}>¥</span>
              <span style={{ fontSize: 24, fontWeight: 900, color: "#FF6900", lineHeight: 1 }}>{pearMinPrice}</span>
              <span style={{ fontSize: 10, color: "#bbb", marginLeft: 2 }}>起</span>
            </div>
          )}
          <div style={{
            background: pearExpired ? "#ccc" : "#FF6900",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 20,
            padding: "5px 12px",
            whiteSpace: "nowrap",
            cursor: pearExpired ? "not-allowed" : "pointer",
          }}>
            {pearExpired ? "已下架" : "立即购买"}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F6F3]">
      {/* 页面标题 */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
            style={{ background: "#FF6900" }}
          >
            限时
          </span>
          <h1 className="text-[18px] font-bold text-black">时令上新</h1>
        </div>
        <p className="text-[12px] text-gray-400 mt-1">当季限量，错过等明年</p>
      </div>

      {/* 天桂梨卡片：下架后不可跳转 */}
      <div className="px-5">
        {pearExpired ? (
          PearCardInner
        ) : (
          <Link href="/p/proj_hzxm2t/pear/tiangui" className="active:scale-[0.98] transition-transform block">
            {PearCardInner}
          </Link>
        )}
      </div>

      {/* 占位提示 */}
      <div className="py-8 text-center">
        <p className="text-[12px] text-gray-300">更多时令产品即将上线</p>
      </div>
    </div>
  );
}
