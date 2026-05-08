/**
 * MemoLedgerPage.tsx - AD型定制账本：永忆
 * 两级分类：第1级大类 → 第2级子类（预设+自定义）→ 字段内容
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Search,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  Settings,
  RefreshCw,
  MapPin,
  KeyRound,
  Landmark,
  Globe,
  Building2,
  StickyNote,
  ChevronRight,
  ClipboardList,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ===== 第1级大类 =====
const CATEGORIES = [
  { key: "all",     label: "全部",   icon: StickyNote, color: "#757575" },
  { key: "bank",    label: "银行账号", icon: Landmark,   color: "#43A047" },
  { key: "account", label: "账号密码", icon: KeyRound,   color: "#1E88E5" },
  { key: "address", label: "快递地址", icon: MapPin,     color: "#E53935" },
  { key: "website", label: "公司",   icon: Building2,  color: "#8E24AA" },
  { key: "other",   label: "其他",   icon: StickyNote,  color: "#FB8C00" },
];

// ===== 第2级子类预设 =====
const SUB_CATEGORIES: Record<string, string[]> = {
  bank: ["工商银行", "建设银行", "招商银行", "农业银行", "中国银行", "交通银行", "邮储银行", "浦发银行", "民生银行", "光大银行", "自定义"],
  account: ["苹果ID", "华为ID", "微软账号", "谷歌账号", "淘宝/天猫", "京东", "美团", "拼多多", "微信", "支付宝", "抖音", "快手", "欧易", "自定义"],
  address: ["家庭地址", "公司地址", "常用地址1", "常用地址2", "自定义"],
  website: [], // 公司分类直接进入字段填写，无需选子类
  other: ["证件信息", "车牌/车险", "会员卡", "WiFi密码", "自定义"],
};

// ===== 每种大类的字段模板 =====
const FIELD_TEMPLATES: Record<string, Array<{ label: string; sensitive?: boolean }>> = {
  bank: [
    { label: "银行名称" },
    { label: "卡号" },
    { label: "姓名" },
    { label: "备注" },
  ],
  account: [
    { label: "账号/用户名" },
    { label: "密码", sensitive: true },
    { label: "备用邮箱" },
    { label: "手机号" },
  ],
  // 欧易专属模板（单账户4字段）
  account_ouyi: [
    { label: "手机号" },
    { label: "邮箱" },
    { label: "UID" },
    { label: "密码", sensitive: true },
  ],
  address: [
    { label: "收件人" },
    { label: "手机号" },
    { label: "省市区" },
    { label: "详细地址" },
    { label: "邮编" },
  ],
  website: [
    { label: "公司名称" },
  ],
  other: [
    { label: "内容" },
    { label: "说明" },
  ],
};

interface MemoField {
  label: string;
  value: string;
  sensitive?: boolean;
}

interface MemoItem {
  id: number;
  category: string;
  title: string;   // 格式："大类/子类" 或 "大类/自定义名称"
  fields: MemoField[];
  note?: string;
  createdAt: string;
}

// 从 title 解析子类名（title格式为 "子类名" 或 "子类名 - 备注"）
function getSubLabel(item: MemoItem): string {
  return item.title || "";
}

// ===== 复制到剪贴板 =====
function copyText(text: string, label?: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`已复制${label ? `「${label}」` : ""}`, { duration: 1500 });
  }).catch(() => {
    toast.error("复制失败，请手动复制");
  });
}

// ===== 单条备忘录卡片 =====
function MemoCard({ item, onEdit, onDelete }: {
  item: MemoItem;
  onEdit: (item: MemoItem) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Set<number>>(new Set());
  const cat = CATEGORIES.find(c => c.key === item.category) || CATEGORIES[CATEGORIES.length - 1];
  const CatIcon = cat.icon;

  const toggleVisible = (idx: number) => {
    setVisibleFields(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const copyAll = () => {
    const text = item.fields.filter(f => f.value && f.label !== '__ACCOUNT_SEPARATOR__').map(f => `${f.label}：${f.value}`).join("\n");
    copyText(text, item.title);
  };

  // 账号密码分类：按分隔符分组展示多账户
  // 所有分类都用多条记录模式展示
  const isOuyi = true;
  const ouyiAccounts: MemoField[][] = [];
  {
    let cur: MemoField[] = [];
    for (const f of item.fields) {
      if (f.label === '__ACCOUNT_SEPARATOR__') {
        if (cur.length > 0) { ouyiAccounts.push(cur); cur = []; }
      } else {
        cur.push(f);
      }
    }
    if (cur.length > 0) ouyiAccounts.push(cur);
  }

  const filledCount = ouyiAccounts.length > 1
    ? ouyiAccounts.length
    : item.fields.filter(f => f.value && f.label !== '__ACCOUNT_SEPARATOR__').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      {/* 卡片头部 */}
      <div className="flex items-center px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{getSubLabel(item)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs mr-1" style={{ backgroundColor: cat.color + "18", color: cat.color }}>
              {cat.label}
            </span>
            {ouyiAccounts.length > 1 ? `${filledCount} 条记录` : `${filledCount} 个字段`}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={e => { e.stopPropagation(); copyAll(); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="复制全部">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={e => { e.stopPropagation(); onEdit(item); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(item.id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-3 pt-2">
          {isOuyi ? (
            // 所有分类多条记录分组展示
            <div className="space-y-0">
              {ouyiAccounts.map((acct, acctIdx) => (
                <div key={acctIdx}>
                  {acctIdx > 0 && <div className="border-t border-gray-100 my-2" />}
                  {ouyiAccounts.length > 1 && <div className="text-xs text-gray-400 mb-1.5">第 {acctIdx + 1} 条</div>}
                  <div className="space-y-1.5">
                    {acct.filter(f => f.value && f.label !== '__NOTE__').map((field, fidx) => {
                      const globalIdx = item.fields.indexOf(field);
                      return (
                        <div key={fidx} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-16 flex-shrink-0">{field.label}</span>
                          <div className="flex-1 flex items-center gap-1 min-w-0">
                            {field.sensitive && !visibleFields.has(globalIdx) ? (
                              <span className="text-sm text-gray-600 tracking-widest">••••••••</span>
                            ) : (
                              <span className="text-sm text-gray-800 break-all">{field.value}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {field.sensitive && (
                              <button onClick={() => toggleVisible(globalIdx)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                                {visibleFields.has(globalIdx) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button onClick={() => copyText(field.value, field.label)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {/* 备注字段单独展示 */}
                    {acct.find(f => f.label === '__NOTE__' && f.value) && (
                      <div className="flex items-start gap-2 pt-0.5">
                        <span className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">备注</span>
                        <span className="text-xs text-gray-500 break-all">{acct.find(f => f.label === '__NOTE__')!.value}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // 普通字段展示
            <div className="space-y-2">
              {item.fields.filter(f => f.value && f.label !== '__ACCOUNT_SEPARATOR__').map((field, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-20 flex-shrink-0">{field.label}</span>
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    {field.sensitive && !visibleFields.has(idx) ? (
                      <span className="text-sm text-gray-600 tracking-widest">••••••••</span>
                    ) : (
                      <span className="text-sm text-gray-800 break-all">{field.value}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {field.sensitive && (
                      <button onClick={() => toggleVisible(idx)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                        {visibleFields.has(idx) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => copyText(field.value, field.label)} className="p-1 rounded hover:bg-gray-100 text-gray-400" title={`复制${field.label}`}>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {item.note && (
            <div className="pt-2 mt-2 border-t border-gray-50">
              <p className="text-xs text-gray-400">备注：{item.note}</p>
            </div>
          )}
          <div className="pt-1 flex gap-2">
            <button onClick={copyAll} className="flex items-center gap-1 text-xs text-[#D32F2F] hover:bg-red-50 px-2 py-1 rounded-lg">
              <Copy className="w-3 h-3" />
              复制全部字段
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 新建/编辑弹窗（两级分类） =====
function MemoFormDialog({ open, onClose, editItem, ledgerId, onSuccess }: {
  open: boolean;
  onClose: () => void;
  editItem?: MemoItem | null;
  ledgerId: number;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"cat" | "sub" | "fields">("cat");
  const [category, setCategory] = useState("bank");
  const [subLabel, setSubLabel] = useState("");
  const [customSub, setCustomSub] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [fields, setFields] = useState<MemoField[]>([]);
  const [note, setNote] = useState("");

  // 多记录模式：所有分类都支持多条记录
  const [ouyiAccounts, setOuyiAccounts] = useState<MemoField[][]>([]);
  const isOuyiMode = true; // 所有分类都用多记录模式

  // 根据分类生成对应的字段模板
  const newOuyiAccount = (): MemoField[] => {
    if (category === 'account' && subLabel === '欧易') {
      return [
        { label: '手机号', value: '' },
        { label: '邮箱', value: '' },
        { label: 'UID', value: '' },
        { label: '密码', value: '', sensitive: true },
        { label: '__NOTE__', value: '' },
      ];
    }
    if (category === 'account') {
      return [
        { label: '账号/用户名', value: '' },
        { label: '密码', value: '', sensitive: true },
        { label: '备用邮箱', value: '' },
        { label: '手机号', value: '' },
        { label: '__NOTE__', value: '' },
      ];
    }
    if (category === 'bank') {
      return [
        { label: '银行名称', value: '' },
        { label: '卡号', value: '' },
        { label: '姓名', value: '' },
        { label: '备注', value: '' },
      ];
    }
    if (category === 'address') {
      return [
        { label: '收件人', value: '' },
        { label: '手机号', value: '' },
        { label: '省市区', value: '' },
        { label: '详细地址', value: '' },
        { label: '邮编', value: '' },
      ];
    }
    if (category === 'website') {
      return [
        { label: '网址', value: '' },
        { label: '用户名', value: '' },
        { label: '密码', value: '', sensitive: true },
      ];
    }
    // other 及其他
    return [
      { label: '内容', value: '' },
    ];
  };

  const addOuyiAccount = () => setOuyiAccounts(prev => [...prev, newOuyiAccount()]);
  const removeOuyiAccount = (idx: number) => setOuyiAccounts(prev => prev.filter((_, i) => i !== idx));
  const updateOuyiField = (acctIdx: number, fieldIdx: number, key: keyof MemoField, value: any) =>
    setOuyiAccounts(prev => prev.map((acct, ai) =>
      ai === acctIdx ? acct.map((f, fi) => fi === fieldIdx ? { ...f, [key]: value } : f) : acct
    ));
  // 在指定账户末尾（__NOTE__之前）添加自定义字段
  const addOuyiField = (acctIdx: number) => setOuyiAccounts(prev => prev.map((acct, ai) => {
    if (ai !== acctIdx) return acct;
    const noteIdx = acct.findIndex(f => f.label === '__NOTE__');
    // 计算已有自定义字段数量，生成不重复的默认标签名
    const customCount = acct.filter(f => f.label !== '__NOTE__' && f.label !== '账号/用户名' && f.label !== '密码' && f.label !== '备用邮箱' && f.label !== '手机号' && f.label !== '手机号' && f.label !== 'UID' && f.label !== '邮箱').length;
    const newField: MemoField = { label: `备注${customCount + 1}`, value: '', sensitive: false };
    if (noteIdx >= 0) {
      return [...acct.slice(0, noteIdx), newField, ...acct.slice(noteIdx)];
    }
    return [...acct, newField];
  }));
  // 删除指定账户的指定字段（不允许删除账号/用户名、密码、__NOTE__）
  const removeOuyiField = (acctIdx: number, fieldIdx: number) => setOuyiAccounts(prev => prev.map((acct, ai) => {
    if (ai !== acctIdx) return acct;
    return acct.filter((_, fi) => fi !== fieldIdx);
  }));

  // 欧易 fields 序列化：账户间插入分隔符
  const serializeOuyiFields = (accounts: MemoField[][]): MemoField[] => {
    const result: MemoField[] = [];
    accounts.forEach((acct, idx) => {
      if (idx > 0) result.push({ label: '__ACCOUNT_SEPARATOR__', value: '' });
      result.push(...acct);
    });
    return result;
  };

  // 欧易 fields 反序列化
  const deserializeOuyiFields = (fs: MemoField[]): MemoField[][] => {
    const accounts: MemoField[][] = [];
    let cur: MemoField[] = [];
    for (const f of fs) {
      if (f.label === '__ACCOUNT_SEPARATOR__') {
        if (cur.length > 0) { accounts.push(cur); cur = []; }
      } else {
        cur.push(f);
      }
    }
    if (cur.length > 0) accounts.push(cur);
    return accounts.length > 0 ? accounts : [newOuyiAccount()];
  };

  // 每次弹窗打开时，根据 editItem 重置所有状态（修复分类不持久化问题）
  useEffect(() => {
    if (!open) return;
    if (editItem) {
      const cat = editItem.category || "bank";
      const sub = editItem.title || "";
      const isCustomSub = sub && SUB_CATEGORIES[cat] && !SUB_CATEGORIES[cat].slice(0, -1).includes(sub);
      setStep("fields");
      setCategory(cat);
      setSubLabel(sub);
      setCustomSub(isCustomSub ? sub : "");
      setIsCustom(false);
      setNote(editItem.note || "");
      // 所有分类都用 deserializeOuyiFields 反序列化为多条记录
      setOuyiAccounts(deserializeOuyiFields(editItem.fields || []));
      setFields([]);
    } else {
      setStep("cat");
      setCategory("bank");
      setSubLabel("");
      setCustomSub("");
      setIsCustom(false);
      setFields([]);
      setOuyiAccounts([]);
      setNote("");
    }
  }, [open, editItem]);
  const utils = trpc.useUtils();

  const catObj = CATEGORIES.find(c => c.key === category)!;
  const subList = SUB_CATEGORIES[category] || ["自定义"];

  const handleSelectCat = (key: string) => {
    setCategory(key);
    setSubLabel("");
    setCustomSub("");
    setIsCustom(false);
    setFields([]);
    // 银行账号、公司分类：直接进入字段填写界面，跳过子类选择
    if (key === 'bank') {
      // bank 分类直接进入字段填写，初始化一条记录
      setOuyiAccounts([[...FIELD_TEMPLATES['bank'].map(f => ({ ...f, value: '' }))]]);
      setStep("fields");
    } else if (key === 'website') {
      // 公司分类：直接进入字段填写，subLabel 为空（保存时用公司名称字段值作为标题）
      setSubLabel("");
      setOuyiAccounts([[...FIELD_TEMPLATES['website'].map(f => ({ ...f, value: '' }))]]);
      setStep("fields");
    } else {
      setOuyiAccounts([]);
      setStep("sub");
    }
  };

  const handleSelectSub = (sub: string) => {
    if (sub === "自定义") {
      setIsCustom(true);
      setSubLabel("");
    } else {
      setIsCustom(false);
      setSubLabel(sub);
      // 所有分类都初始化一条记录（用 newOuyiAccount 根据 category 返回对应模板）
      setOuyiAccounts([newOuyiAccount()]);
      setFields([]);
      setStep("fields");
    }
  };

  const handleConfirmCustom = () => {
    if (!customSub.trim()) { toast.error("请输入名称"); return; }
    setSubLabel(customSub.trim());
    // 所有分类都初始化一条记录
    setOuyiAccounts([newOuyiAccount()]);
    setFields([]);
    setStep("fields");
  };

  const createMutation = trpc.ledger.createMemoItem.useMutation({
    onSuccess: () => { toast.success("已保存"); utils.ledger.getMemoItems.invalidate({ ledgerId }); onSuccess(); onClose(); },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.ledger.updateMemoItem.useMutation({
    onSuccess: () => { toast.success("已更新"); utils.ledger.getMemoItems.invalidate({ ledgerId }); onSuccess(); onClose(); },
    onError: e => toast.error(e.message),
  });

  const handleSave = () => {
    // 所有分类统一用多记录模式
    let effectiveSubLabel = subLabel;
    if (category === 'bank') {
      // 银行账号：用第一条记录的银行名称作标题
      const firstRecord = ouyiAccounts[0];
      const bankNameField = firstRecord?.find(f => f.label === '银行名称');
      effectiveSubLabel = bankNameField?.value?.trim() || '银行账号';
    } else if (category === 'website') {
      // 公司：用第一条记录的公司名称作标题
      const firstRecord = ouyiAccounts[0];
      const companyNameField = firstRecord?.find(f => f.label === '公司名称');
      effectiveSubLabel = companyNameField?.value?.trim() || subLabel || '公司';
    }
    if (!effectiveSubLabel.trim()) { toast.error("请先填写公司名称"); return; }
    // 所有分类都用 serializeOuyiFields 序列化
    const finalFields = serializeOuyiFields(ouyiAccounts);
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ledgerId, category, title: effectiveSubLabel, fields: finalFields, note: note.trim() || undefined });
    } else {
      createMutation.mutate({ ledgerId, category, title: effectiveSubLabel, fields: finalFields, note: note.trim() || undefined });
    }
  };

  const addField = () => setFields(prev => [...prev, { label: "字段", value: "", sensitive: false }]);
  const removeField = (idx: number) => setFields(prev => prev.filter((_, i) => i !== idx));
  const updateField = (idx: number, key: keyof MemoField, value: any) =>
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogTitle>{editItem ? "编辑备忘" : "新建备忘"}</DialogTitle>

        {/* ===== STEP 1: 选大类 ===== */}
        {step === "cat" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">选择分类</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.filter(c => c.key !== "all").map(cat => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => handleSelectCat(cat.key)}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 bg-white text-left"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + "18" }}>
                      <Icon className="w-4 h-4" style={{ color: cat.color }} />
                    </div>
                    <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== STEP 2: 选子类 ===== */}
        {step === "sub" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("cat")} className="p-1 -ml-1 text-gray-400 hover:text-gray-600">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: catObj.color + "18" }}>
                  <catObj.icon className="w-3.5 h-3.5" style={{ color: catObj.color }} />
                </div>
                <span className="text-sm font-medium" style={{ color: catObj.color }}>{catObj.label}</span>
              </div>
              <span className="text-sm text-gray-400">/ 选择具体类型</span>
            </div>

            {!isCustom ? (
              <div className="flex flex-wrap gap-2">
                {subList.map(sub => (
                  <button
                    key={sub}
                    onClick={() => handleSelectSub(sub)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      sub === "自定义"
                        ? "border-dashed border-gray-300 text-gray-500 hover:border-gray-400"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {sub === "自定义" ? "+ 自定义" : sub}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  {category === 'bank' ? '输入银行名称' : '输入自定义名称'}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={customSub}
                    onChange={e => setCustomSub(e.target.value)}
                    placeholder={category === 'bank' ? '如：招商银行、工商银行...' : `如：${catObj.label}名称...`}
                    autoFocus
                    onKeyDown={e => e.key === "Enter" && handleConfirmCustom()}
                  />
                  <Button onClick={handleConfirmCustom} className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white flex-shrink-0">确认</Button>
                </div>
                {category !== 'bank' && (
                  <button onClick={() => setIsCustom(false)} className="text-xs text-gray-400 hover:text-gray-600">← 返回预设列表</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 3: 填写字段 ===== */}
        {step === "fields" && (
          <div className="space-y-4">
            {/* 面包屑 */}
            <div className="flex items-center gap-1.5 text-sm">
              {!editItem && (
                <button onClick={() => setStep(category === 'bank' || category === 'website' ? 'cat' : 'sub')} className="text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: catObj.color + "18" }}>
                <catObj.icon className="w-3.5 h-3.5" style={{ color: catObj.color }} />
                <span className="text-xs font-medium" style={{ color: catObj.color }}>{catObj.label}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-sm font-medium text-gray-800">
                {category === 'website'
                  ? (ouyiAccounts[0]?.find(f => f.label === '公司名称')?.value?.trim() || '新建公司')
                  : (subLabel || catObj.label)
                }
              </span>
            </div>

            {/* 欧易多账户 UI */}
            {isOuyiMode ? (
              <div className="space-y-0">
                {ouyiAccounts.map((acct, acctIdx) => (
                  <div key={acctIdx}>
                    {acctIdx > 0 && <div className="border-t border-gray-100 my-3" />}
                    {ouyiAccounts.length > 1 && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">第 {acctIdx + 1} 条</span>
                        <button onClick={() => removeOuyiAccount(acctIdx)} className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50">
                          删除此条
                        </button>
                      </div>
                    )}
                    <div className="space-y-2">
                      {acct.map((field, fidx) => {
                        // account 分类：前两个字段不可删除；其他分类：所有字段都可删除
                        const isFixedField = category === 'account' && (fidx === 0 || field.label === '密码' || (fidx === 1 && acct[0]?.label !== '密码'));
                        const isDeletable = field.label !== '__NOTE__' && (category !== 'account' || fidx >= 2);
                        if (field.label === '__NOTE__') {
                          // 备注字段单独渲染（标签固定为"备注"）
                          return (
                            <div key={fidx} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-14 flex-shrink-0">备注</span>
                              <Input
                                value={field.value}
                                onChange={e => updateOuyiField(acctIdx, fidx, "value", e.target.value)}
                                placeholder="此账户的备注（可选）"
                                className="flex-1 text-sm"
                              />
                            </div>
                          );
                        }
                        return (
                          <div key={fidx} className="flex items-center gap-2">
                            {/* 标签名输入框（所有字段均可编辑标签） */}
                            <Input
                              value={field.label}
                              onChange={e => updateOuyiField(acctIdx, fidx, "label", e.target.value)}
                              placeholder="字段名"
                              className="w-20 flex-shrink-0 text-xs text-gray-500"
                            />
                            <Input
                              value={field.value}
                              onChange={e => updateOuyiField(acctIdx, fidx, "value", e.target.value)}
                              placeholder={`输入${field.label || '内容'}`}
                              type={field.sensitive ? "password" : "text"}
                              className="flex-1 text-sm"
                            />
                            {/* 密码显示/隐藏切换 */}
                            <button
                              onClick={() => updateOuyiField(acctIdx, fidx, "sensitive", !field.sensitive)}
                              className={`p-1.5 rounded-lg flex-shrink-0 ${field.sensitive ? 'text-[#D32F2F] bg-red-50' : 'text-gray-300 hover:bg-gray-100'}`}
                              title={field.sensitive ? "取消隐藏" : "设为隐藏（密码类）"}
                            >
                              {field.sensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            {/* 删除按钮（前两个固定字段不可删除） */}
                            {isDeletable ? (
                              <button
                                onClick={() => removeOuyiField(acctIdx, fidx)}
                                className="p-1.5 rounded-lg flex-shrink-0 text-gray-300 hover:text-red-500 hover:bg-red-50"
                                title="删除此字段"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            ) : (
                              <div className="w-7 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                      {/* 在每个账户下方添加字段按钮 */}
                      <button
                        onClick={() => addOuyiField(acctIdx)}
                        className="flex items-center gap-1 text-xs text-[#D32F2F] hover:bg-red-50 px-2 py-1 rounded-lg mt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        添加字段
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-3">
                  <button
                    onClick={addOuyiAccount}
                    className="flex items-center gap-1.5 text-sm text-[#D32F2F] hover:bg-red-50 px-3 py-2 rounded-lg w-full justify-center border border-dashed border-red-200"
                  >
                    <Plus className="w-4 h-4" />
                    {category === 'bank' ? '添加银行卡' : category === 'address' ? '添加地址' : category === 'website' ? '添加网站' : subLabel === '欧易' ? '添加欧易账户' : '添加账号'}
                  </button>
                </div>
              </div>
            ) : (
              /* 普通字段列表 */
              <div className="space-y-2">
                <label className="text-sm text-gray-600">字段内容</label>
                {fields.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={field.label}
                      onChange={e => updateField(idx, "label", e.target.value)}
                      placeholder="字段名"
                      className="w-24 flex-shrink-0 text-sm"
                    />
                    <Input
                      value={field.value}
                      onChange={e => updateField(idx, "value", e.target.value)}
                      placeholder="内容"
                      type={field.sensitive ? "password" : "text"}
                      className="flex-1 text-sm"
                    />
                    <button
                      onClick={() => updateField(idx, "sensitive", !field.sensitive)}
                      className={`p-1.5 rounded-lg flex-shrink-0 ${field.sensitive ? "text-[#D32F2F] bg-red-50" : "text-gray-400 hover:bg-gray-100"}`}
                      title={field.sensitive ? "取消隐藏" : "设为隐藏（密码类）"}
                    >
                      {field.sensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={() => removeField(idx)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={addField} className="flex items-center gap-1 text-sm text-[#D32F2F] hover:bg-red-50 px-2 py-1 rounded-lg">
                  <Plus className="w-4 h-4" />
                  添加字段
                </button>
              </div>
            )}

            {/* 备注：欧易模式下备注已内置到每个账户里，普通模式才显示整体备注 */}
            {!isOuyiMode && (
              <div className="space-y-1">
                <label className="text-sm text-gray-600">备注（可选）</label>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="附加说明..." />
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>取消</Button>
              <Button
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===== 提示词库分类 =====
const PROMPT_CATEGORIES = [
  { key: "image", label: "图片", color: "#1E88E5" },
  { key: "video", label: "视频", color: "#E53935" },
  { key: "ppt",   label: "PPT",  color: "#43A047" },
];

interface PromptItem {
  id: number;
  category: string;
  content: string;
  createdAt: string;
}

// ===== 主页面 =====
export default function MemoLedgerPage({ ledgerId, ledgerData, user }: {
  ledgerId: number;
  ledgerData: any;
  user: any;
}) {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MemoItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // 提示词模式
  const [promptMode, setPromptMode] = useState(false);
  const [activePromptCat, setActivePromptCat] = useState("image");
  const [selectedPrompts, setSelectedPrompts] = useState<Set<number>>(new Set());
  const [showPromptAdd, setShowPromptAdd] = useState(false);
  const [promptPasteText, setPromptPasteText] = useState("");
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.ledger.getMemoItems.useQuery({
    ledgerId,
    category: activeCategory === "all" ? undefined : activeCategory,
    keyword: keyword || undefined,
  });

  const { data: prompts = [], isLoading: promptsLoading } = trpc.ledger.getPrompts.useQuery(
    { ledgerId, category: activePromptCat },
    { enabled: promptMode, staleTime: 0, refetchOnMount: true }
  );

  const createPromptsMutation = trpc.ledger.createPrompts.useMutation({
    onSuccess: () => {
      toast.success("提示词已保存");
      setPromptPasteText("");
      setShowPromptAdd(false);
      utils.ledger.getPrompts.invalidate({ ledgerId });
    },
    onError: e => toast.error(e.message),
  });

  const deletePromptMutation = trpc.ledger.deletePrompt.useMutation({
    onSuccess: () => utils.ledger.getPrompts.invalidate({ ledgerId }),
    onError: e => toast.error(e.message),
  });

  const deleteMutation = trpc.ledger.deleteMemoItem.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.ledger.getMemoItems.invalidate({ ledgerId }); setDeleteId(null); },
    onError: e => toast.error(e.message),
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    items.forEach((item: any) => { counts[item.category] = (counts[item.category] || 0) + 1; });
    return counts;
  }, [items]);

  const togglePromptSelect = (id: number) => {
    setSelectedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copySelectedPrompts = () => {
    const selected = (prompts as PromptItem[]).filter(p => selectedPrompts.has(p.id));
    if (!selected.length) { toast.error("请先选择提示词"); return; }
    navigator.clipboard.writeText(selected.map(p => p.content).join("\n")).then(() => {
      toast.success(`已合并复制 ${selected.length} 条提示词`);
      setSelectedPrompts(new Set());
    });
  };

  const handleSavePrompts = () => {
    const lines = promptPasteText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (!lines.length) { toast.error("请输入至少一条提示词"); return; }
    createPromptsMutation.mutate({ ledgerId, category: activePromptCat, contents: lines });
  };

  const promptCatColor = PROMPT_CATEGORIES.find(c => c.key === activePromptCat)?.color || "#1E88E5";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="text-white sticky top-0 z-10" style={{ backgroundColor: promptMode ? promptCatColor : "#D32F2F", transition: "background-color 0.3s" }}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 h-12">
          <button onClick={() => setLocation("/ledger")} className="p-1 -ml-2">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-medium flex-1 text-center">{ledgerData?.name || "永忆"}</h1>
          <div className="w-8" />
        </div>

        {/* 个人信息行 */}
        <div className="px-4 pt-1 pb-2 flex items-center gap-3">
          <div className="flex-shrink-0">
            {user ? (
              <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="lg" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>?</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold truncate">{user?.nickname || user?.name || user?.username || "用户"}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
              {promptMode ? `${PROMPT_CATEGORIES.find(c => c.key === activePromptCat)?.label || ""}提示词库` : `共 ${(items as any[]).length} 条备忘`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              title="刷新页面"
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              title="账本设置"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* 搜索栏（仅备忘模式显示） */}
        {!promptMode && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-200" />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索名称、内容..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/20 text-white placeholder-red-200 text-sm outline-none"
              />
              {keyword && (
                <button onClick={() => setKeyword("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-red-200" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 分类标签栏 */}
      {!promptMode ? (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const count = categoryCounts[cat.key] || 0;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap flex-shrink-0 transition-colors ${
                  isActive ? "text-white" : "text-gray-600 bg-gray-100"
                }`}
                style={isActive ? { backgroundColor: cat.color } : {}}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
                {count > 0 && <span className={`text-xs ${isActive ? "opacity-80" : "text-gray-400"}`}>{count}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2">
          {PROMPT_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => { setActivePromptCat(cat.key); setSelectedPrompts(new Set()); }}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
              style={activePromptCat === cat.key
                ? { backgroundColor: cat.color, color: "#fff" }
                : { backgroundColor: "#F3F4F6", color: "#6B7280" }
              }
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* 多选操作栏（提示词模式） */}
      {promptMode && selectedPrompts.size > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between shadow-sm">
          <span className="text-sm text-gray-600">已选 <span className="font-bold" style={{ color: promptCatColor }}>{selectedPrompts.size}</span> 条</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPrompts(new Set())}
              className="flex items-center gap-1 text-sm text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200"
            >
              <X className="w-3.5 h-3.5" /> 取消
            </button>
            <button
              onClick={copySelectedPrompts}
              className="flex items-center gap-1 text-sm text-white px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: promptCatColor }}
            >
              <Copy className="w-3.5 h-3.5" /> 合并复制
            </button>
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div className="px-4 py-4">
        {!promptMode ? (
          // 备忘内容
          isLoading ? (
            <div className="flex items-center justify-center py-20"><div className="text-gray-400">加载中...</div></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <StickyNote className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{keyword ? "没有找到相关备忘" : "还没有备忘，点击右下角 + 添加"}</p>
            </div>
          ) : (
            (items as MemoItem[]).map(item => (
              <MemoCard
                key={item.id}
                item={item}
                onEdit={item => { setEditItem(item); setShowForm(true); }}
                onDelete={id => setDeleteId(id)}
              />
            ))
          )
        ) : (
          // 提示词内容
          promptsLoading ? (
            <div className="flex items-center justify-center py-20"><div className="text-gray-400">加载中...</div></div>
          ) : (prompts as PromptItem[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ClipboardList className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">还没有提示词，点击右下角 + 添加</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(prompts as PromptItem[]).map(p => {
                const isSel = selectedPrompts.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl px-4 py-3 flex items-start gap-3 border transition-all"
                    style={isSel ? { borderColor: promptCatColor, borderWidth: 2 } : { borderColor: "#F3F4F6" }}
                  >
                    <button onClick={() => togglePromptSelect(p.id)} className="mt-0.5 flex-shrink-0" style={{ color: isSel ? promptCatColor : "#D1D5DB" }}>
                      {isSel ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                    <p className="flex-1 text-sm text-gray-700 leading-relaxed break-all">{p.content}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => navigator.clipboard.writeText(p.content).then(() => toast.success("已复制"))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="复制">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => deletePromptMutation.mutate({ id: p.id })} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* 悬浮新建按鈕 */}
      <button
        onClick={() => promptMode ? setShowPromptAdd(true) : (setEditItem(null), setShowForm(true))}
        className="fixed bottom-6 right-6 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center z-20"
        style={{ backgroundColor: promptMode ? promptCatColor : "#D32F2F" }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* 备忘新建/编辑弹窗 */}
      {showForm && (
        <MemoFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          editItem={editItem}
          ledgerId={ledgerId}
          onSuccess={() => {}}
        />
      )}

      {/* 提示词添加弹窗 */}
      <Dialog open={showPromptAdd} onOpenChange={v => { if (!v) { setShowPromptAdd(false); setPromptPasteText(""); } }}>
        <DialogContent className="mx-4 rounded-2xl p-0 overflow-hidden max-w-sm w-full">
          <div className="px-5 py-4 text-white" style={{ backgroundColor: promptCatColor }}>
            <DialogTitle className="text-base font-semibold text-white">
              添加{PROMPT_CATEGORIES.find(c => c.key === activePromptCat)?.label}提示词
            </DialogTitle>
            <p className="text-xs mt-1 opacity-80">每行一条，支持粘贴批量导入</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <textarea
              value={promptPasteText}
              onChange={e => setPromptPasteText(e.target.value)}
              placeholder={"在此粘贴或输入提示词\n每行一条，可批量导入"}
              className="w-full h-48 text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none resize-none text-gray-700 placeholder-gray-400"
              style={{ lineHeight: "1.6" }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowPromptAdd(false); setPromptPasteText(""); }}>取消</Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: promptCatColor }}
                onClick={handleSavePrompts}
                disabled={createPromptsMutation.isPending}
              >
                {createPromptsMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复，确定要删除这条备忘吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId, ledgerId })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
