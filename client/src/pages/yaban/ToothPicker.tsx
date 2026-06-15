/**
 * 图形牙位选择器（牙伴齿科）
 * 采用国际通用 FDI 牙位编号：
 *  - 恒牙（成人）：右上 18-11 / 左上 21-28 / 左下 38-31 / 右下 48-41，共 32 颗
 *  - 乳牙（儿童）：右上 55-51 / 左上 61-65 / 左下 75-71 / 右下 85-81，共 20 颗
 * 牙位按上下颌、左右象限十字布局排列，符合医生看口腔的视角（患者面对医生：
 * 屏幕左侧为患者右侧）。点击选/取消选，支持多选，生成形如「16,26」的牙位码。
 * 牙伴蓝主色，移动端友好，紧凑布局；严禁 Emoji，仅用 lucide-react 图标。
 */
import { useMemo, useState } from "react";
import { X, Eraser } from "lucide-react";

const ACCENT = "#1E88D6";

// 恒牙象限（FDI），按从中线向远端的视觉顺序排列
// 上排：右上(1x) 反向 + 左上(2x) 正向；下排：右下(4x) 反向 + 左下(3x) 正向
const PERM = {
  upperRight: [18, 17, 16, 15, 14, 13, 12, 11], // 显示在上排左半（患者右侧）
  upperLeft: [21, 22, 23, 24, 25, 26, 27, 28], // 上排右半
  lowerRight: [48, 47, 46, 45, 44, 43, 42, 41], // 下排左半
  lowerLeft: [31, 32, 33, 34, 35, 36, 37, 38], // 下排右半
};

// 乳牙象限（FDI 5x/6x/7x/8x）
const PRIMARY = {
  upperRight: [55, 54, 53, 52, 51],
  upperLeft: [61, 62, 63, 64, 65],
  lowerRight: [85, 84, 83, 82, 81],
  lowerLeft: [71, 72, 73, 74, 75],
};

// 牙位码序列化 / 反序列化（以英文逗号连接）
export function parseTeeth(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function serializeTeeth(codes: string[]): string {
  return codes.join(",");
}

type Dentition = "perm" | "primary";

export default function ToothPicker({
  open,
  value,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: string; // 牙位码字符串，如 "16,26"
  onClose: () => void;
  onConfirm: (toothCode: string) => void;
}) {
  const [dentition, setDentition] = useState<Dentition>("perm");
  const [selected, setSelected] = useState<string[]>([]);

  // open 状态变化时同步外部值
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const init = parseTeeth(value);
      setSelected(init);
      // 若初始牙位有乳牙编号则默认切到乳牙
      const hasPrimary = init.some((c) => /^[5-8]/.test(c));
      setDentition(hasPrimary && init.every((c) => /^[5-8]/.test(c)) ? "primary" : "perm");
    }
  }

  const data = dentition === "perm" ? PERM : PRIMARY;

  const toggle = (code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // 按 FDI 数值排序后展示已选
  const sortedSelected = useMemo(
    () => [...selected].sort((a, b) => Number(a) - Number(b)),
    [selected]
  );

  if (!open) return null;

  // 单颗牙按钮
  const Tooth = ({ code }: { code: number }) => {
    const c = String(code);
    const checked = selected.includes(c);
    return (
      <button
        onClick={() => toggle(c)}
        className={`w-9 h-10 rounded-md text-xs font-semibold flex items-center justify-center transition-all border ${
          checked
            ? "text-white border-transparent shadow-sm"
            : "bg-white text-gray-600 border-gray-200 active:bg-gray-50"
        }`}
        style={checked ? { backgroundColor: ACCENT } : undefined}
      >
        {c}
      </button>
    );
  };

  // 一行象限（带中线分隔）
  const QuadrantRow = ({
    left,
    right,
    label,
  }: {
    left: number[];
    right: number[];
    label: string;
  }) => (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <div className="flex gap-1">
          {left.map((t) => (
            <Tooth key={t} code={t} />
          ))}
        </div>
        {/* 中线 */}
        <div className="w-px self-stretch bg-gray-300 mx-1" />
        <div className="flex gap-1">
          {right.map((t) => (
            <Tooth key={t} code={t} />
          ))}
        </div>
      </div>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose} className="text-base font-medium" style={{ color: ACCENT }}>
          取消
        </button>
        <h2 className="text-base font-semibold text-gray-900">选择牙位</h2>
        <button
          onClick={() => onConfirm(serializeTeeth(sortedSelected))}
          className="text-base font-medium"
          style={{ color: ACCENT }}
        >
          确定
        </button>
      </div>

      {/* 恒牙 / 乳牙切换 */}
      <div className="px-4 py-3 shrink-0">
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { key: "perm" as Dentition, label: "恒牙（成人）" },
            { key: "primary" as Dentition, label: "乳牙（儿童）" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setDentition(opt.key)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
                dentition === opt.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
              }`}
              style={dentition === opt.key ? { color: ACCENT } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 牙位图（上下颌十字布局） */}
      <div className="flex-1 overflow-auto px-2 py-2">
        <div className="flex flex-col items-center gap-3 min-w-max mx-auto">
          {/* 上颌 */}
          <QuadrantRow left={data.upperRight} right={data.upperLeft} label="上颌" />
          {/* 中线分隔 */}
          <div className="w-full max-w-xs h-px bg-gray-200" />
          {/* 下颌 */}
          <QuadrantRow left={data.lowerRight} right={data.lowerLeft} label="下颌" />
        </div>

        <div className="mt-4 text-center text-[11px] text-gray-400 px-4">
          左为患者右侧，右为患者左侧（医生视角）
        </div>
      </div>

      {/* 已选区 + 清空 */}
      <div className="border-t border-gray-100 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">
            已选牙位（{sortedSelected.length}）
          </span>
          {sortedSelected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              className="inline-flex items-center gap-1 text-xs text-gray-400 active:text-gray-600"
            >
              <Eraser className="w-3.5 h-3.5" />
              清空
            </button>
          )}
        </div>
        {sortedSelected.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sortedSelected.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs"
                style={{ backgroundColor: "#E8F2FB", color: ACCENT }}
              >
                {code}
                <button onClick={() => toggle(code)} className="shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-300">点击上方牙位图进行选择，可多选</div>
        )}
      </div>
    </div>
  );
}
