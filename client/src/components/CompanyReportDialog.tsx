import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface CompanyReport {
  id: number;
  companyName: string;
  reportFileUrl: string;
  formattedContent: {
    basicInfo: {
      registeredCapital: string;
      establishDate: string;
      legalRepresentative: string;
      businessStatus: string;
    };
    businessScope: {
      mainBusiness: string;
      businessScope: string;
    };
    financialData: {
      revenue: string;
      profit: string;
      assets: string;
    };
    riskInfo: {
      lawsuits: string;
      penalties: string;
      abnormalRecords: string;
    };
    shareholderInfo: {
      mainShareholders: Array<{
        name: string;
        shareholding: string;
      }>;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

interface CompanyReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
}

export function CompanyReportDialog({ open, onOpenChange, companyName }: CompanyReportDialogProps) {
  const [report, setReport] = useState<CompanyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && companyName) {
      fetchReport();
    }
  }, [open, companyName]);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/company-reports/${encodeURIComponent(companyName)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '获取报告失败');
      }

      if (!data.data) {
        setError('该公司暂无报告');
        setReport(null);
      } else {
        setReport(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取报告失败');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{companyName}</span>
            <span className="text-sm font-normal text-muted-foreground">企业报告</span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">加载中...</span>
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-muted-foreground">
            {error}
          </div>
        )}

        {!loading && !error && report && (
          <div className="space-y-6">
            {/* 📊 基本信息 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>📊</span>
                <span>基本信息</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">注册资本：</span>
                  <span>{report.formattedContent.basicInfo.registeredCapital}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">成立日期：</span>
                  <span>{report.formattedContent.basicInfo.establishDate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">法人代表：</span>
                  <span>{report.formattedContent.basicInfo.legalRepresentative}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">经营状态：</span>
                  <span>{report.formattedContent.basicInfo.businessStatus}</span>
                </div>
              </div>
            </section>

            {/* 🏢 经营状况 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>🏢</span>
                <span>经营状况</span>
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">主营业务：</span>
                  <p className="mt-1">{report.formattedContent.businessScope.mainBusiness}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">经营范围：</span>
                  <p className="mt-1 text-xs leading-relaxed">{report.formattedContent.businessScope.businessScope}</p>
                </div>
              </div>
            </section>

            {/* 💰 财务数据 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>💰</span>
                <span>财务数据</span>
              </h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">营业收入：</span>
                  <span>{report.formattedContent.financialData.revenue}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">净利润：</span>
                  <span>{report.formattedContent.financialData.profit}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">总资产：</span>
                  <span>{report.formattedContent.financialData.assets}</span>
                </div>
              </div>
            </section>

            {/* ⚖️ 风险信息 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>⚖️</span>
                <span>风险信息</span>
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">诉讼信息：</span>
                  <span className="ml-2">{report.formattedContent.riskInfo.lawsuits}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">行政处罚：</span>
                  <span className="ml-2">{report.formattedContent.riskInfo.penalties}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">经营异常：</span>
                  <span className="ml-2">{report.formattedContent.riskInfo.abnormalRecords}</span>
                </div>
              </div>
            </section>

            {/* 🤝 股东信息 */}
            {report.formattedContent.shareholderInfo.mainShareholders.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span>🤝</span>
                  <span>股东信息</span>
                </h3>
                <div className="space-y-2 text-sm">
                  {report.formattedContent.shareholderInfo.mainShareholders.map((shareholder, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{shareholder.name}</span>
                      <span className="text-muted-foreground">{shareholder.shareholding}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 更新时间 */}
            <div className="text-xs text-muted-foreground text-right pt-4 border-t">
              最后更新：{new Date(report.updatedAt).toLocaleString('zh-CN')}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
