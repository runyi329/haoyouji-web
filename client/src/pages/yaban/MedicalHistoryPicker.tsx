/**
 * 既往史选择组件（牙伴齿科）
 * 解决原软件长列表平铺、无搜索、重复的问题：
 *  - 强搜索：支持中文模糊（含同义词/俗称）+ 拼音首字母
 *  - 分类浏览：按医学系统分组折叠
 *  - 常用置顶：高频病种快速勾选
 *  - 已选 chip：集中显示、可一键删除
 *  - 备注补充：承接「空腹血糖7mmol/L」等个性化文字
 * 数据以「已选名称数组 + 备注」序列化为一段文本存入 history 字段。
 * 序列化格式：选中的病名以「、」连接；如有备注，追加「（备注：xxx）」。
 * 严禁 Emoji，仅用 lucide-react 图标。
 */
import { useMemo, useState } from "react";
import { Search, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  MEDICAL_HISTORY_DICT,
  MEDICAL_HISTORY_CATEGORIES,
  type MedicalHistoryItem,
} from "@/lib/medical-history-dict";

const ACCENT = "#1E88D6";

// 常用既往史（牙科高频关注，置顶快速勾选）
const COMMON_IDS = ["cv_1", "ed_1", "cv_3", "ed_3", "al_1", "al_2", "al_6", "in_1", "al_5", "on_1"];

// history 文本序列化 / 反序列化
const REMARK_PREFIX = "（备注：";
export function serializeHistory(names: string[], remark: string): string {
  const base = names.join("、");
  const r = remark.trim();
  if (!r) return base;
  return base ? `${base}${REMARK_PREFIX}${r}）` : `${REMARK_PREFIX}${r}）`;
}
export function parseHistory(text: string): { names: string[]; remark: string } {
  if (!text) return { names: [], remark: "" };
  let remark = "";
  let main = text;
  const idx = text.indexOf(REMARK_PREFIX);
  if (idx >= 0) {
    main = text.slice(0, idx);
    remark = text.slice(idx + REMARK_PREFIX.length).replace(/）\s*$/, "");
  }
  const names = main.split(/[、，,]/).map((s) => s.trim()).filter(Boolean);
  return { names, remark };
}

// 判断某项是否命中关键词（中文名 / 同义词 / 拼音首字母）
function matchItem(item: MedicalHistoryItem, kw: string): boolean {
  const k = kw.trim().toLowerCase();
  if (!k) return true;
  if (item.name.toLowerCase().includes(k)) return true;
  if (item.pinyin.toLowerCase().includes(k)) return true;
  if (item.aliases.some((a) => a.toLowerCase().includes(k))) return true;
  return false;
}

export default function MedicalHistoryPicker({
  open,
  value,
  remark,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: string[]; // 已选病名
  remark: string;
  onClose: () => void;
  onConfirm: (names: string[], remark: string) => void;
}) {
  const [kw, setKw] = useState("");
  const [selected, setSelected] = useState<string[]>(value);
  const [localRemark, setLocalRemark] = useState(remark);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // open 状态变化时同步外部值
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSelected(value);
      setLocalRemark(remark);
      setKw("");
    }
  }

  const toggle = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // 搜索结果（扁平，不分类）
  const searchResults = useMemo(() => {
    if (!kw.trim()) return null;
    return MEDICAL_HISTORY_DICT.filter((it) => matchItem(it, kw));
  }, [kw]);

  // 分组数据
  const grouped = useMemo(() => {
    const map: Record<string, MedicalHistoryItem[]> = {};
    for (const c of MEDICAL_HISTORY_CATEGORIES) map[c] = [];
    for (const it of MEDICAL_HISTORY_DICT) {
      if (map[it.category]) map[it.category].push(it);
    }
    return map;
  }, []);

  const commonItems = useMemo(
    () => COMMON_IDS.map((id) => MEDICAL_HISTORY_DICT.find((d) => d.id === id)).filter(Boolean) as MedicalHistoryItem[],
    []
  );

  if (!open) return null;

  // 标签块：未选灰底灰字，选中高亮底+白字（脉动账本风格）
  const Tag = ({ it }: { it: MedicalHistoryItem }) => {
    const checked = selected.includes(it.name);
    return (
      <button
        onClick={() => toggle(it.name)}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          checked ? "text-white shadow-sm" : "bg-gray-100 text-gray-600"
        }`}
        style={checked ? { backgroundColor: ACCENT } : undefined}
      >
        {it.name}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="text-base font-medium" style={{ color: ACCENT }}>
          取消
        </button>
        <h2 className="text-base font-semibold text-gray-900">既往史</h2>
        <button
          onClick={() => onConfirm(selected, localRemark)}
          className="text-base font-medium"
          style={{ color: ACCENT }}
        >
          确定
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="AI 智能查找，如 高血压 / gxy / 血压高"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          {kw && (
            <button onClick={() => setKw("")} className="shrink-0 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 已选 chip 区 */}
      {selected.length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 shrink-0 max-h-24 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {selected.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs"
                style={{ backgroundColor: "#E8F2FB", color: ACCENT }}
              >
                {name}
                <button onClick={() => toggle(name)} className="shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto">
        {searchResults ? (
          // 搜索模式：标签流式扁平结果
          searchResults.length > 0 ? (
            <div className="flex flex-wrap gap-2.5 px-4 py-3">
              {searchResults.map((it) => <Tag key={it.id} it={it} />)}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              未找到相关疾病，可在下方备注中手动填写
            </div>
          )
        ) : (
          // 浏览模式：常用 + 分类折叠（每组内标签流式）
          <>
            <div className="px-4 pt-3 pb-1.5 text-xs font-medium text-gray-400">常用既往史</div>
            <div className="flex flex-wrap gap-2.5 px-4 pb-2">
              {commonItems.map((it) => <Tag key={`common_${it.id}`} it={it} />)}
            </div>

            {MEDICAL_HISTORY_CATEGORIES.map((cat) => {
              const items = grouped[cat] || [];
              if (items.length === 0) return null;
              const isCollapsed = collapsed[cat];
              return (
                <div key={cat}>
                  <button
                    onClick={() => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 active:bg-gray-100"
                  >
                    <span className="text-xs font-semibold text-gray-500">{cat}</span>
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="flex flex-wrap gap-2.5 px-4 py-3">
                      {items.map((it) => <Tag key={it.id} it={it} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* 备注补充 */}
      <div className="border-t border-gray-100 px-4 py-3 shrink-0">
        <div className="text-xs font-medium text-gray-500 mb-1.5">备注补充（个性化描述、具体数值等）</div>
        <textarea
          value={localRemark}
          onChange={(e) => setLocalRemark(e.target.value)}
          rows={2}
          placeholder="如：空腹血糖 7mmol/L、四年前做过心脏支架等"
          className="w-full text-sm text-gray-700 placeholder:text-gray-300 outline-none resize-none bg-gray-50 rounded-lg px-3 py-2"
        />
      </div>
    </div>
  );
}
