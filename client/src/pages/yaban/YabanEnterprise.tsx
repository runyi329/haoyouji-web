/**
 * 牙伴齿科 - 企业信息（院长/股东侧）
 * 路由：/yaban/enterprise
 * 仅院长/股东(owner) 可进入：填写 企业名称 + 税号，提交开通申请；显示审核状态
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ChevronLeft, Building2, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

export default function YabanEnterprise() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanClinic.myClinic.useQuery();
  const clinic = data?.clinic as any;

  const [name, setName] = useState("");
  const [taxNo, setTaxNo] = useState("");

  useEffect(() => {
    if (clinic) {
      setName(clinic.name || "");
      setTaxNo(clinic.tax_no || "");
    }
  }, [clinic]);

  const apply = trpc.yabanClinic.applyClinic.useMutation({
    onSuccess: () => {
      toast.success("已提交，请等待创始人审核开通");
      utils.yabanClinic.myClinic.invalidate();
    },
    onError: (e) => toast.error(e.message || "提交失败"),
  });

  const status = clinic?.status as string | undefined;
  const isActive = status === "active";

  const submit = () => {
    if (name.trim().length < 2) {
      toast.error("请输入正确的企业名称");
      return;
    }
    apply.mutate({ name: name.trim(), taxNo: taxNo.trim() });
  };

  const StatusBadge = () => {
    if (!status) return null;
    if (status === "active")
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#E6F7EE] text-[#16A34A]">
          <CheckCircle2 className="w-3.5 h-3.5" /> 已开通
        </span>
      );
    if (status === "pending")
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#FEF6E6] text-[#D97706]">
          <Clock className="w-3.5 h-3.5" /> 审核中
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#FDECEC] text-[#DC2626]">
        <XCircle className="w-3.5 h-3.5" /> 已驳回
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <PageTag code="P304" />
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
          <p className="text-xs text-white/85 mt-1">填写企业名称与税号，提交后由牙伴创始人审核开通</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" />
          </div>
        ) : (
          <>
            {/* 状态卡 */}
            {status && (
              <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">当前状态</span>
                <StatusBadge />
              </div>
            )}
            {status === "rejected" && clinic?.reject_reason && (
              <div className="bg-[#FDECEC] rounded-2xl p-3 text-xs text-[#DC2626]">
                驳回原因：{clinic.reject_reason}
              </div>
            )}

            {/* 表单 */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">企业名称</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isActive}
                  placeholder="请输入营业执照上的企业全称"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#2196C8] disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">企业税号</label>
                <input
                  value={taxNo}
                  onChange={(e) => setTaxNo(e.target.value)}
                  disabled={isActive}
                  placeholder="统一社会信用代码"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#2196C8] disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              {isActive ? (
                <div className="text-center text-xs text-[#16A34A] py-1">
                  企业信息已开通，如需修改请联系牙伴创始人
                </div>
              ) : (
                <button
                  onClick={submit}
                  disabled={apply.isPending}
                  className="w-full py-3 rounded-xl bg-[#2196C8] text-white text-sm font-medium active:bg-[#1B7FB0] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {apply.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {status === "rejected" ? "重新提交申请" : status === "pending" ? "更新申请信息" : "提交开通申请"}
                </button>
              )}
            </div>

            <p className="text-xs text-gray-400 px-1 leading-relaxed">
              说明：企业信息用于将您的门诊接入牙伴齿科管理平台。提交后，平台创始人将核验您的企业名称与税号并确认开通，开通后即可使用门诊员工管理、营收统计等功能。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
