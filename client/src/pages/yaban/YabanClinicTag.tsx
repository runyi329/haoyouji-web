/**
 * 牙伴齿科管理 - 弹出框/编辑框内「所属医院」行内标签
 *
 * 设计要点（严禁 Emoji）：
 *   - 连锁门店场景下，各弹窗/编辑框需明确标出当前操作所属的医院，避免混淆。
 *   - 数据本身已按 tenantId 隔离，本组件仅做 UI 层标注，不改变任何业务逻辑。
 *   - 统一小字灰色样式：左侧一个建筑图标 + 「所属：医院名」，紧凑、低干扰。
 *   - 取自全局 useYabanClinic 的 current（优先 name，回退 shortName）。
 *   - 当无当前医院（极端情况）时不渲染，避免出现空标签。
 */
import { Building2 } from "lucide-react";
import { useYabanClinic, YABAN_MODEL_TENANT_ID } from "./useYabanClinic";

interface Props {
  /** 自定义外层 className，便于在不同弹窗中微调间距 */
  className?: string;
  /** 行内样式覆盖（如 marginBottom） */
  style?: React.CSSProperties;
  /** 前缀文案，默认「所属」 */
  prefix?: string;
}

export default function YabanClinicTag({ className = "", style, prefix = "所属" }: Props) {
  const { current } = useYabanClinic();
  if (!current) return null;
  const name = current.name?.trim() || current.shortName?.trim() || `门店 ${current.tenantId}`;
  const isModel = current.tenantId === YABAN_MODEL_TENANT_ID;
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color: "#8a94a0",
        maxWidth: "100%",
        ...style,
      }}
    >
      <Building2 size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {prefix}：{name}
      </span>
      {isModel && (
        <span
          style={{
            flexShrink: 0,
            borderRadius: 4,
            background: "#FEF3C7",
            color: "#B45309",
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 4px",
            lineHeight: 1.3,
          }}
        >
          演示
        </span>
      )}
    </div>
  );
}
