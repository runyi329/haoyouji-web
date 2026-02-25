import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AdminMigration() {
  const [, setLocation] = useLocation();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string>("");

  const migrateMutation = trpc.adminFeature.migratePendingType.useMutation();

  const runMigration = async () => {
    if (!confirm("确定要执行数据库迁移吗？这将添加 pending_type 字段到 ledger_records 表。")) {
      return;
    }

    setIsRunning(true);
    setResult("正在执行迁移...");

    try {
      const response = await migrateMutation.mutateAsync();
      setResult(`✅ 迁移成功！\n\n${JSON.stringify(response, null, 2)}`);
      toast.success("数据库迁移成功！");
    } catch (error: any) {
      const errorMsg = error.message || "未知错误";
      setResult(`❌ 迁移失败！\n\n错误信息：${errorMsg}`);
      toast.error(`迁移失败：${errorMsg}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-4"
        >
          ← 返回
        </Button>

        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">数据库迁移管理</h1>
          
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Pending Type 字段迁移</h2>
              <p className="text-sm text-gray-600 mb-4">
                此迁移将在 ledger_records 表中添加 pending_type 字段，用于支持代收/代付功能。
              </p>
              
              <Button
                onClick={runMigration}
                disabled={isRunning}
                className="w-full"
              >
                {isRunning ? "执行中..." : "执行迁移"}
              </Button>
            </div>

            {result && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">执行结果：</h3>
                <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto whitespace-pre-wrap">
                  {result}
                </pre>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
