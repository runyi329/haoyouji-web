import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GraduationCap, Home, Users, Tags, MapPin, Share2, BarChart3, Calendar, Bell, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Academy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container max-w-4xl py-8 px-4">
        {/* 页面标题 */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <GraduationCap className="h-12 w-12 text-indigo-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              脉动学院
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            掌握好友记的每一个功能，让人脉管理更高效
          </p>
        </div>

        {/* 返回按钮 */}
        <Button
          variant="outline"
          onClick={() => setLocation("/parent/profile")}
          className="mb-6"
        >
          <Home className="h-4 w-4 mr-2" />
          返回个人中心
        </Button>

        {/* 功能说明 */}
        <Card>
          <CardHeader>
            <CardTitle>功能使用指南</CardTitle>
            <CardDescription>点击展开查看详细说明</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              
              {/* 首页功能 */}
              <AccordionItem value="homepage">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Home className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold">首页统计容器</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">功能概述</h4>
                    <p className="text-muted-foreground">
                      首页提供了19个可自定义排序的统计容器，帮助您快速了解人脉管理的整体情况。您可以通过拖拽调整容器位置，系统会自动保存您的排序偏好。
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">核心容器说明</h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li><strong>人脉总数：</strong>显示您的人脉总数（包括自己添加的和共享给您的）</li>
                      <li><strong>本周新增：</strong>本周新添加的人脉数量</li>
                      <li><strong>本月新增：</strong>本月新添加的人脉数量</li>
                      <li><strong>今年新增：</strong>今年新添加的人脉数量</li>
                      <li><strong>联络频率：</strong>您的平均联络间隔天数，数值越小表示联络越频繁</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2 text-red-600">⭐ 需要关注（智能提醒）</h4>
                    <p className="text-muted-foreground mb-2">
                      这是一个基于标签的<strong>分级关注系统</strong>，会根据人脉的标签自动提醒您哪些人需要联络：
                    </p>
                    <ul className="space-y-1 text-muted-foreground ml-4">
                      <li>• <strong>周关注</strong>标签：超过 <span className="text-red-600 font-semibold">7天</span> 未联络会被标记</li>
                      <li>• <strong>月关注</strong>标签：超过 <span className="text-orange-600 font-semibold">30天</span> 未联络会被标记</li>
                      <li>• <strong>季关注</strong>标签：超过 <span className="text-yellow-600 font-semibold">90天</span> 未联络会被标记</li>
                      <li>• <strong>无标签</strong>：超过 <span className="text-gray-600 font-semibold">180天</span> 未联络会被标记</li>
                    </ul>
                    <p className="text-muted-foreground mt-2">
                      💡 <strong>使用建议：</strong>为重要人脉打上"周关注"或"月关注"标签，系统会自动提醒您定期维护关系。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">活跃度统计</h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li><strong>本月活跃：</strong>本月有过联络记录的人脉数量</li>
                      <li><strong>本周活跃：</strong>本周有过联络记录的人脉数量</li>
                      <li><strong>今日活跃：</strong>今天有过联络记录的人脉数量</li>
                      <li><strong>休眠人脉：</strong>长时间未联络的人脉数量</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">提醒功能</h4>
                    <ul className="space-y-2 text-muted-foreground">
                      <li><strong>今日提醒：</strong>今天需要关注的生日、纪念日等提醒</li>
                      <li><strong>本周提醒：</strong>本周需要关注的提醒事项</li>
                      <li><strong>本月提醒：</strong>本月需要关注的提醒事项</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 人脉管理 */}
              <AccordionItem value="contacts">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-600" />
                    <span className="font-semibold">人脉管理</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">添加人脉</h4>
                    <p className="text-muted-foreground">
                      点击首页右上角的"添加人脉"按钮，填写人脉的基本信息（姓名、电话、微信等）和扩展信息（公司、职位等）。您还可以为人脉打上标签，方便分类管理。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">编辑人脉信息</h4>
                    <p className="text-muted-foreground">
                      在人脉详情页点击"编辑信息"按钮，可以修改基本信息和扩展信息。扩展信息会显示在详情页的第一个容器中，方便查看。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">联络记录</h4>
                    <p className="text-muted-foreground mb-2">
                      点击人脉详情页顶部的"记录联络"按钮，可以快速记录与该人脉的联络情况。系统会自动统计：
                    </p>
                    <ul className="space-y-1 text-muted-foreground ml-4">
                      <li>• 上次联络时间</li>
                      <li>• 联络次数</li>
                      <li>• 平均联络间隔</li>
                      <li>• 最长间隔</li>
                      <li>• 本月联络次数</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">引荐人功能</h4>
                    <p className="text-muted-foreground">
                      在人脉详情页最底部的"引荐人"容器中，可以设置该人脉的引荐人。系统会自动计算引荐贡献分，帮助您了解人脉网络的来源和质量。
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 标签系统 */}
              <AccordionItem value="tags">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Tags className="h-5 w-5 text-purple-600" />
                    <span className="font-semibold">标签系统</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">标签分类</h4>
                    <p className="text-muted-foreground mb-2">
                      好友记采用<strong>两层标签系统</strong>：
                    </p>
                    <ul className="space-y-2 text-muted-foreground ml-4">
                      <li>• <strong>全局标签：</strong>所有人脉共用的标签，如"客户"、"朋友"、"家人"等</li>
                      <li>• <strong>个人标签：</strong>针对特定人脉的自定义标签，更灵活</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">关注级别标签</h4>
                    <p className="text-muted-foreground mb-2">
                      使用以下标签可以启用智能提醒功能：
                    </p>
                    <ul className="space-y-1 text-muted-foreground ml-4">
                      <li>• <strong>周关注：</strong>重要人脉，每周至少联络一次</li>
                      <li>• <strong>月关注：</strong>常规人脉，每月至少联络一次</li>
                      <li>• <strong>季关注：</strong>一般人脉，每季度至少联络一次</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">标签管理</h4>
                    <p className="text-muted-foreground">
                      在人脉详情页的"标签"容器中，可以添加、编辑或删除标签。所有标签都支持自定义，没有预设标签限制。
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 区域筛选 */}
              <AccordionItem value="region">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-orange-600" />
                    <span className="font-semibold">区域筛选</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">功能说明</h4>
                    <p className="text-muted-foreground">
                      点击首页顶部的"区域"按钮，可以按地区筛选人脉。系统会自动统计每个地区的人脉数量，方便您管理不同地区的人脉关系。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">使用场景</h4>
                    <ul className="space-y-1 text-muted-foreground ml-4">
                      <li>• 出差前查看目标城市的人脉，安排见面</li>
                      <li>• 统计不同地区的人脉分布，优化资源配置</li>
                      <li>• 快速找到同城的朋友或客户</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 共享功能 */}
              <AccordionItem value="share">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-teal-600" />
                    <span className="font-semibold">人脉共享</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">功能说明</h4>
                    <p className="text-muted-foreground">
                      通过共享功能，您可以与团队成员共享人脉资源，实现人脉网络的协同管理。被共享的人脉会显示在对方的人脉列表中，但无法编辑。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">权限控制</h4>
                    <p className="text-muted-foreground">
                      您可以精确控制共享的字段，选择性地分享姓名、电话、微信、标签等信息。未勾选的字段不会展示给接收者。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">使用场景</h4>
                    <ul className="space-y-1 text-muted-foreground ml-4">
                      <li>• 团队协作：与同事共享客户资源</li>
                      <li>• 资源互换：与合作伙伴交换人脉信息</li>
                      <li>• 家庭管理：家人之间共享社交圈</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 数据统计 */}
              <AccordionItem value="stats">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-indigo-600" />
                    <span className="font-semibold">数据统计</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">联络统计</h4>
                    <p className="text-muted-foreground">
                      在人脉详情页的"联络统计"容器中，可以查看该人脉的详细联络数据，包括上次联络时间、联络次数、平均间隔等。您还可以配置显示哪些统计项。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">全局统计</h4>
                    <p className="text-muted-foreground">
                      首页的统计容器提供了全局视角的数据分析，帮助您了解人脉管理的整体健康度和活跃度。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">趋势分析</h4>
                    <p className="text-muted-foreground">
                      通过对比本周、本月、今年的新增人脉数量，可以了解人脉网络的增长趋势，及时调整人脉拓展策略。
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 提醒功能 */}
              <AccordionItem value="reminders">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-yellow-600" />
                    <span className="font-semibold">提醒功能</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">生日提醒</h4>
                    <p className="text-muted-foreground">
                      为人脉设置生日后，系统会在生日当天自动提醒您，避免错过重要的祝福时机。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">纪念日提醒</h4>
                    <p className="text-muted-foreground">
                      可以为人脉添加自定义纪念日（如认识纪念日、合作纪念日等），系统会定期提醒。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">联络提醒</h4>
                    <p className="text-muted-foreground">
                      结合"需要关注"功能，系统会根据人脉的标签自动提醒您哪些人需要联络，确保重要关系不被忽视。
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 后台管理 */}
              <AccordionItem value="admin">
                <AccordionTrigger className="text-left">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-600" />
                    <span className="font-semibold">后台管理（超级管理员）</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">权限说明</h4>
                    <p className="text-muted-foreground">
                      只有超级管理员才能访问后台管理页面。在个人中心页面，超级管理员会看到"管理功能"板块，点击"后台管理"按钮即可进入。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">功能模块</h4>
                    <ul className="space-y-1 text-muted-foreground ml-4">
                      <li>• <strong>用户管理：</strong>查看和管理所有用户账号</li>
                      <li>• <strong>邀请管理：</strong>管理邀请码和邀请记录</li>
                      <li>• <strong>知识库：</strong>管理系统知识库内容</li>
                      <li>• <strong>系统设置：</strong>配置全局系统参数</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </CardContent>
        </Card>

        {/* 底部提示 */}
        <Card className="mt-6 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
          <CardContent className="pt-6">
            <p className="text-sm text-center text-muted-foreground">
              💡 <strong>小贴士：</strong>如果您在使用过程中遇到问题，可以随时返回脉动学院查看相关功能说明。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
