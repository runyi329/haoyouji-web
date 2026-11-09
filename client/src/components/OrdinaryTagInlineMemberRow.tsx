import { Pause, Play, Settings2 } from "lucide-react";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/UserAvatar";
import OrdinaryTagAllocationFields from "./OrdinaryTagAllocationFields";
import type { OrdinaryTagObservationConfig } from "@shared/ordinary-tag-observation";
import {
  type OrdinaryActualAllocation, type OrdinaryInlineObservationDraft,
} from "./ordinaryTagInlineAllocation";

export type OrdinaryTagInlineMemberRowProps = {
  ledgerId: number;
  categoryId: number;
  member: { userId: number; username?: string; nickname?: string; avatar?: string | null };
  observation: OrdinaryInlineObservationDraft;
  actual: OrdinaryActualAllocation;
  actualStartDate: string;
  actualPauseDate?: string;
  pauseStatus?: "paused" | "running" | "none";
  pauseLocked?: boolean;
  remainingRatio?: number;
  batchSelectMode?: boolean;
  showAvatar?: boolean;
  visible: boolean;
  saving: boolean;
  accentColor: string;
  readError?: string;
  onConfigRead: (userId: number, categoryId: number, config: OrdinaryTagObservationConfig | null) => void;
  onToggle: (enabled: boolean) => void;
  onObservationEdit: (patch: Partial<OrdinaryInlineObservationDraft>) => void;
  onActualEdit: (field: "amount" | "ratio" | "targetAmount", value: string) => void;
  onActualStartDateEdit?: (value: string) => void;
  onActualPauseDateEdit?: (value: string) => void;
  onDateDetails?: () => void;
  onDetails: () => void;
};

/** 每一行查询带固定 user/tag 身份；不读 summary，不通过 POST 自动保存。 */
export default function OrdinaryTagInlineMemberRow(props: OrdinaryTagInlineMemberRowProps) {
  const query = (trpc as any).ledger.adminGetOrdinaryTagObservationConfig.useQuery(
    { ledgerId: props.ledgerId, categoryId: props.categoryId, targetUserId: props.member.userId },
    { retry: false, staleTime: 30_000, refetchOnWindowFocus: false, placeholderData: undefined },
  );
  useEffect(() => {
    if (query.data !== undefined) props.onConfigRead(props.member.userId, props.categoryId, query.data.config ?? null);
  }, [props.member.userId, props.categoryId, query.data, props.onConfigRead]);
  return <OrdinaryTagInlineMemberFields {...props} saving={props.saving || (!import.meta.env.DEV && (query.isError || query.data === undefined))} readError={query.isError ? "观察配置读取失败，请重试后保存" : props.readError} />;
}

/** 纯UI。三处编辑共用同一观察/真实草稿；无mutation和第二套弹窗比例表单。 */
export function OrdinaryTagInlineMemberFields({
  member, observation, actual, actualStartDate, actualPauseDate = "", pauseStatus = "none", pauseLocked = false,
  remainingRatio = 100, batchSelectMode = false, showAvatar = true, visible, saving, readError,
  onToggle, onObservationEdit, onActualEdit, onActualStartDateEdit, onActualPauseDateEdit, onDateDetails, onDetails,
}: OrdinaryTagInlineMemberRowProps) {
  const name = member.nickname || member.username || "未知";
  const observing = observation.enabled;
  const ratio = observing ? observation.ratio : actual.ratio;
  const initialAmount = observing ? observation.initialAmount : actual.amount;
  const observedAmount = initialAmount.trim() !== "" && ratio.trim() !== ""
    ? String(Number((Number(initialAmount) * Number(ratio) / 100).toFixed(2))) : "";
  const openDateDetails = onDateDetails ?? onDetails;
  return <div data-ordinary-inline-member={member.userId} className="min-w-0 rounded-md px-2 py-2" style={{ backgroundColor: !visible ? "#F7F7F7" : "#FAFAFA" }}>
    <div data-ordinary-member-header className="mb-1.5 flex min-w-0 items-center gap-1.5">
      {showAvatar && <button type="button" onClick={onDetails} disabled={saving}
        aria-label={batchSelectMode ? `${visible ? "隐藏" : "显示"}${name}的标签` : `查看${name}详细设置`}
        title={batchSelectMode ? "点击头像切换显示/隐藏" : "查看保证金及真实设置详情"} className="relative shrink-0">
        {/* 灰度只作用头像，暂停/运行角标保持蓝/绿原色，批量修改实时反馈。 */}
        <span className="block" style={{ filter: visible ? "none" : "grayscale(100%)", opacity: visible ? 1 : 0.45, transition: "all 0.15s ease" }}>
          <UserAvatar username={member.username} avatar={member.avatar} nickname={member.nickname} size="sm" />
        </span>
        {pauseStatus !== "none" && <span data-ordinary-pause-status={pauseStatus} aria-label={pauseStatus === "paused" ? "暂停中" : "运行中"}
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full" style={{ width: 14, height: 14, backgroundColor: pauseStatus === "paused" ? "#1976D2" : "#388E3C", border: "1.5px solid #fff", color: "#fff" }}>
          {pauseStatus === "paused" ? <Pause size={8} fill="currentColor" strokeWidth={3} /> : <Play size={8} fill="currentColor" />}
        </span>}
      </button>}
      <span className="min-w-0 truncate text-xs text-gray-600">{name}</span>
      <label className="flex shrink-0 items-center gap-1 text-[10px] text-[#7C3AED]">
        <span>观察</span>
        <Switch checked={observing} disabled={saving} onCheckedChange={onToggle} aria-label={`${name}的普通标签观察`} title="保存后仅释放真实配置份额，历史、押金、钱包不动" className="h-[1.15rem] w-8 data-[state=checked]:bg-[#8B5CF6]" />
      </label>
    </div>
    <OrdinaryTagAllocationFields name={name} observing={observing} initialAmount={initialAmount}
      targetAmount={observing ? observedAmount : actual.targetAmount} ratio={ratio}
      startDate={observing ? observation.startDate : actualStartDate} pauseDate={observing ? observation.pauseDate : actualPauseDate}
      remainingRatio={remainingRatio} disabled={saving} pauseLocked={pauseLocked}
      onInitialAmountChange={value => observing ? onObservationEdit({ initialAmount: value }) : onActualEdit("amount", value)}
      onTargetAmountChange={observing ? Number(initialAmount) > 0 ? value => onObservationEdit({ ratio: value === "" ? "" : String(Number((Number(value) / Number(initialAmount) * 100).toFixed(4))) }) : undefined : value => onActualEdit("targetAmount", value)}
      onRatioChange={value => observing ? onObservationEdit({ ratio: value }) : onActualEdit("ratio", value)}
      onStartDateChange={observing ? value => onObservationEdit({ startDate: value }) : onActualStartDateEdit}
      onPauseDateChange={observing ? value => onObservationEdit({ pauseDate: value }) : onActualPauseDateEdit}
      onOpenDateDetails={openDateDetails} />
    <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-1 text-[10px] leading-4 text-gray-400">
      <span>{observing ? "观察不占实际份额" : onActualStartDateEdit ? "金额/观察保存本标签；真实日期保存详细设置" : "真实日期点日期框进入详细设置保存"}</span>
      {showAvatar && <button type="button" disabled={saving} onClick={openDateDetails} className="inline-flex shrink-0 items-center gap-0.5"><Settings2 size={10} />查看详细设置</button>}
    </div>
    {!observing && observation.startDate && Number(actual.ratio) === 0 && <p className="mt-1 text-[10px] text-gray-500">关闭观察不恢复实际份额，请重新分配真实比例。</p>}
    {readError && <p role="alert" className="mt-1 text-[10px] text-amber-700">{readError}</p>}
  </div>;
}
