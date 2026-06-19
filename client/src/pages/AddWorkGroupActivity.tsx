import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export default function AddWorkGroupActivity() {
  const [, params] = useRoute("/work-group-member/:memberId/add-activity");
  const [, setLocation] = useLocation();
  
  const memberId = params?.memberId ? parseInt(params.memberId) : 1;
  
  // 固定使用红色主题
  const THEME_PRIMARY = '#D32F2F';
  const THEME_BG = '#FAF3ED';
  
  // 表单状态
  const [activityType, setActivityType] = useState("contact"); // contact, share, tag
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [displayDate, setDisplayDate] = useState(
    new Date().toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
  );
  const [selectedTime, setSelectedTime] = useState(
    new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
  
  // 详细字段（根据不同类型显示不同字段）
  const [contactPerson, setContactPerson] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  
  // Sheet状态
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  
  // 行为类型选项
  const activityTypes = [
    { value: "contact", label: "联络记录", icon: "📞", description: "记录与人脉的联络互动" },
    { value: "share", label: "共享记录", icon: "🤝", description: "记录人脉资源或信息的共享" },
    { value: "tag", label: "标签记录", icon: "🏷️", description: "记录为人脉添加的标签" }
  ];
  
  // 获取当前选中的类型信息
  const currentType = activityTypes.find(t => t.value === activityType) || activityTypes[0];
  
  // 生成日期选择器的日期列表（最近30天）
  const generateDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date);
    }
    return dates;
  };
  
  const dateOptions = generateDateOptions();
  
  // 格式化日期显示
  const formatDateDisplay = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "今天";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "昨天";
    } else {
      return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
    }
  };
  
  // 处理日期选择
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setDisplayDate(formatDateDisplay(date));
    setIsDateSheetOpen(false);
  };
  
  // 处理类型选择
  const handleTypeSelect = (type: string) => {
    setActivityType(type);
    setIsTypeSheetOpen(false);
    // 清空详细字段
    setContactPerson("");
    setCompany("");
    setTopic("");
    setResult("");
    setNotes("");
  };
  
  // 验证表单
  const validateForm = () => {
    if (!title.trim()) {
      toast.error("请输入标题");
      return false;
    }
    
    if (activityType === "contact") {
      if (!contactPerson.trim()) {
        toast.error("请输入联络对象");
        return false;
      }
    }
    
    return true;
  };
  
  // 提交表单
  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }
    
    // TODO: 调用API保存数据
    const activityData = {
      memberId,
      type: activityType,
      title,
      description,
      date: selectedDate.toISOString().split('T')[0],
      time: selectedTime,
      details: {
        contactPerson,
        company,
        topic,
        result,
        notes
      }
    };
    
    console.log('提交行为记录:', activityData);
    toast.success("行为记录已添加");
    
    // 返回成员详情页
    setLocation(`/work-group-member/${memberId}`);
  };
  
  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button 
          onClick={() => setLocation(`/work-group-member/${memberId}`)}
          className="p-1 -ml-2"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-medium">添加行为记录</h1>
        <button
          onClick={handleSubmit}
          className="text-base font-medium"
        >
          完成
        </button>
      </div>

      {/* 表单内容 */}
      <div className="flex-1 overflow-y-auto pb-4">
        {/* 行为类型选择 */}
        <div 
          className="bg-white px-4 py-3 flex items-center justify-between cursor-pointer active:bg-gray-50"
          onClick={() => setIsTypeSheetOpen(true)}
        >
          <span className="text-sm text-[#757575]">行为类型</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{currentType.icon}</span>
            <span className="text-base text-[#222222]">{currentType.label}</span>
            <svg className="w-5 h-5 text-[#757575]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* 标题输入 */}
        <div className="bg-white px-4 py-3 border-t border-gray-100">
          <input
            type="text"
            placeholder="输入标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-base text-[#222222] placeholder-gray-400 outline-none"
          />
        </div>

        {/* 描述输入 */}
        <div className="bg-white px-4 py-3 border-t border-gray-100">
          <textarea
            placeholder="输入描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full text-sm text-[#222222] placeholder-gray-400 outline-none resize-none"
          />
        </div>

        {/* 日期和时间 */}
        <div className="mt-3 bg-white">
          <div 
            className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-gray-50"
            onClick={() => setIsDateSheetOpen(true)}
          >
            <span className="text-sm text-[#757575]">日期</span>
            <div className="flex items-center gap-2">
              <span className="text-base text-[#222222]">{displayDate}</span>
              <svg className="w-5 h-5 text-[#757575]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
          
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
            <span className="text-sm text-[#757575]">时间</span>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="text-base text-[#222222] outline-none"
            />
          </div>
        </div>

        {/* 详细字段（根据类型显示） */}
        {activityType === "contact" && (
          <div className="mt-3 bg-white">
            <div className="px-4 py-3">
              <input
                type="text"
                placeholder="联络对象"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full text-base text-[#222222] placeholder-gray-400 outline-none"
              />
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <input
                type="text"
                placeholder="所属公司（可选）"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full text-base text-[#222222] placeholder-gray-400 outline-none"
              />
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <input
                type="text"
                placeholder="沟通主题（可选）"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full text-base text-[#222222] placeholder-gray-400 outline-none"
              />
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <input
                type="text"
                placeholder="沟通结果（可选）"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                className="w-full text-base text-[#222222] placeholder-gray-400 outline-none"
              />
            </div>
          </div>
        )}

        {/* 备注 */}
        <div className="mt-3 bg-white px-4 py-3">
          <textarea
            placeholder="备注（可选）"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full text-sm text-[#222222] placeholder-gray-400 outline-none resize-none"
          />
        </div>
      </div>

      {/* 行为类型选择 Sheet */}
      <Sheet open={isTypeSheetOpen} onOpenChange={setIsTypeSheetOpen}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle>选择行为类型</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {activityTypes.map((type) => (
              <div
                key={type.value}
                onClick={() => handleTypeSelect(type.value)}
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  activityType === type.value
                    ? 'bg-[#FFEBEE] border-2 border-[#D32F2F]'
                    : 'bg-white border-2 border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{type.icon}</span>
                  <div className="flex-1">
                    <div className="text-base font-medium text-[#222222]">{type.label}</div>
                    <div className="text-xs text-[#757575] mt-1">{type.description}</div>
                  </div>
                  {activityType === type.value && (
                    <svg className="w-6 h-6 text-[#D32F2F]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 日期选择 Sheet */}
      <Sheet open={isDateSheetOpen} onOpenChange={setIsDateSheetOpen}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle>选择日期</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-1 overflow-y-auto max-h-[calc(60vh-80px)]">
            {dateOptions.map((date, index) => {
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <div
                  key={index}
                  onClick={() => handleDateSelect(date)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#FFEBEE] text-[#D32F2F] font-medium'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{formatDateDisplay(date)}</span>
                    <span className="text-sm text-[#757575]">
                      {date.toLocaleDateString("zh-CN", { 
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        weekday: "short"
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
