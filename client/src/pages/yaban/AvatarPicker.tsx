/**
 * 牙伴齿科 - 顾客头像选择器
 * 底部弹层，展示 12 款默认头像（女 6 + 男 6），点击选中。
 * 蓝白风格，移动端优先，严禁 Emoji，仅用 lucide-react 图标。
 */
import { X, Check } from "lucide-react";
import {
  ALL_AVATAR_KEYS,
  AVATAR_AGE_LABEL,
  avatarSrc,
  type AvatarKey,
  type AvatarAge,
} from "@/lib/yaban-avatar";

const ACCENT = "#1E88D6";

function keyParts(key: AvatarKey): { gender: string; age: AvatarAge } {
  const [g, a] = key.split("_") as [string, AvatarAge];
  return { gender: g === "female" ? "女" : "男", age: a };
}

export default function AvatarPicker({
  open,
  value,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: AvatarKey | null;
  onClose: () => void;
  onConfirm: (key: AvatarKey) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 面板 */}
      <div className="relative bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="w-12" />
          <h3 className="text-base font-semibold text-gray-900">选择头像</h3>
          <button onClick={onClose} className="w-12 flex justify-end text-gray-400 active:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 头像网格 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-xs text-gray-400 mb-3">
            系统已根据年龄与性别自动匹配，您也可以手动选择
          </p>
          <div className="grid grid-cols-4 gap-3">
            {ALL_AVATAR_KEYS.map((key) => {
              const selected = value === key;
              const { gender, age } = keyParts(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onConfirm(key)}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="relative w-full aspect-square rounded-full overflow-hidden border-2 transition-colors"
                    style={{ borderColor: selected ? ACCENT : "transparent" }}
                  >
                    <img
                      src={avatarSrc(key)}
                      alt={`${gender}${AVATAR_AGE_LABEL[age]}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {selected && (
                      <span
                        className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-500 leading-tight">
                    {gender}·{AVATAR_AGE_LABEL[age]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
