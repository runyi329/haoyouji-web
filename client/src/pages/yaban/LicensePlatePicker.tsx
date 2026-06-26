/**
 * 牙伴 - 车牌输入组件
 * 精确还原中国真实车牌：字符撑满车牌，字号极大，上下几乎无留白
 * 蓝牌：蓝底白字；绿牌：浅绿底黑字
 * 自动识别：输满6位=蓝牌，输第7位自动变绿牌
 */
import React, { useState, useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";

const ACCENT = "#1E88D6";
const ACCENT_LIGHT = "#E8F4FD";
const ACCENT_BORDER = "#D6E6F5";

const PROVINCE_LIST = [
  "京", "津", "沪", "渝",
  "冀", "豫", "云", "辽",
  "黑", "湘", "皖", "鲁",
  "新", "苏", "浙", "赣",
  "鄂", "桂", "甘", "晋",
  "蒙", "陕", "吉", "闽",
  "贵", "粤", "川", "青",
  "琼", "宁", "藏", "港", "澳",
];

const LETTER_KEYS = [
  "A","B","C","D","E","F","G",
  "H","J","K","L","M","N","P",
  "Q","R","S","T","U","V","W",
  "X","Y","Z",
];

const MIXED_KEYS = [
  "1","2","3","4","5","6","7","8","9","0",
  "A","B","C","D","E","F","G","H","J","K",
  "L","M","N","P","Q","R","S","T","U","V",
  "W","X","Y","Z",
];

const MAX_LEN = 7;

// 真实车牌配色
const BLUE_BG = "#2B5CE6";
const BLUE_TEXT = "#FFFFFF";
const GREEN_BG = "#52C77A";
const GREEN_TEXT = "#111111";

interface Props {
  open: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (plate: string) => void;
}

type Step = "province" | "plate";

export default function LicensePlatePicker({ open, value, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<Step>("province");
  const [province, setProvince] = useState("");
  const [plateChars, setPlateChars] = useState<string[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);

  const isGreen = plateChars.length === MAX_LEN;
  const fullPlate = province + plateChars.join("");
  // 可确认：车牌位数完整(6或7)，或者完全清空（连省份也为空 = 未填）
  const isEmptyPlate = !province && plateChars.length === 0;
  const canConfirm = isEmptyPlate || !!(province && (plateChars.length === 6 || plateChars.length === MAX_LEN));

  const plateBg = isGreen ? GREEN_BG : BLUE_BG;
  const plateText = isGreen ? GREEN_TEXT : BLUE_TEXT;
  const borderColor = isGreen ? "#1a6b3a" : "#1a3fa8";

  useEffect(() => {
    if (!open) return;
    if (value && value.length >= 2) {
      const p = value[0];
      const rest = value.slice(1).split("");
      setProvince(p);
      setPlateChars(rest.slice(0, MAX_LEN));
      setStep("plate");
      setFocusIdx(Math.min(rest.length, MAX_LEN - 1));
    } else {
      setProvince("沪");
      setPlateChars([]);
      setStep("plate");
      setFocusIdx(0);
    }
  }, [open]);

  const handleSelectProvince = (p: string) => {
    setProvince(p);
    setPlateChars([]);
    setFocusIdx(0);
    setStep("plate");
  };

  const handleKey = (char: string) => {
    if (focusIdx >= MAX_LEN) return;
    const next = [...plateChars];
    next[focusIdx] = char;
    setPlateChars(next.slice(0, focusIdx + 1));
    if (focusIdx < MAX_LEN - 1) setFocusIdx(focusIdx + 1);
  };

  const handleDelete = () => {
    if (plateChars.length === 0) return;
    const next = [...plateChars];
    const delIdx = Math.min(focusIdx, next.length - 1);
    next.splice(delIdx, 1);
    setPlateChars(next);
    setFocusIdx(Math.max(0, delIdx === 0 ? 0 : delIdx - (focusIdx >= next.length ? 1 : 0)));
  };

  const handleClear = () => {
    setProvince("");
    setPlateChars([]);
    setFocusIdx(0);
  };

  const handleCellClick = (idx: number) => {
    if (idx <= plateChars.length) setFocusIdx(idx);
  };

  if (!open) return null;

  // 车牌高度固定，字符高度撑满
  const PLATE_H = 64;   // 车牌总高度 px
  const CHAR_H = 54;    // 字符高度（撑满）
  const PROVINCE_W = 44;
  const CHAR_W = 36;    // 省份后每个字符宽度
  const DOT_W = 10;     // 圆点区域宽度

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: "92vh", minHeight: "70vh" }}>

        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          {step === "plate" ? (
            <button
              type="button"
              onClick={() => setStep("province")}
              className="flex items-center gap-1 text-sm text-gray-500 active:text-gray-700"
            >
              <ChevronLeft className="w-4 h-4" />
              重选省份
            </button>
          ) : (
            <div className="w-16" />
          )}
          <span className="text-base font-semibold text-gray-800">输入车牌号</span>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 active:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 车牌预览区 */}
        <div className="flex flex-col items-center px-4 pt-5 pb-3">
          {/* 车牌主体：横条，字符撑满，自适应屏幕宽度 */}
          <div style={{ width: "100%", overflowX: "auto", display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: PLATE_H,
              background: plateBg,
              border: `3px solid ${borderColor}`,
              borderRadius: 6,
              padding: "0 14px",
              boxShadow: `0 0 0 2px ${plateText === BLUE_TEXT ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)"} inset, 0 6px 24px rgba(0,0,0,0.45)`,
              transition: "background 0.3s, border-color 0.3s",
              gap: 1,
              maxWidth: "100%",
            }}
          >
            {/* 省份格 */}
            <button
              type="button"
              onClick={() => setStep("province")}
              style={{
                width: PROVINCE_W,
                height: CHAR_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: step === "province" ? "rgba(255,255,255,0.18)" : "transparent",
                border: step === "province" ? `2px solid ${plateText}` : "2px solid transparent",
                borderRadius: 3,
                color: plateText,
                fontFamily: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
                fontWeight: 900,
                fontSize: 34,
                lineHeight: 1,
                flexShrink: 0,
                padding: 0,
              }}
            >
              {province || (
                <span style={{ color: `${plateText}35`, fontSize: 16, fontWeight: 400 }}>省</span>
              )}
            </button>

            {/* 后续7个字符格 */}
            {Array.from({ length: MAX_LEN }).map((_, i) => {
              const char = plateChars[i] || "";
              const isFocused = step === "plate" && focusIdx === i;
              const isGreenExtra = i === 6;
              const isPlaceholder = !char && !isFocused;

              return (
                <React.Fragment key={i}>
                {i === 1 && (
                  <div key="dot" style={{
                    width: DOT_W,
                    height: DOT_W,
                    borderRadius: "50%",
                    background: plateText,
                    opacity: 0.75,
                    flexShrink: 0,
                    margin: "0 1px",
                  }} />
                )}
                <button
                  key={i}
                  type="button"
                  onClick={() => { setStep("plate"); handleCellClick(i); }}
                  style={{
                    width: CHAR_W,
                    height: CHAR_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isFocused ? "rgba(255,255,255,0.18)" : "transparent",
                    border: isFocused
                      ? `2px solid ${plateText}`
                      : isGreenExtra && !isGreen
                        ? `1.5px dashed ${plateText}30`
                        : "2px solid transparent",
                    borderRadius: 3,
                    color: plateText,
                    // 英文数字用 Arial Black，接近 DIN1451 标准
                    fontFamily: "'Arial Black', 'Arial', 'Helvetica Neue', sans-serif",
                    fontWeight: 900,
                    fontSize: 34,
                    lineHeight: 1,
                    letterSpacing: -1,
                    flexShrink: 0,
                    opacity: isGreenExtra && !isGreen && !char ? 0.25 : 1,
                    transition: "all 0.15s",
                    padding: 0,
                  }}
                >
                  {char ? (
                    char
                  ) : isFocused ? (
                    <span style={{
                      display: "inline-block",
                      width: 3,
                      height: 36,
                      background: plateText,
                      borderRadius: 2,
                      animation: "plateBlink 1s step-end infinite",
                    }} />
                  ) : isPlaceholder && isGreenExtra ? (
                    <span style={{ color: `${plateText}20`, fontSize: 11, fontWeight: 400, fontFamily: "sans-serif" }}>新</span>
                  ) : (
                    <span style={{ color: `${plateText}20`, fontSize: 28, fontWeight: 900 }}>_</span>
                  )}
                </button>
                </React.Fragment>
              );
            })}

          </div>
          </div>

          {/* 牌型提示 */}
          <div className="mt-2.5 text-xs text-center" style={{ minHeight: 18 }}>
            {!province && <span className="text-gray-400">请先选择省份</span>}
            {province && plateChars.length === 0 && <span className="text-gray-400">请输入城市代码（字母）</span>}
            {province && plateChars.length > 0 && plateChars.length < 6 && (
              <span className="text-gray-400">还需输入 {6 - plateChars.length} 位</span>
            )}
            {province && plateChars.length === 6 && (
              <span style={{ color: BLUE_BG, fontWeight: 600 }}>✓ 蓝牌 — 可继续输第7位切换新能源绿牌</span>
            )}
            {province && plateChars.length === MAX_LEN && (
              <span style={{ color: "#1a8a45", fontWeight: 600 }}>✓ 新能源绿牌</span>
            )}
          </div>
        </div>

        {/* 省份选择 或 键盘 */}
        {step === "province" ? (
          <div className="px-4 pb-5 overflow-y-auto flex-1">
            <div className="text-xs text-gray-400 mb-2 px-0.5">选择省份 / 直辖市 / 自治区</div>
            <div className="grid grid-cols-6 gap-2">
              {PROVINCE_LIST.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSelectProvince(p)}
                  className="h-14 rounded-xl text-xl font-bold transition-all active:scale-95"
                  style={province === p
                    ? { background: ACCENT, color: "#fff", boxShadow: `0 2px 6px ${ACCENT}55` }
                    : { background: ACCENT_LIGHT, color: "#1E3A5F", border: `1px solid ${ACCENT_BORDER}` }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
          <div className="px-3 pt-2 overflow-y-auto flex-1">
            <div className="text-xs text-gray-400 mb-2 px-0.5">
              {focusIdx === 0
                ? "第2位：城市代码（字母）"
                : focusIdx === 6
                  ? <span>第8位：<span style={{ color: "#1a8a45", fontWeight: 600 }}>新能源专用位</span></span>
                  : `第${focusIdx + 2}位：字母或数字`}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(focusIdx === 0 ? LETTER_KEYS : MIXED_KEYS).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKey(k)}
                  className="h-14 rounded-xl text-xl font-bold transition-all active:scale-95"
                  style={plateChars[focusIdx] === k
                    ? { background: ACCENT, color: "#fff" }
                    : { background: ACCENT_LIGHT, color: "#1E3A5F", border: `1px solid ${ACCENT_BORDER}` }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          {/* 底部按钮栏：删除 / 清空 / 确认，随内容滚动 */}
          <div className="px-3 pt-3 pb-6 border-t border-gray-100 bg-white flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={plateChars.length === 0}
                className="flex-1 h-12 rounded-xl text-sm font-medium flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: "#F3F4F6",
                  color: plateChars.length === 0 ? "#D1D5DB" : "#374151",
                }}
              >
                删除
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isEmptyPlate}
                className="flex-1 h-12 rounded-xl text-sm font-medium flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: "#FFF1E8",
                  color: isEmptyPlate ? "#E8CBB6" : "#E07B39",
                }}
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => canConfirm && onConfirm(isEmptyPlate ? "" : fullPlate)}
                disabled={!canConfirm}
                className="flex-[2] h-12 rounded-xl text-sm font-semibold flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: canConfirm ? (isGreen ? "#1a8a45" : ACCENT) : "#E5E7EB",
                  color: canConfirm ? "#fff" : "#9CA3AF",
                  boxShadow: canConfirm ? `0 2px 8px ${isGreen ? "#1a8a45" : ACCENT}44` : "none",
                }}
              >
                确认
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes plateBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
