import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Play, BarChart3 } from "lucide-react";

export default function ExerciseHome() {
  const [, setLocation] = useLocation();
  
  // 获取锻炼项目列表
  const { data: exerciseTypes = [], isLoading } = trpc.exercise.getTypes.useQuery();
  
  // 检查是否已设置密码
  const { data: hasPassword } = trpc.exercise.hasPassword.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-pink-100 p-4">
      <div className="container max-w-4xl mx-auto py-8">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">🏃 锻炼计数</h1>
          <p className="text-lg text-muted-foreground">记录每天的锻炼成果</p>
        </div>

        {/* 管理按钮 */}
        <div className="flex gap-4 mb-8 justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setLocation("/exercise/types")}
          >
            <Settings className="mr-2 h-5 w-5" />
            管理项目
          </Button>
          {!hasPassword && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setLocation("/exercise/password-setup")}
            >
              <Settings className="mr-2 h-5 w-5" />
              设置密码
            </Button>
          )}
        </div>

        {/* 锻炼项目列表 */}
        {exerciseTypes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg mb-4">还没有锻炼项目</p>
              <p className="text-sm text-muted-foreground mb-6">
                请先在"管理项目"中添加锻炼项目
              </p>
              <Button onClick={() => setLocation("/exercise/types")}>
                去添加项目
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {exerciseTypes.map((type) => (
              <Card key={type.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="text-5xl">{type.icon}</div>
                    <div className="flex-1">
                      <CardTitle className="text-2xl">{type.name}</CardTitle>
                      <CardDescription>点击开始计数</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      size="lg"
                      onClick={() => {
                        if (!hasPassword) {
                          setLocation("/exercise/password-setup");
                        } else {
                          setLocation(`/exercise/counter/${type.id}`);
                        }
                      }}
                    >
                      <Play className="mr-2 h-5 w-5" />
                      开始计数
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setLocation(`/exercise/stats/${type.id}`)}
                    >
                      <BarChart3 className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 返回按钮 */}
        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={() => setLocation("/")}>
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
