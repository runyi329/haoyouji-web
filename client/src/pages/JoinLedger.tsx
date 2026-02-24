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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: `${'#D32F2F'}15` }}>
        <Card className="p-8 bg-white max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#D32F2F' }} />
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#1F2937' }}>需要登录</h2>
          <p className="text-gray-600 mb-6">
            您需要先登录脉动账号才能加入账本
          </p>
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            className="w-full text-white hover:opacity-90"
            style={{ backgroundColor: '#D32F2F' }}
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: `${'#D32F2F'}15` }}>
        <Card className="p-8 bg-white max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-[#4CAF50] mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#1F2937' }}>加入成功！</h2>
          <p className="text-gray-600 mb-2">
            您已成功加入账本
          </p>
          <p className="text-lg font-semibold mb-6" style={{ color: '#1F2937' }}>
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: `${'#D32F2F'}15` }}>
        <Card className="p-8 bg-white max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-[#D32F2F] mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#1F2937' }}>加入失败</h2>
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
              className="flex-1 text-white hover:opacity-90"
              style={{ backgroundColor: '#D32F2F' }}
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: `${'#D32F2F'}15` }}>
      <Card className="p-8 bg-white max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${'#D32F2F'}30` }}>
          <span className="text-3xl">📒</span>
        </div>
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#1F2937' }}>加入账本</h2>
        <p className="text-gray-600 mb-6">
          您收到了一个账本邀请，点击下方按钮即可加入
        </p>
        <Button
          onClick={handleJoin}
          disabled={isJoining}
          className="w-full text-white hover:opacity-90"
          style={{ backgroundColor: '#D32F2F' }}
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
