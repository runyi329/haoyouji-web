/**
 * 地址选择组件（牙伴齿科）- 快递式智能填写
 * 面向全国顾客：先用省 / 市 / 区三级级联选择行政区，再输入详细门牌号。
 * 整体序列化为一段地址文本存入 address 字段，例如：
 *   "上海市 浦东新区 张江路 88 号" 或 "江苏省 苏州市 工业园区星海街 12 号"
 * 风格与 AI健康标签弹层一致；严禁 Emoji，仅用 lucide-react 图标。
 */
import { useMemo, useState } from "react";
import { ChevronRight, MapPin, Check, X } from "lucide-react";
import { CHINA_REGION, type RegionNode } from "@/lib/china-region";

const ACCENT = "#1E88D6";

// 序列化：把省/市/区与门牌号拼成一段地址；反向解析尽力而为
export function serializeAddress(parts: string[], detail: string): string {
  const region = parts.filter(Boolean).join(" ");
  const d = detail.trim();
  if (region && d) return `${region} ${d}`;
  return region || d;
}

export default function AddressPicker({
  open,
  value,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: string; // 已有完整地址文本
  onClose: () => void;
  onConfirm: (full: string) => void;
}) {
  // 选择层级：0=省 1=市 2=区
  const [level, setLevel] = useState(0);
  const [province, setProvince] = useState<RegionNode | null>(null);
  const [city, setCity] = useState<RegionNode | null>(null);
  const [district, setDistrict] = useState<string>("");
  const [detail, setDetail] = useState("");

  // open 时初始化（尽量从已有文本反解析门牌号，区划保持空让用户重选）
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setLevel(0);
      setProvince(null);
      setCity(null);
      setDistrict("");
      setDetail(value || "");
    }
  }

  // 当前层级要展示的列表
  const currentList: RegionNode[] = useMemo(() => {
    if (level === 0) return CHINA_REGION;
    if (level === 1) return province?.children || [];
    if (level === 2) return city?.children || [];
    return [];
  }, [level, province, city]);

  if (!open) return null;

  const pickProvince = (node: RegionNode) => {
    setProvince(node);
    setCity(null);
    setDistrict("");
    // 没有下级（如港澳台、海外/其他）直接完成区划选择
    if (!node.children || node.children.length === 0) {
      setLevel(2); // 跳到「已选好区划，仅填门牌号」状态
    } else {
      setLevel(1);
    }
  };

  const pickCity = (node: RegionNode) => {
    setCity(node);
    setDistrict("");
    if (!node.children || node.children.length === 0) {
      setLevel(2);
    } else {
      setLevel(2);
    }
  };

  const pickDistrict = (name: string) => {
    setDistrict(name);
  };

  const regionText = [province?.name, city?.name, district].filter(Boolean).join(" ");

  const handleConfirm = () => {
    const parts = [province?.name || "", city?.name || "", district || ""];
    onConfirm(serializeAddress(parts, detail));
  };

  // 顶部面包屑：点击可回到对应层级重选
  const Breadcrumb = () => (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-1 text-sm">
      <button
        onClick={() => setLevel(0)}
        className={level === 0 ? "font-medium" : "text-gray-500"}
        style={level === 0 ? { color: ACCENT } : undefined}
      >
        {province?.name || "请选择省份"}
      </button>
      {province?.children && province.children.length > 0 && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <button
            onClick={() => province && setLevel(1)}
            className={level === 1 ? "font-medium" : "text-gray-500"}
            style={level === 1 ? { color: ACCENT } : undefined}
          >
            {city?.name || "请选择城市"}
          </button>
        </>
      )}
      {city?.children && city.children.length > 0 && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <button
            onClick={() => setLevel(2)}
            className={level === 2 ? "font-medium" : "text-gray-500"}
            style={level === 2 ? { color: ACCENT } : undefined}
          >
            {district || "请选择区/县"}
          </button>
        </>
      )}
    </div>
  );

  // 是否已选到末级区划（用于是否展示门牌号输入）
  const hasRegion = !!province;
  const needDistrict = !!(city?.children && city.children.length > 0);
  const regionDone = hasRegion && (!needDistrict || !!district);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="text-base font-medium" style={{ color: ACCENT }}>
          取消
        </button>
        <h2 className="text-base font-semibold text-gray-900">所在地区</h2>
        <button
          onClick={handleConfirm}
          className="text-base font-medium"
          style={{ color: ACCENT }}
        >
          确定
        </button>
      </div>

      {/* 当前已选区划面包屑 */}
      <div className="px-4 py-2.5 border-b border-gray-100 shrink-0 flex items-start gap-2">
        <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
        <Breadcrumb />
      </div>

      {/* 区划列表 */}
      <div className="flex-1 overflow-y-auto">
        {level === 2 && !needDistrict ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            已选择「{regionText}」，可在下方填写详细门牌号
          </div>
        ) : (
          <div>
            {currentList.map((node) => {
              const selected =
                (level === 0 && province?.name === node.name) ||
                (level === 1 && city?.name === node.name) ||
                (level === 2 && district === node.name);
              return (
                <button
                  key={node.name}
                  onClick={() => {
                    if (level === 0) pickProvince(node);
                    else if (level === 1) pickCity(node);
                    else pickDistrict(node.name);
                  }}
                  className="w-full px-4 py-3 text-left text-sm border-b border-gray-50 flex items-center justify-between active:bg-gray-50"
                  style={selected ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                >
                  <span>{node.name}</span>
                  {selected ? (
                    <Check className="w-4 h-4" style={{ color: ACCENT }} />
                  ) : node.children && node.children.length > 0 ? (
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 详细门牌号输入 */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0 bg-gray-50">
        <div className="text-xs text-gray-500 mb-1.5">详细门牌号（街道、楼栋、门牌号等）</div>
        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200 focus-within:border-[#1E88D6]">
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="如：张江路 88 号 3 号楼 502"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-300"
          />
          {detail && (
            <button onClick={() => setDetail("")} className="shrink-0 text-gray-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {regionDone && (
          <div className="mt-2 text-xs text-gray-400">
            完整地址：{serializeAddress([province?.name || "", city?.name || "", district || ""], detail) || "—"}
          </div>
        )}
      </div>
    </div>
  );
}
