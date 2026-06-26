/**
 * 牙伴 - 发票开票信息编辑弹窗
 * 支持最多3条开票信息，每条包含：公司名称（必填）、发票抬头（必填）、邮箱（选填）、手机（选填）
 */
import React, { useState, useEffect } from "react";
import { X, ChevronLeft, PlusCircle, Trash2 } from "lucide-react";

const ACCENT = "#1E88D6";

export interface InvoiceInfo {
  company: string;   // 公司名称（必填）
  title: string;     // 发票抬头（必填）
  email: string;     // 邮箱（选填）
  mobile: string;    // 手机（选填）
}

export const EMPTY_INVOICE: InvoiceInfo = { company: "", title: "", email: "", mobile: "" };

interface Props {
  open: boolean;
  /** 当前正在编辑第几条（1/2/3） */
  index: 1 | 2 | 3;
  value: InvoiceInfo;
  /** 顾客手机号，用于自动填充 */
  customerMobile?: string;
  onClose: () => void;
  onConfirm: (info: InvoiceInfo) => void;
}

export default function InvoicePicker({ open, index, value, customerMobile, onClose, onConfirm }: Props) {
  const [form, setForm] = useState<InvoiceInfo>(EMPTY_INVOICE);

  useEffect(() => {
    if (!open) return;
    setForm({
      company: value.company || "",
      title: value.title || "",
      email: value.email || "",
      mobile: value.mobile || (customerMobile || ""),
    });
  }, [open]);

  if (!open) return null;

  const setField = (key: keyof InvoiceInfo, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const canConfirm = form.company.trim() && form.title.trim();

  const inputCls =
    "w-full h-10 px-3 rounded-lg bg-gray-50 border border-[#D6E6F5] text-sm text-gray-800 outline-none placeholder:text-gray-300 focus:bg-white focus:border-[#1E88D6] transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="w-10" />
          <span className="text-base font-semibold text-gray-800">
            开票信息{index > 1 ? `（第${index}条）` : ""}
          </span>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 active:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 公司名称（必填） */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">
              公司名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="请输入公司名称"
              value={form.company}
              onChange={(e) => setField("company", e.target.value)}
            />
          </div>

          {/* 发票抬头（必填） */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">
              发票抬头 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="请输入发票抬头"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </div>

          {/* 邮箱（选填） */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">邮箱</label>
            <input
              type="email"
              className={inputCls}
              placeholder="选填"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </div>

          {/* 手机（选填，自动读取顾客手机） */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">手机号码</label>
            <input
              type="tel"
              className={inputCls}
              placeholder="选填"
              value={form.mobile}
              onChange={(e) => setField("mobile", e.target.value)}
            />
          </div>
        </div>

        {/* 底部确认按钮 */}
        <div className="px-5 pb-8 pt-3 border-t border-gray-100">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (canConfirm) onConfirm(form);
            }}
            className="w-full h-12 rounded-xl text-base font-semibold text-white transition-opacity"
            style={{ background: canConfirm ? ACCENT : "#B0C4D8", opacity: canConfirm ? 1 : 0.7 }}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
