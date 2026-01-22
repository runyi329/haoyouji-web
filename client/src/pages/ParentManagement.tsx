import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, User, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function ParentManagement() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  
  const { data: parents, isLoading } = trpc.admin.getAllParents.useQuery();

  // 检查权限
  if (user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">权限不足</h2>
          <p className="text-muted-foreground mb-4">只有超级管理员可以访问此页面</p>
          <Button onClick={() => navigate("/")}>返回首页</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回管理后台</span>
          </button>
          <h1 className="text-xl font-bold">家长账户管理</h1>
          <div className="w-32"></div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">所有家长账户</h2>
          <p className="text-muted-foreground">点击家长卡片查看和管理该家庭的功能权限</p>
        </div>

        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">加载中...</p>
          </div>
        )}

        {!isLoading && (!parents || parents.length === 0) && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">暂无家长账户</p>
          </Card>
        )}

        {!isLoading && parents && parents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {parents.map((parent) => (
              <Link key={parent.id} href={`/parent-management/${parent.id}`}>
                <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{parent.name || parent.username}</h3>
                        <p className="text-sm text-muted-foreground">
                          {parent.username}
                        </p>
                        {parent.familyId && (
                          <p className="text-xs text-muted-foreground mt-1">
                            家庭ID: {parent.familyId}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
