import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronRight, ArrowLeft, Users, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ReferralPerson {
  id: number;
  name: string;
  title?: string;
  level?: number;
  referrerName?: string;
}

interface ReferralData {
  referrals: ReferralPerson[];
  stats: {
    total: number;
    levelDistribution: { level: number; count: number }[];
  };
}

export default function ReferralList() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const contactId = parseInt(params.contactId || "0");
  const type = (params.type || "direct") as "direct" | "indirect";

  const { data: contact } = trpc.contacts.getById.useQuery({ id: contactId });

  const { data, isLoading } = trpc.contacts.getReferrals.useQuery(
    { contactId, type },
    { enabled: contactId > 0 }
  );

  const referralData = data as ReferralData | undefined;
  const referrals = referralData?.referrals || [];
  const stats = referralData?.stats;

  const title = type === "direct" ? "直接推荐的人脉" : "间接推荐的人脉";

  const COLORS = ['#3b82f6', '#A80000', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container max-w-4xl py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">
                {contact?.name || "加载中..."} {title}
              </h1>
              {stats && (
                <p className="text-sm text-muted-foreground mt-1">
                  共 {stats.total} 个推荐人脉
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-muted-foreground">加载中...</span>
          </div>
        ) : !referrals || referrals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">暂无推荐人脉</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {stats && stats.levelDistribution.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                    层级分布统计
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <div>
                        <p className="text-sm text-muted-foreground">总推荐人数</p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                          {stats.total}
                        </p>
                      </div>
                      <Users className="h-12 w-12 text-blue-500/30" />
                    </div>

                    {type === "indirect" && stats.levelDistribution.length > 1 && (
                      <div>
                        <p className="text-sm font-medium mb-4">各层级人数分布</p>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={stats.levelDistribution}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="level" 
                              label={{ value: '层级', position: 'insideBottom', offset: -5 }}
                              tickFormatter={(value) => `第${value}层`}
                              className="text-xs"
                            />
                            <YAxis 
                              label={{ value: '人数', angle: -90, position: 'insideLeft' }}
                              className="text-xs"
                            />
                            <Tooltip 
                              formatter={(value) => [`${value}人`, '人数']}
                              labelFormatter={(label) => `第${label}层`}
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--background))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '6px'
                              }}
                            />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                              {stats.levelDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {stats.levelDistribution.map((item) => (
                        <div 
                          key={item.level}
                          className="p-3 bg-muted/50 rounded-lg text-center"
                        >
                          <p className="text-xs text-muted-foreground mb-1">
                            {type === "direct" ? "直接推荐" : `第${item.level}层`}
                          </p>
                          <p className="text-xl font-bold text-foreground">
                            {item.count}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {referrals.map((person: ReferralPerson, index: number) => (
                <Link
                  key={`${person.id}-${index}`}
                  href={`/parent/contacts/${person.id}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {type === "indirect" && person.level && (
                          <div className="flex items-center gap-1 min-w-fit pt-1">
                            <Badge variant="secondary" className="text-xs font-medium">
                              第{person.level}层
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-base">{person.name}</span>
                            {person.title && (
                              <span className="text-sm text-muted-foreground">
                                {person.title}
                              </span>
                            )}
                          </div>
                          
                          {type === "indirect" && person.referrerName && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <span>推荐人:</span>
                              <span className="font-medium text-foreground">
                                {person.referrerName}
                              </span>
                            </div>
                          )}
                        </div>

                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
