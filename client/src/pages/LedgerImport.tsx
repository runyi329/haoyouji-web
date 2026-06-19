import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, HelpCircle, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ParsedRecord {
  date: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  originalData: string;
}

export default function LedgerImport() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  const [pastedData, setPastedData] = useState("");
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isParsingLoading, setIsParsingLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // 获取账本信息
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId });

  // 导入记录的mutation
  const importMutation = trpc.ledger.importRecords.useMutation({
    onSuccess: (data) => {
      toast.success(`成功导入 ${data.count} 条记录`);
      setLocation(`/ledger/${ledgerId}`);
    },
    onError: (error) => {
      toast.error(`导入失败: ${error.message}`);
    },
  });

  // 使用useMutation调用解析接口
  const parseMutation = trpc.ledger.parseImportData.useQuery(
    { data: pastedData, ledgerId },
    { enabled: false }
  );

  // 解析粘贴的数据
  const handleParse = async () => {
    if (!pastedData.trim()) {
      toast.error("请先粘贴账单数据");
      return;
    }

    setIsParsingLoading(true);
    setParseError(null);

    try {
      // 重新获取数据
      const result = await parseMutation.refetch();

      if (!result.data || result.data.records.length === 0) {
        setParseError("未能识别到有效的账单数据，请检查格式");
        setParsedRecords([]);
      } else {
        setParsedRecords(result.data.records);
        toast.success(`成功识别 ${result.data.records.length} 条记录`);
      }
    } catch (error: any) {
      setParseError(error.message || "解析失败，请检查数据格式");
      setParsedRecords([]);
    } finally {
      setIsParsingLoading(false);
    }
  };

  // 确认导入
  const handleImport = () => {
    if (parsedRecords.length === 0) {
      toast.error("没有可导入的记录");
      return;
    }

    importMutation.mutate({
      ledgerId,
      records: parsedRecords,
    });
  };

  // 删除某条记录
  const handleRemoveRecord = (index: number) => {
    setParsedRecords(prev => prev.filter((_, i) => i !== index));
  };

  // 修改某条记录的分类
  const handleUpdateCategory = (index: number, category: string) => {
    setParsedRecords(prev => prev.map((record, i) => 
      i === index ? { ...record, category } : record
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-divider sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-medium">表格导入账单</h1>
          <button
            onClick={() => setShowTutorial(true)}
            className="p-2 -mr-2"
          >
            <HelpCircle className="w-6 h-6 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="p-4 space-y-4">
        {/* 说明卡片 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <Upload className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">支持导入微信/支付宝账单</p>
              <p className="text-blue-600">
                复制账单数据后粘贴到下方文本框，系统将自动识别并导入
              </p>
            </div>
          </div>
        </div>

        {/* 文本输入区 */}
        <div className="bg-white rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              粘贴账单数据
            </label>
            <button
              onClick={() => setShowTutorial(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              如何获取？
            </button>
          </div>
          <textarea
            placeholder="请粘贴微信或支付宝账单数据...&#10;&#10;支持格式：&#10;- CSV格式（逗号分隔）&#10;- 制表符分隔&#10;- Excel复制的内容"
            rows={12}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent resize-none"
            value={pastedData}
            onChange={(e) => setPastedData(e.target.value)}
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{pastedData.length} 字符</span>
            {pastedData.length > 0 && (
              <button
                onClick={() => setPastedData("")}
                className="text-red-600 hover:underline"
              >
                清空
              </button>
            )}
          </div>
        </div>

        {/* 解析按钮 */}
        <Button
          onClick={handleParse}
          disabled={!pastedData.trim() || isParsingLoading}
          className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white h-12 text-base"
        >
          {isParsingLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
              解析中...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 mr-2" />
              解析数据
            </>
          )}
        </Button>

        {/* 解析错误提示 */}
        {parseError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium mb-1">解析失败</p>
                <p className="text-red-600">{parseError}</p>
              </div>
            </div>
          </div>
        )}

        {/* 解析结果预览 */}
        {parsedRecords.length > 0 && (
          <div className="bg-white rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-medium">识别到 {parsedRecords.length} 条记录</h3>
              </div>
            </div>

            {/* 记录列表 */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {parsedRecords.map((record, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className={`text-lg font-semibold ${
                          record.type === 'income' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {record.type === 'income' ? '+' : '-'}¥{record.amount.toFixed(2)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {record.category}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {record.description}
                      </div>
                      <div className="text-xs text-gray-400">
                        {record.date}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveRecord(index)}
                      className="text-red-600 text-xs hover:underline ml-2"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 导入按钮 */}
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base"
            >
              {importMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  导入中...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  确认导入 {parsedRecords.length} 条记录
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* 教程对话框 */}
      <Dialog open={showTutorial} onOpenChange={setShowTutorial}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>如何获取账单数据？</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {/* 微信账单 */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">📱 微信账单</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-600">
                <li>打开微信 → 我 → 服务 → 钱包</li>
                <li>点击"账单" → 右上角"常见问题"</li>
                <li>选择"下载账单" → 用途选"个人对账"</li>
                <li>账单会发送到邮箱或文件传输助手</li>
                <li>用手机打开CSV文件（WPS/Numbers）</li>
                <li>全选复制内容，粘贴到本页面</li>
              </ol>
            </div>

            {/* 支付宝账单 */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">💰 支付宝账单</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-600">
                <li>打开支付宝 → 我的 → 账单</li>
                <li>点击右上角"..." → 开具交易流水证明</li>
                <li>选择时间范围 → 申请</li>
                <li>证明会发送到邮箱</li>
                <li>用手机打开文件，复制内容</li>
                <li>粘贴到本页面</li>
              </ol>
            </div>

            {/* 通用Excel */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">📊 通用表格</h4>
              <p className="text-gray-600">
                如果您有Excel或其他表格数据，请确保包含以下列：
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
                <li>日期/时间</li>
                <li>金额</li>
                <li>收支类型（收入/支出）</li>
                <li>分类或备注（可选）</li>
              </ul>
            </div>
          </div>
          <Button
            onClick={() => setShowTutorial(false)}
            className="w-full"
          >
            知道了
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
