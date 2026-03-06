/**
 * 润仪算力研发中心 - 建站规则
 * 路由：/jiang/build-rules
 *
 * 展示脉动共享商盟完整架构规则文档
 * 作为所有新商家建站的底层依据
 */
import { useLocation } from "wouter";
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import BottomNav from "@/components/BottomNav";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

// 架构文档章节摘要
const CHAPTERS = [
  {
    num: "一",
    title: "核心定位与设计理念",
    summary: "脉动网是商家网站 + 人脉管理 + 钱脉管理三合一的商业基础设施。",
    rules: [
      "商家网站内容完全自由，可以是商城、公司介绍、个人主页、服务预约等任意形态",
      "首页必须包含三大入口（强制）：① 分享按钮  ② 注册/登录按钮  ③ 个人中心入口",
      "三大入口的视觉样式完全自定义，但功能必须存在且用户能找到",
    ],
  },
  {
    num: "二",
    title: "底部导航框架（核心规则）",
    summary: "所有商家网站底部导航遵循统一的三按钮结构：人脉 / 商家名称 / 钱脉。",
    rules: [
      "左：人脉按钮（小图标+文字），点击进入人脉管理",
      "中：商家名称圆形大按钮（商家主题色），点击进入商家首页",
      "右：钱脉按钮（小图标+文字），点击进入账本",
      "商家内部可以有自己的 Tab 导航，与底部脉动导航相互独立",
      "所有商家子页面必须渲染 <BottomNav />，不可被商家内部导航替代",
    ],
  },
  {
    num: "三",
    title: "用户体系与登录态管理",
    summary: "所有用户数据全局统一，无论从哪个入口注册都进入同一用户数据库。",
    rules: [
      "全站所有浏览类页面（首页、商品列表、商品详情）对未登录用户完全开放",
      "只有购买、进入人脉/钱脉才触发登录跳转",
      "分享链接必须自动携带当前用户的邀请码：?ref={inviteCode}",
      "未登录时使用商城默认邀请码",
      "ref 参数存入 localStorage（有效期 7 天），注册时预填邀请码字段",
      "分享面板顶部必须显示：「已包含您的邀请码 xxx，好友注册后自动成为您的人脉」",
    ],
  },
  {
    num: "九",
    title: "商家个人中心（轻量版后台）",
    summary: "每个商家网站必须包含个人中心，提供商家设置、联系客服、关于我们等固定入口。",
    rules: [
      "固定配置项（必须实现）：商家设置、商品管理、联系客服、关于我们",
      "商家设置：配置分享标题、Logo、封面图（1200×630px）、描述语",
      "联系客服：读取商家设置中的微信号/电话，动态展示",
      "关于我们：读取商家设置中的 aboutUs 字段",
      "数据隔离：商家只能看到自己店铺的订单和商品",
    ],
  },
  {
    num: "十一",
    title: "开发规则",
    summary: "商家子页面的路由注册、访问控制、OG 标签注入等开发规范。",
    rules: [
      "路由前缀：/{merchantCode}，如 /jiang、/wine、/beauty",
      "分享页路由前缀：/share/{merchantCode}/...，如 /share/jiang/product/:id",
      "商家首页使用 useMerchantOG(merchantCode) 注入 OG 标签",
      "服务端 MERCHANT_PATH_MAP 需注册商家路径，用于微信爬虫 OG 注入",
      "所有浏览类接口使用 publicProcedure，购买类接口使用 protectedProcedure",
    ],
  },
  {
    num: "二十四",
    title: "商品分享页架构规则（双链接体系）",
    summary: "每个商品同时拥有详情页（需登录）和分享页（无需登录）两个链接。",
    rules: [
      "商品详情页（/wine/product/:slug）：需要登录，有返回按钮和底部 TabBar",
      "商品分享页（/share/wine/product/:slug）：无需登录，无返回按钮，无底部 TabBar",
      "分享页是电子海报：零门槛访问、独立页面结构、唯一购买按钮、可二次分享",
      "分享按钮生成的链接必须指向分享页（/share/...），而非详情页",
      "分享页底部固定「立即购买」按钮：未登录跳转登录页，登录后回到商品详情页",
      "分享页顶部只能展示商家 Logo，不能有 App 级别的导航元素",
    ],
  },
  {
    num: "二十三",
    title: "商品展示铁规（手机端固定区域规范）",
    summary: "手机端商品展示的固定区域规范，确保所有商家商品展示效果一致。",
    rules: [
      "主图轮播区：3:4 比例，顶部全宽，不可省略",
      "价格区：紧跟主图，字号 ≥ 20px，颜色醒目",
      "标题区：最多 2 行，紧跟价格",
      "规格区：有多规格时必须存在",
      "购买区：必须存在，位置固定（吸底或紧跟规格区）",
      "详情区：自由装修，图文视频均可，不限长度",
    ],
  },
];

export default function JiangBuildRules() {
  const [, setLocation] = useLocation();
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jiang/profile")}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1a2e] text-[#888899] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#D32F2F]" />
            <div>
              <div className="text-sm font-bold text-white leading-tight">建站规则</div>
              <div className="text-[10px] text-[#D32F2F] leading-tight">脉动共享商盟架构文档 v1.7</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-24">
        {/* 文档说明 */}
        <div className="py-5">
          <div className="bg-gradient-to-br from-[#D32F2F]/10 to-[#7C3AED]/10 border border-[#D32F2F]/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <img src={SENTIA_ICON} alt="润仪" className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-white mb-1">脉动共享商盟 · 完整架构规则文档</div>
                <div className="text-[11px] text-[#888899] leading-relaxed">
                  本文档定义了所有在脉动网平台上开发的商家网站的完整架构规则。
                  凡涉及新商家建站、功能扩展、UI设计等工作，均以本文档为准。
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-[#444466]">版本 v1.7</span>
                  <span className="text-[10px] text-[#444466]">2026-03-05</span>
                  <span className="text-[10px] bg-[#D32F2F]/20 text-[#D32F2F] px-2 py-0.5 rounded-full">权威文档</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 章节列表 */}
        <div className="space-y-3">
          {CHAPTERS.map((chapter) => {
            const isExpanded = expandedChapter === chapter.num;
            return (
              <div
                key={chapter.num}
                className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedChapter(isExpanded ? null : chapter.num)}
                  className="w-full flex items-center justify-between px-4 py-4 hover:bg-[#D32F2F]/5 transition-colors"
                >
                  <div className="flex items-start gap-3 text-left">
                    <div className="w-7 h-7 rounded-lg bg-[#D32F2F]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-[#D32F2F]">{chapter.num.length <= 2 ? chapter.num : "§"}</span>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">第{chapter.num}章 · {chapter.title}</div>
                      <div className="text-[11px] text-[#666680] mt-0.5 leading-relaxed">{chapter.summary}</div>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-[#D32F2F] flex-shrink-0 ml-2" />
                    : <ChevronDown className="w-4 h-4 text-[#444466] flex-shrink-0 ml-2" />
                  }
                </button>

                {isExpanded && (
                  <div className="border-t border-[#1e1e35] px-4 py-4 space-y-2">
                    {chapter.rules.map((rule, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-[#D32F2F] rounded-full flex-shrink-0 mt-1.5" />
                        <span className="text-[12px] text-[#aaaacc] leading-relaxed">{rule}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部说明 */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-[#444466]">
            本文档为脉动共享商盟产品架构的权威规则文档
          </p>
          <p className="text-[11px] text-[#444466] mt-1">
            所有开发工作以此为准，如有规则变更需更新版本号
          </p>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
