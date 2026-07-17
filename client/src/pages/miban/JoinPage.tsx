// @ts-nocheck
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function JoinPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [code, setCode] = useState<string>("");
  const [bound, setBound] = useState(false);

  // 从 URL 中读取 ref 参数
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? "";
    if (ref) setCode(ref.toUpperCase());
  }, []);

  const { data: validateData, isLoading: validating } = mtrpc.mibanInvite.validate.useQuery(
    { code },
    { enabled: code.length === 6 }
  );

  const [bindStatus, setBindStatus] = useState<"idle" | "binding" | "success" | "alreadyBound" | "error">("idle");

  const bindMutation = mtrpc.mibanInvite.bind.useMutation({
    onSuccess: (data) => {
      if (data.alreadyBound) {
        setBindStatus("alreadyBound");
      } else {
        setBindStatus("success");
        setBound(true);
        setTimeout(() => setLocation("/"), 2000);
      }
    },
    onError: () => setBindStatus("error"),
  });

  // 用户登录后自动绑定邀请关系
  useEffect(() => {
    if (user && code.length === 6 && validateData?.valid && bindStatus === "idle") {
      setBindStatus("binding");
      bindMutation.mutate({ inviteCode: code });
    }
  }, [user, validateData]);

  const inviterName = validateData?.inviter?.name ?? "朋友";

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-white">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#FF6900] flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-2xl font-bold">米</span>
        </div>
        <h1 className="text-2xl font-bold">米伴</h1>
        <p className="text-white/50 text-sm mt-1">定制大米健康平台</p>
      </div>

      {/* 邀请卡片 */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
        {validating && code.length === 6 ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <Spinner className="w-8 h-8 text-[#FF6900]" />
            <p className="text-white/60 text-sm">验证邀请码中…</p>
          </div>
        ) : validateData?.valid ? (
          <>
            <div className="w-12 h-12 rounded-full bg-[#FF6900]/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-[#FF6900] text-base font-bold">米</span>
            </div>
            <h2 className="text-lg font-semibold mb-1">
              <span className="text-[#FF6900]">{inviterName}</span> 邀请你加入米伴
            </h2>
            <p className="text-white/50 text-sm mb-6">
              定制专属健康配米，让每一粒米都有意义
            </p>
            <div className="bg-white/5 rounded-xl px-4 py-3 mb-6 text-sm text-white/60">
              邀请码：<span className="text-white font-mono font-bold tracking-widest">{code}</span>
            </div>

            {bindStatus === "success" ? (
              <div className="text-green-400 text-sm flex items-center justify-center gap-2">
                绑定成功，正在跳转…
              </div>
            ) : bindStatus === "alreadyBound" ? (
              <div className="space-y-3">
                <p className="text-yellow-400 text-sm">你已经有推荐人，无法重复绑定</p>
                <Button
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl h-12"
                  onClick={() => setLocation("/")}
                >
                  进入米伴
                </Button>
              </div>
            ) : bindStatus === "error" ? (
              <div className="space-y-3">
                <p className="text-red-400 text-sm">绑定失败，请重试</p>
                <Button
                  className="w-full bg-[#FF6900] hover:bg-[#e55f00] text-white font-semibold rounded-xl h-12"
                  onClick={() => { setBindStatus("idle"); }}
                >
                  重试
                </Button>
              </div>
            ) : bindStatus === "binding" ? (
              <div className="text-white/50 text-sm flex items-center justify-center gap-2">
                <Spinner className="w-4 h-4" /> 绑定中…
              </div>
            ) : user ? (
              <div className="text-white/50 text-sm">正在处理…</div>
            ) : (
              <Button
                className="w-full bg-[#FF6900] hover:bg-[#e55f00] text-white font-semibold rounded-xl h-12"
                onClick={() => window.location.href = "/login"}
              >
                登录 / 注册，接受邀请
              </Button>
            )}
          </>
        ) : code.length === 6 ? (
          <>
            <h2 className="text-lg font-semibold mb-2">邀请码无效</h2>
            <p className="text-white/50 text-sm mb-6">该邀请码不存在或已失效，请联系邀请人重新获取</p>
            <Button
              variant="outline"
              className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl h-12"
              onClick={() => setLocation("/")}
            >
              返回首页
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-2">欢迎来到米伴</h2>
            <p className="text-white/50 text-sm mb-6">定制你的专属健康配米方案</p>
            <Button
              className="w-full bg-[#FF6900] hover:bg-[#e55f00] text-white font-semibold rounded-xl h-12"
              onClick={() => setLocation("/")}
            >
              探索米伴
            </Button>
          </>
        )}
      </div>

      <p className="mt-8 text-white/30 text-xs text-center">
        米伴 · 让每一粒米都有意义
      </p>
    </div>
  );
}
