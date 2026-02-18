import { useState, useEffect } from "react";
import { AIChatBox, Message, Session } from "@/components/AIChatBox";

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | undefined>();
  const [pointsBalance, setPointsBalance] = useState<number>(0);

  // 获取用户信息（积分余额）
  const { data: userInfo } = trpc.user.getProfile.useQuery();

  // 获取会话列表
  const { data: sessionsData, refetch: refetchSessions } = trpc.aiAssistant.getSessions.useQuery({
    page: 1,
    limit: 20,
  });

  // 获取会话详情
  const sessionDetailQuery = trpc.aiAssistant.getSessionDetail.useQuery(
    { sessionId: currentSessionId! },
    { enabled: !!currentSessionId }
  );

  // 创建新会话
  const createSessionMutation = trpc.aiAssistant.createSession.useMutation({
    onSuccess: (data) => {
      setCurrentSessionId(data.sessionId);
      setMessages([]);
      refetchSessions();
      toast.success("已创建新对话");
    },
    onError: (error) => {
      toast.error(`创建对话失败: ${error.message}`);
    },
  });

  // 删除会话
  const deleteSessionMutation = trpc.aiAssistant.deleteSession.useMutation({
    onSuccess: () => {
      refetchSessions();
      // 如果删除的是当前会话，创建新会话
      if (currentSessionId) {
        setCurrentSessionId(undefined);
        setMessages([]);
      }
      toast.success("已删除对话");
    },
    onError: (error) => {
      toast.error(`删除对话失败: ${error.message}`);
    },
  });

  // AI查询mutation
  const aiQueryMutation = trpc.aiAssistant.query.useMutation({
    onSuccess: (response) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: response.answer,
        tokensUsed: response.tokensUsed,
        cost: response.cost,
      }]);

      // 更新积分余额
      if (response.balanceAfter !== undefined) {
        setPointsBalance(response.balanceAfter);
      }

      // 更新当前会话ID
      if (response.sessionId) {
        setCurrentSessionId(response.sessionId);
      }

      // 刷新会话列表
      refetchSessions();
    },
    onError: (error) => {
      toast.error(`AI查询失败: ${error.message}`);
      // 添加错误消息到聊天记录
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `抱歉，我遇到了一些问题：${error.message}`
      }]);
    }
  });

  // 更新积分余额
  useEffect(() => {
    if (userInfo?.points !== undefined) {
      setPointsBalance(userInfo.points);
    }
  }, [userInfo]);

  // 加载会话详情
  useEffect(() => {
    if (sessionDetailQuery.data) {
      const sessionMessages: Message[] = sessionDetailQuery.data.messages.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
        tokensUsed: msg.tokens_used,
        cost: msg.cost,
      }));
      setMessages(sessionMessages);
    }
  }, [sessionDetailQuery.data]);

  const handleSendMessage = (content: string) => {
    // 添加用户消息到聊天记录
    const newUserMessage: Message = {
      role: "user",
      content
    };
    setMessages(prev => [...prev, newUserMessage]);

    // 调用AI助手API
    aiQueryMutation.mutate({
      query: content,
      sessionId: currentSessionId,
    });
  };

  const handleSelectSession = (sessionId: number) => {
    setCurrentSessionId(sessionId);
  };

  const handleNewSession = () => {
    createSessionMutation.mutate({ title: "新对话" });
  };

  const handleDeleteSession = (sessionId: number) => {
    if (confirm("确定要删除这个对话吗？")) {
      deleteSessionMutation.mutate({ sessionId });
    }
  };

  const suggestedPrompts = [
    "帮我查一下腾讯的企业信息",
    "查询阿里巴巴集团的公司详情",
    "搜索华为技术有限公司",
    "我的人脉网络有多少人？",
  ];

  const sessions: Session[] = sessionsData?.sessions || [];

  return (
    <div className="h-screen bg-white overflow-hidden">
      <AIChatBox
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={aiQueryMutation.isPending}
        placeholder="输入消息，例如：帮我查一下腾讯的企业信息"
        emptyStateMessage="👋 你好！我是脉动AI助手"
        suggestedPrompts={suggestedPrompts}
        pointsBalance={pointsBalance}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        height="100vh"
      />
    </div>
  );
}
