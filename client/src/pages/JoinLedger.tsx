import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

export default function JoinLedger() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [isJoining, setIsJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [ledgerInfo, setLedgerInfo] = useState<{ id: number; name: string } | null>(null);

  // 加入账本的mutation
  const joinMutation = trpc.ledger.joinByToken.useMutation({
    onSuccess: (data) => {
      setJoinStatus("success");
      setLedgerInfo({ id: data.id, name: data.name });
      // 3秒后跳转到账本详情页
      setTimeout(() => {
        setLocation(`/ledger/${data.id}`);
      }, 3000);
    },
    onError: (error) => {
      setJoinStatus("error");
      setErrorMessage(error.message || "加入账本失败，请稍后重试");
    },
  });

  // 处理加入账本
  const handleJoin = async () => {
    if (!user) {
      // 未登录，跳转到登录页
      window.location.href = getLoginUrl();
      return;
    }

    setIsJoining(true);
    try {
      await joinMutation.mutateAsync({ token: token! });
    } catch (error) {
      console.error("加入账本失败:", error);
    } finally {
      setIsJoining(false);
    }
  };

  // 如果未登录，显示登录提示
  if (!user) {
    return (
      <div className="min-h-screen bg-[#e0fcff] flex items-center justify-center p-4">
        <Card className="p-8 bg-white max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-[#ff7f50] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#404969] mb-4">需要登录</h2>
          <p className="text-gray-600 mb-6">
            您需要先登录脉动账号才能加入账本
          </p>
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            className="w-full bg-[#ff7f50] hover:bg-[#ff6a3d] text-white"
          >
            前往登录
          </Button>
        </Card>
      </div>
    );
  }

  // 加入成功
  if (joinStatus === "success" && ledgerInfo) {
    return (
      <div className="min-h-screen bg-[#e0fcff] flex items-center justify-center p-4">
        <Card className="p-8 bg-white max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#404969] mb-4">加入成功！</h2>
          <p className="text-gray-600 mb-2">
            您已成功加入账本
          </p>
          <p className="text-lg font-semibold text-[#404969] mb-6">
            {ledgerInfo.name}
          </p>
          <p className="text-sm text-gray-500">
            即将跳转到账本页面...
          </p>
        </Card>
      </div>
    );
  }

  // 加入失败
  if (joinStatus === "error") {
    return (
      <div className="min-h-screen bg-[#e0fcff] flex items-center justify-center p-4">
        <Card className="p-8 bg-white max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#404969] mb-4">加入失败</h2>
          <p className="text-gray-600 mb-6">
            {errorMessage}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setLocation("/ledger")}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
            >
              返回账本列表
            </Button>
            <Button
              onClick={() => {
                setJoinStatus("idle");
                setErrorMessage("");
              }}
              className="flex-1 bg-[#ff7f50] hover:bg-[#ff6a3d] text-white"
            >
              重试
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 待加入状态
  return (
    <div className="min-h-screen bg-[#e0fcff] flex items-center justify-center p-4">
      <Card className="p-8 bg-white max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-[#bde4f4] flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📒</span>
        </div>
        <h2 className="text-2xl font-bold text-[#404969] mb-4">加入账本</h2>
        <p className="text-gray-600 mb-6">
          您收到了一个账本邀请，点击下方按钮即可加入
        </p>
        <Button
          onClick={handleJoin}
          disabled={isJoining}
          className="w-full bg-[#ff7f50] hover:bg-[#ff6a3d] text-white"
        >
          {isJoining ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              加入中...
            </>
          ) : (
            "确认加入"
          )}
        </Button>
        <Button
          onClick={() => setLocation("/ledger")}
          className="w-full mt-3 bg-gray-200 hover:bg-gray-300 text-gray-800"
        >
          取消
        </Button>
      </Card>
    </div>
  );
}
