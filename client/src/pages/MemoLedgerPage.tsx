/**
 * MemoLedgerPage.tsx - AD型定制账本：永忆
 * 两级分类：第1级大类 → 第2级子类（预设+自定义）→ 字段内容
 */
import { useState, useMemo } from "react";
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
  MapPin,
  KeyRound,
  Landmark,
  Globe,
  StickyNote,
  ChevronRight,
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
  { key: "website", label: "网站登录", icon: Globe,      color: "#8E24AA" },
  { key: "other",   label: "其他",   icon: StickyNote,  color: "#FB8C00" },
];

// ===== 第2级子类预设 =====
const SUB_CATEGORIES: Record<string, string[]> = {
  bank: ["工商银行", "建设银行", "招商银行", "农业银行", "中国银行", "交通银行", "邮储银行", "浦发银行", "民生银行", "光大银行", "自定义"],
  account: ["苹果ID", "华为ID", "微软账号", "谷歌账号", "淘宝/天猫", "京东", "美团", "拼多多", "微信", "支付宝", "抖音", "快手", "自定义"],
  address: ["家庭地址", "公司地址", "常用地址1", "常用地址2", "自定义"],
  website: ["常用网站", "工作系统", "学习平台", "游戏账号", "自定义"],
  other: ["证件信息", "车牌/车险", "会员卡", "WiFi密码", "自定义"],
};

// ===== 每种大类的字段模板 =====
const FIELD_TEMPLATES: Record<string, Array<{ label: string; sensitive?: boolean }>> = {
  bank: [
    { label: "卡号" },
    { label: "开户人" },
    { label: "开户行" },
    { label: "预留手机" },
    { label: "网银密码", sensitive: true },
  ],
  account: [
    { label: "账号/用户名" },
    { label: "密码", sensitive: true },
    { label: "备用邮箱" },
    { label: "手机号" },
  ],
  address: [
    { label: "收件人" },
    { label: "手机号" },
    { label: "省市区" },
    { label: "详细地址" },
    { label: "邮编" },
  ],
  website: [
    { label: "网址" },
    { label: "用户名" },
    { label: "密码", sensitive: true },
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
    const text = item.fields.filter(f => f.value).map(f => `${f.label}：${f.value}`).join("\n");
    copyText(text, item.title);
  };

  const filledCount = item.fields.filter(f => f.value).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      {/* 卡片头部 */}
      <div className="flex items-center px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mr-3" style={{ backgroundColor: cat.color + "18" }}>
          <CatIcon className="w-4.5 h-4.5" style={{ color: cat.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{getSubLabel(item)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs mr-1" style={{ backgroundColor: cat.color + "18", color: cat.color }}>
              {cat.label}
            </span>
            {filledCount} 个字段
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
        <div className="border-t border-gray-50 px-4 pb-3 pt-2 space-y-2">
          {item.fields.filter(f => f.value).map((field, idx) => (
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
          {item.note && (
            <div className="pt-1 border-t border-gray-50">
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
  // 解析编辑时的初始值
  const initCategory = editItem?.category || "bank";
  const initSubLabel = editItem?.title || "";

  const [step, setStep] = useState<"cat" | "sub" | "fields">(editItem ? "fields" : "cat");
  const [category, setCategory] = useState(initCategory);
  const [subLabel, setSubLabel] = useState(initSubLabel);
  const [customSub, setCustomSub] = useState(
    initSubLabel && SUB_CATEGORIES[initCategory] && !SUB_CATEGORIES[initCategory].slice(0, -1).includes(initSubLabel)
      ? initSubLabel : ""
  );
  const [isCustom, setIsCustom] = useState(false);
  const [fields, setFields] = useState<MemoField[]>(
    editItem?.fields || FIELD_TEMPLATES[initCategory]?.map(f => ({ ...f, value: "" })) || []
  );
  const [note, setNote] = useState(editItem?.note || "");
  const utils = trpc.useUtils();

  const catObj = CATEGORIES.find(c => c.key === category)!;
  const subList = SUB_CATEGORIES[category] || ["自定义"];

  const handleSelectCat = (key: string) => {
    setCategory(key);
    setSubLabel("");
    setCustomSub("");
    setIsCustom(false);
    setFields(FIELD_TEMPLATES[key]?.map(f => ({ ...f, value: "" })) || []);
    setStep("sub");
  };

  const handleSelectSub = (sub: string) => {
    if (sub === "自定义") {
      setIsCustom(true);
      setSubLabel("");
    } else {
      setIsCustom(false);
      setSubLabel(sub);
      setStep("fields");
    }
  };

  const handleConfirmCustom = () => {
    if (!customSub.trim()) { toast.error("请输入名称"); return; }
    setSubLabel(customSub.trim());
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
    if (!subLabel.trim()) { toast.error("请先选择或填写子类名称"); return; }
    const validFields = fields.filter(f => f.value.trim());
    if (validFields.length === 0) { toast.error("请至少填写一个字段内容"); return; }
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, category, title: subLabel, fields, note: note.trim() || undefined });
    } else {
      createMutation.mutate({ ledgerId, category, title: subLabel, fields, note: note.trim() || undefined });
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
                <p className="text-sm text-gray-500">输入自定义名称</p>
                <div className="flex gap-2">
                  <Input
                    value={customSub}
                    onChange={e => setCustomSub(e.target.value)}
                    placeholder={`如：${catObj.label}名称...`}
                    autoFocus
                    onKeyDown={e => e.key === "Enter" && handleConfirmCustom()}
                  />
                  <Button onClick={handleConfirmCustom} className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white flex-shrink-0">确认</Button>
                </div>
                <button onClick={() => setIsCustom(false)} className="text-xs text-gray-400 hover:text-gray-600">← 返回预设列表</button>
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
                <button onClick={() => setStep("sub")} className="text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: catObj.color + "18" }}>
                <catObj.icon className="w-3.5 h-3.5" style={{ color: catObj.color }} />
                <span className="text-xs font-medium" style={{ color: catObj.color }}>{catObj.label}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-sm font-medium text-gray-800">{subLabel}</span>
            </div>

            {/* 字段列表 */}
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

            {/* 备注 */}
            <div className="space-y-1">
              <label className="text-sm text-gray-600">备注（可选）</label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="附加说明..." />
            </div>

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
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.ledger.getMemoItems.useQuery({
    ledgerId,
    category: activeCategory === "all" ? undefined : activeCategory,
    keyword: keyword || undefined,
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white sticky top-0 z-10">
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
            <p className="text-xs text-red-200 mt-0.5">共 {(items as any[]).length} 条备忘</p>
          </div>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            title="账本设置"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 搜索栏 */}
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
      </div>

      {/* 分类标签栏 */}
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

      {/* 内容区 */}
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">加载中...</div>
          </div>
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
        )}
      </div>

      {/* 悬浮新建按钮 */}
      <button
        onClick={() => { setEditItem(null); setShowForm(true); }}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#D32F2F] text-white rounded-full shadow-lg flex items-center justify-center z-20"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* 新建/编辑弹窗 */}
      {showForm && (
        <MemoFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          editItem={editItem}
          ledgerId={ledgerId}
          onSuccess={() => {}}
        />
      )}

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
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
