/**
 * 牙伴 - 发票开票信息编辑（全屏页面）
 * 风格与全站一致：蓝色渐变顶栏、蓝色点缀、大字体输入框
 * 邮箱输入支持智能后缀提示
 */
import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import type { InvoiceInfo } from "./invoice-types";
import { EMPTY_INVOICE } from "./invoice-types";

const SKY_D = "#1E88D6";
const SKY = "#3D9FD6";
const ACCENT = "#1E88D6";
const ACCENT_LIGHT = "#E8F4FD";
const ACCENT_BORDER = "#D6E6F5";

const EMAIL_SUFFIXES = [
  "@qq.com",
  "@163.com",
  "@126.com",
  "@gmail.com",
  "@outlook.com",
  "@sina.com",
  "@hotmail.com",
  "@foxmail.com",
];

interface Props {
  open: boolean;
  index: 1 | 2 | 3;
  value: InvoiceInfo;
  customerMobile?: string;
  onClose: () => void;
  onConfirm: (info: InvoiceInfo) => void;
}

export default function InvoicePicker({ open, index, value, customerMobile, onClose, onConfirm }: Props) {
  const [form, setForm] = useState<InvoiceInfo>(EMPTY_INVOICE);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const emailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      company: value.company || "",
      title: value.title || "",
      taxNo: value.taxNo || "",
      email: value.email || "",
      mobile: value.mobile || (customerMobile || ""),
    });
    setEmailSuggestions([]);
  }, [open]);

  useEffect(() => {
    if (!emailSuggestions.length) return;
    const handler = (e: MouseEvent) => {
      if (emailRef.current && !emailRef.current.contains(e.target as Node)) {
        setEmailSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emailSuggestions]);

  if (!open) return null;

  const setField = (key: keyof InvoiceInfo, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleEmailChange = (val: string) => {
    setField("email", val);
    const atIdx = val.indexOf("@");
    if (atIdx === -1) {
      if (val.trim()) {
        setEmailSuggestions(EMAIL_SUFFIXES.map((s) => val + s));
      } else {
        setEmailSuggestions([]);
      }
    } else {
      const prefix = val.slice(0, atIdx);
      const suffix = val.slice(atIdx);
      const filtered = EMAIL_SUFFIXES.filter((s) => s.startsWith(suffix) && s !== suffix);
      setEmailSuggestions(filtered.length ? filtered.map((s) => prefix + s) : []);
    }
  };

  const isEmpty = !form.title && !form.taxNo && !form.email && !form.mobile;
  const canConfirm = form.title.trim();

  const inputCls =
    "w-full h-14 px-4 rounded-md bg-white border border-[#D6E6F5] text-lg text-gray-800 outline-none placeholder:text-gray-300 focus:border-[#1E88D6] focus:shadow-[0_0_0_3px_rgba(30,136,214,0.12)] transition-all";

  const inputSmCls =
    "w-full h-8 px-3 rounded bg-white border border-[#D6E6F5] text-sm text-gray-800 outline-none placeholder:text-gray-300 focus:border-[#1E88D6] focus:shadow-[0_0_0_2px_rgba(30,136,214,0.10)] transition-all";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#F4F8FC" }}
    >
      {/* 蓝色渐变顶栏（与全站统一） */}
      <div
        style={{
          background: `linear-gradient(90deg, ${SKY_D}, ${SKY})`,
          color: "#fff",
          padding: "calc(env(safe-area-inset-top) + 14px) 12px 12px",
          flexShrink: 0,
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 28 }}>
          {/* 返回按钮 */}
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, border: "none", background: "transparent", color: "#fff", cursor: "pointer", padding: 0,
            }}
          >
            <ChevronLeft size={24} />
          </button>

          {/* 标题 */}
          <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
            开票信息{index > 1 ? `（第${index}条）` : ""}
          </span>

          <div style={{ width: 60 }} />
        </div>
      </div>

      {/* 表单内容区（含底部按钮，随内容滚动） */}
      <div className="flex-1 overflow-y-auto px-4 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>

        {/* 必填区块 */}
        <div className="bg-white rounded shadow-sm overflow-hidden mb-4">
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: ACCENT_LIGHT, borderBottom: `1px solid ${ACCENT_BORDER}` }}
          >
            <div style={{ width: 3, height: 14, background: ACCENT, borderRadius: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>必填信息</span>
          </div>

          {/* 发票抬头 */}
          <div className="px-4 pt-4 pb-3">
            <label className="flex items-center gap-1.5 text-base font-medium text-gray-600 mb-2">
              发票抬头
              <span className="text-red-400 text-xs">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="请输入发票抬头"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </div>

          {/* 税号 */}
          <div className="px-4 pb-4">
            <label className="flex items-center gap-1.5 text-base font-medium text-gray-600 mb-2">
              税号
              <span className="text-red-400 text-xs">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="请输入纳税人识别号"
              value={form.taxNo}
              onChange={(e) => setField("taxNo", e.target.value)}
            />
          </div>
        </div>

        {/* 选填区块 */}
        <div className="bg-white rounded shadow-sm overflow-hidden">
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: "#F9FAFB", borderBottom: "1px solid #F0F0F0" }}
          >
            <div style={{ width: 3, height: 14, background: "#C0C0C0", borderRadius: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>选填信息</span>
          </div>

          {/* 邮箱 */}
          <div className="px-4 pt-3 pb-2" ref={emailRef} style={{ position: "relative" }}>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-500 mb-1">
              <Mail size={13} style={{ color: "#9CA3AF" }} />
              邮箱
            </label>
            <input
              type="email"
              className={inputSmCls}
              placeholder="输入邮箱，自动提示后缀"
              value={form.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              autoComplete="off"
            />
            {emailSuggestions.length > 0 && (
              <div
                style={{
                  position: "absolute", left: 16, right: 16, top: "100%", marginTop: 4,
                  background: "#fff", border: `1px solid ${ACCENT_BORDER}`,
                  borderRadius: 7, boxShadow: "0 4px 20px rgba(30,136,214,0.12)",
                  zIndex: 10, overflow: "hidden",
                }}
              >
                {emailSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="w-full text-left px-4 py-3 text-base text-gray-700 border-b border-gray-50 last:border-0"
                    style={{ background: "transparent" }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setField("email", s);
                      setEmailSuggestions([]);
                    }}
                  >
                    <span style={{ color: "#9CA3AF" }}>{s.slice(0, s.indexOf("@"))}</span>
                    <span style={{ color: ACCENT, fontWeight: 600 }}>{s.slice(s.indexOf("@"))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 手机 */}
          <div className="px-4 pb-3">
            <label className="flex items-center gap-1 text-sm font-medium text-gray-500 mb-1">
              <Phone size={13} style={{ color: "#9CA3AF" }} />
              手机号码
            </label>
            <input
              type="tel"
              className={inputSmCls}
              placeholder="选填"
              value={form.mobile}
              onChange={(e) => setField("mobile", e.target.value)}
            />
          </div>
        </div>

        {/* 底部按钮栏：删除 / 清空 / 完成，随内容滚动 */}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, title: prev.title.slice(0, -1) }))}
            disabled={isEmpty}
            className="flex-1 h-12 rounded-md text-sm font-medium flex items-center justify-center transition-all active:scale-95"
            style={{
              background: isEmpty ? "#F3F4F6" : "#EF4444",
              color: isEmpty ? "#D1D5DB" : "#fff",
            }}
          >
            删除
          </button>
          <button
            type="button"
            onClick={() => setForm(EMPTY_INVOICE)}
            disabled={isEmpty}
            className="flex-1 h-12 rounded-md text-sm font-medium flex items-center justify-center transition-all active:scale-95"
            style={{
              background: "#F3F4F6",
              color: isEmpty ? "#D1D5DB" : "#374151",
            }}
          >
            清空
          </button>
          <button
            type="button"
            onClick={() => { if (canConfirm) onConfirm(form); }}
            disabled={!canConfirm}
            className="flex-[2] h-12 rounded-md text-sm font-semibold flex items-center justify-center transition-all active:scale-95"
            style={{
              background: canConfirm ? ACCENT : "#E5E7EB",
              color: canConfirm ? "#fff" : "#9CA3AF",
              boxShadow: canConfirm ? `0 2px 8px ${ACCENT}44` : "none",
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
