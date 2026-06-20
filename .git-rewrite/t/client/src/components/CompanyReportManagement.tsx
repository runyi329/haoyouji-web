import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, Loader2, Eye, Edit, Trash2, FileText, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { CompanyReportDialog } from '@/components/CompanyReportDialog';
import { CompanyReportIcon } from '@/components/CompanyReportIcon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Company {
  companyName: string;
  contactId: number;
  contactName: string;
  userName: string;
  reportId: number | null;
  reportUpdatedAt: string | null;
  duplicateCount: number;
}

// 上传状态类型
type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

export default function CompanyReportManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingCompany, setUploadingCompany] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // 上传相关状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [currentCompany, setCurrentCompany] = useState<string | null>(null);

  // 前端预览相关状态
  const [showFrontendPreview, setShowFrontendPreview] = useState(false);
  const [previewCompanyName, setPreviewCompanyName] = useState<string | null>(null);

  // 提示词管理相关状态
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // 编辑报告相关状态
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingReport, setEditingReport] = useState<{ id: number; content: string } | null>(null);
  const [editContent, setEditContent] = useState('');

  // 搜索、筛选、排序状态
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'uploaded' | 'not_uploaded'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'submitter'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 上传对话框状态
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadingCompanyData, setUploadingCompanyData] = useState<Company | null>(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/company-reports/companies');
      const result = await response.json();
      
      if (result.success) {
        setCompanies(result.data);
      } else {
        toast.error(result.error || '加载公司列表失败');
      }
    } catch (error) {
      console.error('加载公司列表错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrompt = async () => {
    try {
      setIsLoadingPrompt(true);
      const response = await fetch('/api/company-reports/prompt');
      const result = await response.json();
      
      if (result.success) {
        setPrompt(result.data.prompt);
      } else {
        toast.error(result.error || '加载提示词失败');
      }
    } catch (error) {
      console.error('加载提示词错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const savePrompt = async () => {
    try {
      setIsSavingPrompt(true);
      const response = await fetch('/api/company-reports/prompt', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
      const result = await response.json();
      
      if (result.success) {
        toast.success('提示词已更新');
        setShowPromptDialog(false);
      } else {
        toast.error(result.error || '更新提示词失败');
      }
    } catch (error) {
      console.error('更新提示词错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleFileUpload = async (companyName: string) => {
    if (!selectedFile) {
      toast.error('请选择 PDF 文件');
      return;
    }

    try {
      setUploadingCompany(companyName);
      setUploadStatus('uploading');
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('companyName', companyName);

      // 模拟上传进度（快速到达 20%）
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 20) {
            clearInterval(progressInterval);
            return 20;
          }
          return prev + 10;
        });
      }, 200);

      // 开始上传，同时切换到分析状态
      setTimeout(() => {
        clearInterval(progressInterval);
        setUploadProgress(30);
        setUploadStatus('analyzing');
        
        // 分析阶段的进度模拟（慢速增长）
        const analyzeInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 85) {
              clearInterval(analyzeInterval);
              return 85;
            }
            return prev + 5;
          });
        }, 1500);
      }, 600);

      // 等待 API 响应（实际 AI 分析在后端进行）
      const response = await fetch('/api/company-reports/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      // API 返回后，进度跳到 100%
      setUploadProgress(100);

      if (result.success) {
        setUploadStatus('success');
        toast.success('报告上传并分析完成！');
        setSelectedFile(null);
        setCurrentCompany(null);
        
        // 立即刷新列表，然后延迟重置状态
        await loadCompanies();
        
        // 保持成功状态 1.5 秒，让用户看清
        setTimeout(() => {
          setUploadStatus('idle');
          setUploadProgress(0);
          setShowUploadDialog(false);
        }, 1500);
      } else {
        setUploadStatus('error');
        toast.error(result.error || '上传失败');
        setTimeout(() => {
          setUploadStatus('idle');
          setUploadProgress(0);
        }, 2000);
      }
    } catch (error) {
      console.error('上传错误:', error);
      setUploadStatus('error');
      toast.error('网络错误，请稍后重试');
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 2000);
    } finally {
      setUploadingCompany(null);
    }
  };

  const handleDeleteReport = async (reportId: number, companyName: string) => {
    if (!confirm(`确定要删除「${companyName}」的企业报告吗？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/company-reports/by-id/${reportId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast.success('删除报告成功！');
        loadCompanies(); // 刷新列表
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除报告错误:', error);
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleEditReport = async (reportId: number, companyName: string) => {
    try {
      const response = await fetch(`/api/company-reports/${encodeURIComponent(companyName)}`);
      const result = await response.json();

      if (result.success && result.data) {
        setEditingReport({ id: reportId, content: companyName });
        setEditContent(JSON.stringify(result.data.formattedContent, null, 2));
        setShowEditDialog(true);
      } else {
        toast.error('获取报告失败');
      }
    } catch (error) {
      console.error('获取报告错误:', error);
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingReport) return;

    try {
      const formattedContent = JSON.parse(editContent);

      const response = await fetch(`/api/company-reports/by-id/${editingReport.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formattedContent }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('保存成功！');
        setShowEditDialog(false);
        setEditingReport(null);
        setEditContent('');
        loadCompanies(); // 刷新列表
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error('JSON 格式错误，请检查后重试');
      } else {
        console.error('保存报告错误:', error);
        toast.error('网络错误，请稍后重试');
      }
    }
  };

  const getUploadStatusText = () => {
    switch (uploadStatus) {
      case 'uploading':
        return 'PDF 上传中...';
      case 'analyzing':
        return 'DeepSeek AI 分析中...（预计 15-30 秒）';
      case 'success':
        return '✓ 分析完成！';
      case 'error':
        return '✗ 上传失败';
      default:
        return '';
    }
  };

  // 筛选、排序和分页逻辑
  const filteredAndSortedCompanies = useMemo(() => {
    let result = [...companies];

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(company => 
        company.companyName.toLowerCase().includes(query) ||
        company.contactName.toLowerCase().includes(query) ||
        company.userName.toLowerCase().includes(query)
      );
    }

    // 状态过滤
    if (filterStatus === 'uploaded') {
      result = result.filter(company => company.reportId !== null);
    } else if (filterStatus === 'not_uploaded') {
      result = result.filter(company => company.reportId === null);
    }

    // 排序
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.companyName.localeCompare(b.companyName, 'zh-CN');
          break;
        case 'time':
          const timeA = a.reportUpdatedAt ? new Date(a.reportUpdatedAt).getTime() : 0;
          const timeB = b.reportUpdatedAt ? new Date(b.reportUpdatedAt).getTime() : 0;
          comparison = timeA - timeB;
          break;
        case 'submitter':
          comparison = a.userName.localeCompare(b.userName, 'zh-CN');
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [companies, searchQuery, filterStatus, sortBy, sortOrder]);

  // 分页数据
  const totalPages = Math.ceil(filteredAndSortedCompanies.length / pageSize);
  const paginatedCompanies = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedCompanies.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedCompanies, currentPage, pageSize]);

  // 重置到第一页当筛选条件改变时
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, sortBy, sortOrder]);

  const handleOpenUploadDialog = (company: Company) => {
    setUploadingCompanyData(company);
    setCurrentCompany(company.companyName);
    setSelectedFile(null);
    setShowUploadDialog(true);
  };

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h3 className="text-lg font-semibold">AI 企业报告管理</h3>
        
        <Dialog open={showPromptDialog} onOpenChange={(open) => {
          setShowPromptDialog(open);
          if (open) loadPrompt();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Edit className="w-4 h-4 mr-2" />
              管理提示词
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>管理 AI 分析提示词</DialogTitle>
            </DialogHeader>
            {isLoadingPrompt ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>提示词内容</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={15}
                    className="mt-2 font-mono text-sm"
                    placeholder="输入 AI 分析提示词..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={savePrompt}
                    disabled={isSavingPrompt}
                    className="flex-1"
                  >
                    {isSavingPrompt ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowPromptDialog(false)}
                    className="flex-1"
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索公司名称、联系人..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* 状态筛选 */}
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger>
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="uploaded">已上传</SelectItem>
                <SelectItem value="not_uploaded">未上传</SelectItem>
              </SelectContent>
            </Select>

            {/* 排序方式 */}
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger>
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">按公司名称</SelectItem>
                <SelectItem value="time">按上传时间</SelectItem>
                <SelectItem value="submitter">按填写人</SelectItem>
              </SelectContent>
            </Select>

            {/* 排序顺序 */}
            <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
              <SelectTrigger>
                <SelectValue placeholder="排序顺序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">升序</SelectItem>
                <SelectItem value="desc">降序</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 统计信息 */}
          <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
            <span>共 {companies.length} 家公司</span>
            <span>已上传 {companies.filter(c => c.reportId).length} 份报告</span>
            <span>当前显示 {filteredAndSortedCompanies.length} 条结果</span>
          </div>
        </CardContent>
      </Card>

      {/* 表格视图 */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      ) : filteredAndSortedCompanies.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无数据</p>
            <p className="text-sm mt-2">
              {searchQuery || filterStatus !== 'all' 
                ? '没有找到符合条件的公司' 
                : '请先在联系人中添加公司名称'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 桌面端表格 */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[25%]">公司名称</TableHead>
                    <TableHead className="w-[15%]">联系人</TableHead>
                    <TableHead className="w-[15%]">填写人</TableHead>
                    <TableHead className="w-[15%]">状态</TableHead>
                    <TableHead className="w-[30%] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCompanies.map((company, index) => (
                    <TableRow key={`${company.contactId}-${index}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{company.companyName}</span>
                          {company.duplicateCount > 1 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              重复 {company.duplicateCount}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{company.contactName}</TableCell>
                      <TableCell>{company.userName}</TableCell>
                      <TableCell>
                        {company.reportId ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-[#E8F5E9] text-green-800">
                            ✓ 已上传
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            未上传
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {company.reportId ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPreviewCompanyName(company.companyName);
                                  setShowFrontendPreview(true);
                                }}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                查看
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditReport(company.reportId!, company.companyName)}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[#D32F2F] hover:text-[#D32F2F]"
                                onClick={() => handleDeleteReport(company.reportId!, company.companyName)}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                删除
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleOpenUploadDialog(company)}
                              disabled={uploadingCompany === company.companyName}
                            >
                              {uploadingCompany === company.companyName ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  处理中
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-1" />
                                  上传
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 移动端卡片视图 */}
          <div className="md:hidden space-y-3">
            {paginatedCompanies.map((company, index) => (
              <Card key={`${company.contactId}-${index}`} className={company.duplicateCount > 1 ? 'border-amber-200 bg-amber-50/30' : ''}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* 公司信息 */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{company.companyName}</h4>
                        {company.duplicateCount > 1 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            重复 {company.duplicateCount}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        联系人：{company.contactName} · 填写人：{company.userName}
                      </p>
                      {company.reportId ? (
                        <p className="text-xs text-[#4CAF50] mt-1">
                          ✓ 已上传报告
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          未上传报告
                        </p>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                      {company.reportId ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setPreviewCompanyName(company.companyName);
                              setShowFrontendPreview(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            查看
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditReport(company.reportId!, company.companyName)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[#D32F2F]"
                            onClick={() => handleDeleteReport(company.reportId!, company.companyName)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenUploadDialog(company)}
                          disabled={uploadingCompany === company.companyName}
                        >
                          {uploadingCompany === company.companyName ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              处理中
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-1" />
                              上传报告
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* 每页数量选择 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">每页显示</span>
                    <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(Number(value))}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">条</span>
                  </div>

                  {/* 分页按钮 */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm px-4">
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 上传对话框 */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>上传企业报告</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>公司名称</Label>
              <Input
                value={uploadingCompanyData?.companyName || ''}
                disabled
                className="mt-2"
              />
            </div>
            <div>
              <Label>选择 PDF 文件</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                  }
                }}
                className="mt-2"
                disabled={uploadingCompany === uploadingCompanyData?.companyName}
              />
            </div>

            {/* 上传进度显示 */}
            {uploadingCompany === uploadingCompanyData?.companyName && (
              <div className="space-y-2 p-3 bg-[#F5F5F5] rounded-lg border border-blue-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#424242]">{getUploadStatusText()}</span>
                  <span className="text-blue-700">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                {uploadStatus === 'analyzing' && (
                  <p className="text-xs text-[#1976D2]">
                    正在提取 PDF 文本并调用 DeepSeek AI 进行分析...
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => handleFileUpload(uploadingCompanyData?.companyName || '')}
                disabled={!selectedFile || uploadingCompany === uploadingCompanyData?.companyName}
                className="flex-1"
              >
                {uploadingCompany === uploadingCompanyData?.companyName ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    处理中
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    上传
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadDialog(false);
                  setSelectedFile(null);
                  setCurrentCompany(null);
                }}
                disabled={uploadingCompany === uploadingCompanyData?.companyName}
                className="flex-1"
              >
                取消
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 前端预览弹窗 */}
      {previewCompanyName && (
        <CompanyReportDialog
          open={showFrontendPreview}
          onOpenChange={setShowFrontendPreview}
          companyName={previewCompanyName}
        />
      )}

      {/* 编辑报告弹窗 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑企业报告</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>JSON 内容</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={20}
                className="font-mono text-sm mt-2"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveEdit}
                className="flex-1"
              >
                保存
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                className="flex-1"
              >
                取消
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
