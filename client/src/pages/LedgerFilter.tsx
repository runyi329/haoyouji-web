import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";

export default function LedgerFilter() {
  const [, params] = useRoute("/ledger/:id/filter");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");

  // 获取账本成员
  const { data: membersData } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 筛选条件状态
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  // 切换成员选择
  const toggleMember = (memberId: number) => {
    if (memberId === 0) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(prev => 
        prev.includes(memberId) 
          ? prev.filter(id => id !== memberId)
          : [...prev, memberId]
      );
    }
  };
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["all"]);
  const [note, setNote] = useState("");
  const [showAmountRange, setShowAmountRange] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState("week"); // week, month, year, ytd, custom
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [showCategories, setShowCategories] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [expandedSubCategories, setExpandedSubCategories] = useState<Set<number>>(new Set());

  // 点击一级分类:选中/取消选中,并切换展开/收起
  const handleCategoryClick = (categoryId: number) => {
    // 切换选中状态
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
    // 切换展开状态
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // 点击二级分类:选中/取消选中,并切换展开/收起
  const handleSubCategoryClick = (subCategoryId: number) => {
    // 切换选中状态
    setSelectedCategories(prev =>
      prev.includes(subCategoryId)
        ? prev.filter(id => id !== subCategoryId)
        : [...prev, subCategoryId]
    );
    // 切换展开状态
    setExpandedSubCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subCategoryId)) {
        newSet.delete(subCategoryId);
      } else {
        newSet.add(subCategoryId);
      }
      return newSet;
    });
  };

  // 获取账本分类（收入和支出共享同一套分类）
  const { data: categoriesData } = trpc.ledger.getCategories.useQuery({ 
    ledgerId,
  });

  // 构建分类层级关系
  const buildCategoryTree = (categories: any[]) => {
    if (!categories) return [];
    
    // 找出所有顶级分类（parentId为null）
    const topLevel = categories.filter(c => c.parentId === null);
    
    // 为每个顶级分类找子分类
    return topLevel.map(parent => ({
      ...parent,
      children: categories.filter(c => c.parentId === parent.id).map(child => ({
        ...child,
        children: categories.filter(c => c.parentId === child.id)
      }))
    }));
  };

  const categoryTree = buildCategoryTree(categoriesData || []);

  // 账目类型选项
  const transactionTypes = [
    { value: "all", label: "不限制", color: "bg-[#1976D2]" },
    { value: "expense", label: "支出", color: "bg-[#CBA471]" },
    { value: "income", label: "收入", color: "bg-[#4CAF50]" },
  ];

  // 支付方式选项（与添加账目页面保持一致）
  const accountTypes = [
    { value: "all", label: "全部", color: "bg-[#1976D2]" },
    { value: "wechat", label: "微信", color: "bg-[#4CAF50]" },
    { value: "alipay", label: "支付宝", color: "bg-blue-400" },
    { value: "bank", label: "银行卡", color: "bg-[#CBA471]" },
    { value: "digital", label: "数字钱包", color: "bg-[#D32F2F]" },
    { value: "cash", label: "现金", color: "bg-gray-500" },
  ];

  // 根据账目类型动态显示标签
  const getAccountLabel = () => {
    if (selectedType === "expense") return "付款账户";
    if (selectedType === "income") return "收款账户";
    return "支付方式";
  };

  // 切换支付方式选择
  const toggleAccount = (accountValue: string) => {
    if (accountValue === "all") {
      // 点击全部：如果已全选则取消全选，否则全选
      if (selectedAccounts.includes("all")) {
        setSelectedAccounts([]);
      } else {
        setSelectedAccounts(["all"]);
      }
    } else {
      // 点击单个支付方式
      setSelectedAccounts(prev => {
        // 如果当前是全选状态，则取消全选并只选中当前项
        if (prev.includes("all")) {
          return [accountValue];
        }
        // 切换选中状态
        if (prev.includes(accountValue)) {
          return prev.filter(v => v !== accountValue);
        } else {
          return [...prev, accountValue];
        }
      });
    }
  };

  // 重置所有条件
  const handleReset = () => {
    setSelectedMemberIds([]);
    setSelectedDateRange("week");
    setShowCustomDate(false);
    // 重置为过去一周
    const today = new Date();
    const endDate = today.toISOString().split("T")[0];
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const startDate = weekAgo.toISOString().split("T")[0];
    setDateStart(startDate);
    setDateEnd(endDate);
    setAmountMin("");
    setAmountMax("");
    setSelectedType("all");
    setSelectedAccounts(["all"]);
    setSelectedCategories([]);
    setNote("");
  };

  // 确定搜索
  const handleSearch = () => {
    // 构建筛选条件对象
    const filters: any = {};
    
    // 时间范围
    if (dateStart) filters.startDate = dateStart;
    if (dateEnd) filters.endDate = dateEnd;
    
    // 金额范围
    if (amountMin) filters.amountMin = amountMin;
    if (amountMax) filters.amountMax = amountMax;
    
    // 账目类型
    if (selectedType && selectedType !== 'all') {
      filters.type = selectedType;
    }
    
    // 账目分类
    if (selectedCategories.length > 0) {
      filters.categoryIds = selectedCategories.join(',');
    }
    
    // 记账人
    if (selectedMemberIds.length > 0) {
      filters.memberIds = selectedMemberIds.join(',');
    }
    
    // 支付方式
    if (selectedAccounts.length > 0 && !selectedAccounts.includes('all')) {
      filters.accounts = selectedAccounts.join(',');
    }
    
    // 备注
    if (note.trim()) {
      filters.note = note.trim();
    }
    
    // 将筛选条件序列化为URL参数
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      params.set(key, filters[key]);
    });
    
    // 跳转到账本详情页并传递筛选条件
    const queryString = params.toString();
    setLocation(`/ledger/${ledgerId}${queryString ? `?${queryString}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-rose-50 flex flex-col">
      {/* 顶部标题栏 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] px-3 py-2.5 flex items-center shadow-md">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="flex-1 text-center text-base font-medium text-white">筛选账单</h1>
        <div className="w-5"></div>
      </div>

      {/* 筛选条件区域 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 记账人 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">记账人</label>
            <button
              onClick={() => setShowMemberPicker(true)}
              className="w-8 h-8 rounded-full bg-[#D32F2F] flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 overflow-hidden"
            >
              {selectedMemberIds.length === 0 ? (
                <span className="text-[8px] leading-tight">全部<br />成员</span>
              ) : selectedMemberIds.length === 1 ? (
                <span className="text-[10px]">成员</span>
              ) : (
                <span className="text-[10px]">多选</span>
              )}
            </button>
          </div>
        </div>

        {/* 账目时间 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">账目时间</label>
            {dateStart && dateEnd && (
              <span className="text-xs text-gray-400">
                {dateStart} 至 {dateEnd}
              </span>
            )}
          </div>
          <div className="flex gap-1.5 mb-2">
            {[
              { value: "week", label: "近一周" },
              { value: "month", label: "近一月" },
              { value: "year", label: "近一年" },
              { value: "ytd", label: "今年至今" },
              { value: "custom", label: "自定义" },
            ].map((range) => (
              <Button
                key={range.value}
                variant={selectedDateRange === range.value ? "default" : "outline"}
                size="sm"
                className={`text-xs h-7 rounded ${
                  selectedDateRange === range.value
                    ? "bg-[#1976D2] text-white hover:bg-[#1976D2]"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => {
                  setSelectedDateRange(range.value);
                  if (range.value === "custom") {
                    setShowCustomDate(true);
                  } else {
                    setShowCustomDate(false);
                    // 计算快捷时间范围
                    const today = new Date();
                    const endDate = today.toISOString().split("T")[0];
                    let startDate = "";
                    
                    if (range.value === "week") {
                      const weekAgo = new Date(today);
                      weekAgo.setDate(weekAgo.getDate() - 7);
                      startDate = weekAgo.toISOString().split("T")[0];
                    } else if (range.value === "month") {
                      const monthAgo = new Date(today);
                      monthAgo.setMonth(monthAgo.getMonth() - 1);
                      startDate = monthAgo.toISOString().split("T")[0];
                    } else if (range.value === "year") {
                      const yearAgo = new Date(today);
                      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                      startDate = yearAgo.toISOString().split("T")[0];
                    } else if (range.value === "ytd") {
                      startDate = `${today.getFullYear()}-01-01`;
                    }
                    
                    setDateStart(startDate);
                    setDateEnd(endDate);
                  }
                }}
              >
                {range.label}
              </Button>
            ))}
          </div>
          {showCustomDate && (
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                placeholder="开始日期"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="flex-1 min-w-0 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
              />
              <span className="text-gray-400 text-xs flex-shrink-0">至</span>
              <input
                type="text"
                placeholder="结束日期"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="flex-1 min-w-0 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
              />
            </div>
          )}
        </div>

        {/* 金额范围 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <button
            onClick={() => setShowAmountRange(!showAmountRange)}
            className="w-full flex items-center justify-between mb-2"
          >
            <label className="text-sm font-medium text-gray-700 cursor-pointer">金额范围</label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">
                {showAmountRange ? "点击收起" : "点击展开"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                  showAmountRange ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>
          {showAmountRange && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 w-full">
                <input
                  type="number"
                  placeholder="最小金额"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
                />
                <span className="text-gray-400 text-xs flex-shrink-0">至</span>
                <input
                  type="number"
                  placeholder="最大金额"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
                />
              </div>
              <div className="px-1">
                <Slider
                  min={0}
                  max={10000}
                  step={10}
                  value={[Number(amountMin) || 0, Number(amountMax) || 10000]}
                  onValueChange={(values) => {
                    setAmountMin(values[0].toString());
                    setAmountMax(values[1].toString());
                  }}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* 账目类型 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">账目类型</label>
          <div className="flex flex-wrap gap-2">
            {transactionTypes.map((type) => (
              <Button
                key={type.value}
                variant={selectedType === type.value ? "default" : "outline"}
                size="sm"
                className={`h-7 px-3 text-xs rounded ${
                  selectedType === type.value
                    ? `${type.color} text-white hover:opacity-90`
                    : "border-gray-200"
                }`}
                onClick={() => setSelectedType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 账目分类 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="w-full flex items-center justify-between mb-2"
          >
            <label className="text-sm font-medium text-gray-700 cursor-pointer">账目分类</label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">
                {showCategories ? "点击收起" : "点击展开"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                  showCategories ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>
          {showCategories && categoryTree.length > 0 && (
            <div className="space-y-2">
              {categoryTree.map((category: any) => (
                <div key={category.id}>
                  {/* 一级分类标题 */}
                  <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">一级分类</div>
                  
                  {/* 一级分类 */}
                  <div className="bg-white p-1">
                    <button
                      onClick={() => handleCategoryClick(category.id)}
                      className={`h-7 px-3 text-xs rounded border ${
                        selectedCategories.includes(category.id)
                          ? "bg-[#1976D2] text-white border-[#1976D2]"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {category.name}
                    </button>
                  </div>

                  {/* 二级分类 */}
                  {expandedCategories.has(category.id) && category.children && category.children.length > 0 && (
                    <div>
                      <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">二级分类</div>
                      <div className="bg-white p-1">
                        <div className="flex flex-wrap gap-2">
                          {category.children.map((subCategory: any) => (
                            <button
                              key={subCategory.id}
                              onClick={() => handleSubCategoryClick(subCategory.id)}
                              className={`h-7 px-3 text-xs rounded border ${
                                selectedCategories.includes(subCategory.id)
                                  ? "bg-[#1976D2] text-white border-[#1976D2]"
                                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              {subCategory.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 三级分类 */}
                      {category.children.some((sub: any) => expandedSubCategories.has(sub.id) && sub.children && sub.children.length > 0) && (
                        <div>
                          <div className="bg-gray-100 px-3 py-1 text-xs text-gray-600">三级分类</div>
                          <div className="bg-white p-1">
                            <div className="flex flex-wrap gap-2">
                              {category.children.map((subCategory: any) => 
                                expandedSubCategories.has(subCategory.id) && subCategory.children && subCategory.children.length > 0 ? (
                                  subCategory.children.map((thirdCategory: any) => (
                                    <button
                                      key={thirdCategory.id}
                                      onClick={() => {
                                        setSelectedCategories(prev =>
                                          prev.includes(thirdCategory.id)
                                            ? prev.filter(id => id !== thirdCategory.id)
                                            : [...prev, thirdCategory.id]
                                        );
                                      }}
                                      className={`h-7 px-3 text-xs rounded border ${
                                        selectedCategories.includes(thirdCategory.id)
                                          ? "bg-[#1976D2] text-white border-[#1976D2]"
                                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                                      }`}
                                    >
                                      {thirdCategory.name}
                                    </button>
                                  ))
                                ) : null
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 支付方式 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">{getAccountLabel()}</label>
          <div className="flex flex-wrap gap-2">
            {accountTypes.map((account) => (
              <Button
                key={account.value}
                variant={selectedAccounts.includes(account.value) ? "default" : "outline"}
                size="sm"
                className={`h-7 px-3 text-xs rounded ${
                  selectedAccounts.includes(account.value)
                    ? `${account.color} text-white hover:opacity-90`
                    : "border-gray-200"
                }`}
                onClick={() => toggleAccount(account.value)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 备注信息 */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">备注信息</label>
          <input
            type="text"
            placeholder="输入备注关键词"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
          />
        </div>

      </div>

      {/* 底部按钮 */}
      <div className="bg-white border-t px-3 py-2.5 flex gap-2 shadow-lg">
        <Button
          variant="outline"
          className="flex-1 h-10 text-sm border-gray-300"
          onClick={handleReset}
        >
          重置条件
        </Button>
        <Button
          className="flex-1 h-10 text-sm bg-gradient-to-r from-[#A80000] to-[#d44] hover:from-[#8a0000] hover:to-[#A80000] text-white"
          onClick={handleSearch}
        >
          确定搜索
        </Button>
      </div>

      {/* 成员选择弹窗 */}
      {showMemberPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMemberPicker(false)}>
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3">选择成员</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <div 
                onClick={() => toggleMember(0)}
                className={`flex items-center p-2 rounded cursor-pointer ${
                  selectedMemberIds.length === 0 ? 'bg-[#F5F5F5]' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-[#1976D2] flex items-center justify-center text-white text-sm mr-2">
                  全
                </div>
                <span>全部成员</span>
                {selectedMemberIds.length === 0 && <span className="ml-auto text-[#1976D2]">✓</span>}
              </div>
              {membersData?.map((member: any) => (
                <div 
                  key={member.userId}
                  onClick={() => toggleMember(member.userId)}
                  className={`flex items-center p-2 rounded cursor-pointer ${
                    selectedMemberIds.includes(member.userId) ? 'bg-[#F5F5F5]' : 'hover:bg-gray-50'
                  }`}
                >
                  <UserAvatar 
                    avatar={member.avatar}
                    username={member.username}
                    nickname={member.nickname}
                    size="sm"
                    className="mr-2"
                  />
                  <span>{member.nickname || member.username}</span>
                  {selectedMemberIds.includes(member.userId) && <span className="ml-auto text-[#1976D2]">✓</span>}
                </div>
              ))}
            </div>
            <button 
              onClick={() => setShowMemberPicker(false)}
              className="w-full mt-4 bg-[#1976D2] text-white py-2 rounded"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
