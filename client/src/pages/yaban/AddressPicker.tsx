/**
 * 地址选择组件（牙伴齿科）- 快递式智能填写
 * 面向全国顾客：按真实行政层级选择地区，再输入详细门牌号。
 * 整体序列化为一段地址文本存入 address 字段，例如：
 *   "上海市 浦东新区 张江路 88 号" 或 "江苏省 苏州市 吴中区 星海街 12 号"
 * 风格与 AI健康标签弹层一致；严禁 Emoji，仅用 lucide-react 图标。
 */
import { useMemo, useState } from "react";
import { ChevronRight, MapPin, Check, X } from "lucide-react";
import { CHINA_REGION, type RegionNode } from "@/lib/china-region";

const ACCENT = "#1E88D6";
const DIRECT_REGIONS = new Set([
  "北京市", "天津市", "上海市", "重庆市", "香港特别行政区", "澳门特别行政区",
]);

// 序列化时忽略空层级和相邻同名行政层级，不改写详细地址。
export function serializeAddress(parts: string[], detail: string): string {
  const names = parts.map(part => part.trim()).filter(Boolean);
  const region = names.filter((name, index) => index === 0 || name !== names[index - 1]).join(" ");
  const d = detail.trim();
  if (region && d) return `${region} ${d}`;
  return region || d;
}

const trimRegionSeparator = (text: string) => text.replace(/^[\s,，/／>＞|]+/, "");

/** 仅剥离从开头实际匹配的地区；未知旧地区/整段地址始终留在详细地址里。 */
export function parseAddress(value: string): {
  province: RegionNode | null;
  city: RegionNode | null;
  district: string;
  detail: string;
} {
  let remaining = value.trimStart();
  const matchNode = (nodes: RegionNode[] = []) =>
    nodes.filter(node => remaining.startsWith(node.name))
      .sort((a, b) => b.name.length - a.name.length)[0] || null;
  const consume = (name: string) => {
    remaining = trimRegionSeparator(remaining.slice(name.length));
  };

  const province = matchNode(CHINA_REGION);
  if (!province) return { province: null, city: null, district: "", detail: value };
  consume(province.name);
  // 仅兼容省市同名层级，不剥离可能与区县同名的街道/门牌号。
  if (DIRECT_REGIONS.has(province.name) && remaining.startsWith(province.name)) {
    consume(province.name);
  }
  const city = matchNode(province.children);
  if (city) consume(city.name);
  const district = city ? matchNode(city.children) : null;
  if (district) consume(district.name);
  return { province, city, district: district?.name || "", detail: remaining };
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
  // 直辖市/港澳扁平为省 -> 区；普通省份为省 -> 市 -> 区。
  const [level, setLevel] = useState(0);
  const [province, setProvince] = useState<RegionNode | null>(null);
  const [city, setCity] = useState<RegionNode | null>(null);
  const [district, setDistrict] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [regionChanged, setRegionChanged] = useState(false);
  const [detailChanged, setDetailChanged] = useState(false);

  // 每次打开都从原值初始化；不重选时允许保留历史地址或空的可选字段。
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const parsed = parseAddress(value || "");
      setLevel(0);
      setProvince(parsed.province);
      setCity(parsed.city);
      setDistrict(parsed.district);
      setDetail(parsed.detail);
      setRegionChanged(false);
      setDetailChanged(false);
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
    setRegionChanged(true);
    setProvince(node);
    setCity(null);
    setDistrict("");
    // 仅真实叶节点（如海外/其他）可以在省级完成。
    setLevel(node.children?.length ? 1 : 2);
  };

  const pickCity = (node: RegionNode) => {
    setRegionChanged(true);
    setCity(node);
    setDistrict("");
    setLevel(2);
  };

  const pickDistrict = (name: string) => {
    setRegionChanged(true);
    setDistrict(name);
  };

  const parts = [province?.name || "", city?.name || "", district];
  const regionText = serializeAddress(parts, "");
  const needCity = !!province?.children?.length;
  const needDistrict = !!city?.children?.length;
  const regionDone = !!province && (!needCity || (!!city && (!needDistrict || !!district)));
  const canConfirm = !regionChanged || regionDone;
  const cityPlaceholder = province && DIRECT_REGIONS.has(province.name) ? "请选择区/县" : "请选择城市";

  const handleConfirm = () => {
    // 除按钮禁用外再做一次守卫，避免只选省或只选有下级的市就保存。
    if (!canConfirm) return;
    onConfirm(!regionChanged && !detailChanged ? value : serializeAddress(parts, detail));
  };

  // 顶部面包屑：点击可回到对应层级重选；实际选择时才清空下级。
  const Breadcrumb = () => (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-1 text-sm">
      <button
        onClick={() => setLevel(0)}
        className={level === 0 ? "font-medium" : "text-gray-500"}
        style={level === 0 ? { color: ACCENT } : undefined}
      >
        {province?.name || "请选择省份"}
      </button>
      {needCity && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <button
            onClick={() => province && setLevel(1)}
            className={level === 1 ? "font-medium" : "text-gray-500"}
            style={level === 1 ? { color: ACCENT } : undefined}
          >
            {city?.name || cityPlaceholder}
          </button>
        </>
      )}
      {needDistrict && (
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
          disabled={!canConfirm}
          className="text-base font-medium"
          style={{ color: canConfirm ? ACCENT : "#9CA3AF" }}
        >
          确定
        </button>
      </div>

      {/* 当前已选区划面包屑 */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0 flex items-start gap-2">
        <MapPin className="w-5 h-5 mt-0.5 shrink-0" style={{ color: ACCENT }} />
        <Breadcrumb />
      </div>

      {/* 详细门牌号输入（置于列表上方，靠上展示，字体正常大小） */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="text-sm text-gray-500 mb-2">详细门牌号（街道、楼栋、门牌号等）</div>
        <div className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2.5 border border-gray-200 focus-within:border-[#1E88D6] focus-within:bg-white">
          <input
            value={detail}
            onChange={(e) => {
              setDetail(e.target.value);
              setDetailChanged(true);
            }}
            placeholder="如：张江路 88 号 3 号楼 502"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-gray-300"
          />
          {detail && (
            <button onClick={() => { setDetail(""); setDetailChanged(true); }} className="shrink-0 text-gray-300">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {regionDone && (
          <div className="mt-2 text-sm text-gray-400">
            完整地址：{serializeAddress(parts, detail) || "—"}
          </div>
        )}
        {!canConfirm && (
          <div className="mt-2 text-sm text-gray-400">请选择完整的省、市、区/县；无区县的城市可直接填写街道门牌号。</div>
        )}
      </div>

      {/* 区划列表 */}
      <div className="flex-1 overflow-y-auto">
        {level === 2 && regionDone && !needDistrict ? (
          <div className="px-4 py-6 text-center text-base text-gray-400">
            已选择「{regionText}」，门牌号请在上方填写
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
                  className="w-full px-4 py-3.5 text-left text-base border-b border-gray-50 flex items-center justify-between active:bg-gray-50"
                  style={selected ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                >
                  <span>{node.name}</span>
                  {selected ? (
                    <Check className="w-5 h-5" style={{ color: ACCENT }} />
                  ) : node.children && node.children.length > 0 ? (
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
