/**
 * 牙伴齿科 - 企业信息（院长/股东侧）
 * 路由：/yaban/enterprise
 * 仅院长/股东(owner) 可进入：填写完整企业详情，提交后由创始人审核开通；已开通后仍可补全/编辑详情（与创始人写同一条记录）
 * 规范：移动端优先、蓝白风格、严禁 Emoji
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ChevronLeft, Building2, Loader2, CheckCircle2, Clock, XCircle, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ClinicForm, { ClinicFormValue, EMPTY_CLINIC, fromClinic } from "./ClinicForm";

export default function YabanEnterprise() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanClinic.myClinic.useQuery();
  const clinic = data?.clinic as any;

  const [form, setForm] = useState<ClinicFormValue>(EMPTY_CLINIC);

  useEffect(() => {
    if (clinic) setForm(fromClinic(clinic));
  }, [clinic]);

  const apply = trpc.yabanClinic.applyClinic.useMutation({
    onSuccess: (res: any) => {
      toast.success(res?.updated ? "企业信息已保存" : "已提交，请等待创始人审核开通");
      utils.yabanClinic.myClinic.invalidate();
    },
    onError: (e) => toast.error(e.message || "提交失败"),
  });

  const status = clinic?.status as string | undefined;
  const isActive = status === "active";

  const submit = () => {
    if (form.name.trim().length < 2) {
      toast.error("请输入正确的企业名称");
      return;
    }
    apply.mutate({ ...form, name: form.name.trim() });
  };

  const StatusBadge = () => {
    if (!status) return null;
    if (status === "active")
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#E6F7EE] text-[#16A34A]">
          <CheckCircle2 className="w-3.5 h-3.5" /> 已开通
        </span>
      );
    if (status === "pending")
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#FEF6E6] text-[#D97706]">
          <Clock className="w-3.5 h-3.5" /> 审核中
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#FDECEC] text-[#DC2626]">
        <XCircle className="w-3.5 h-3.5" /> 已驳回
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="bg-gradient-to-b from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <button onClick={() => navigate("/yaban/profile")} className="flex items-center gap-1 text-sm text-white/90 mb-3">
            <ChevronLeft className="w-5 h-5" /> 返回
          </button>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            <span className="text-lg font-bold">企业信息</span>
          </div>
          <p className="text-xs text-white/85 mt-1">完善门诊详细信息，提交后由牙伴创始人审核开通</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-3">
        {isLoading ? (
          <div className="bg-white rounded shadow-sm p-8 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" />
          </div>
        ) : (
          <>
            {/* 状态卡 */}
            {status && (
              <div className="bg-white rounded shadow-sm p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">当前状态</span>
                <StatusBadge />
              </div>
            )}
            {status === "rejected" && clinic?.rejectReason && (
              <div className="bg-[#FDECEC] rounded p-3 text-xs text-[#DC2626]">
                驳回原因：{clinic.rejectReason}
              </div>
            )}

            {/* 详情表单 */}
            <div className="bg-white rounded shadow-sm p-4">
              <ClinicForm value={form} onChange={setForm} />
            </div>

            <button
              onClick={submit}
              disabled={apply.isPending}
              className="w-full py-3 rounded bg-[#2196C8] text-white text-sm font-semibold active:bg-[#1B7FB0] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {apply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isActive ? "保存企业信息" : status === "rejected" ? "重新提交申请" : status === "pending" ? "更新申请信息" : "提交开通申请"}
            </button>

            <p className="text-xs text-gray-400 px-1 leading-relaxed">
              说明：企业信息用于将您的门诊接入牙伴齿科管理平台。{isActive ? "您的门诊已开通，可随时在此补全或修改详细信息。" : "提交后，平台创始人将核验信息并确认开通，开通后即可使用门诊员工管理、营收统计等功能。"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
