import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { MOUTAI_THUMB } from '@/lib/moutai';
import '@/components/MoutaiDetail.css';

export default function Guizhou() {
  return <main className="moutai-page mx-auto min-h-screen w-full max-w-[480px] text-[var(--mt-ink)]">
    <header className="flex h-[52px] items-center justify-between border-b border-[var(--mt-line)] px-5"><Link href="/p/proj_hzxm2t/limited" className="flex items-center gap-1.5 text-[12px] text-[var(--mt-muted)]"><ArrowLeft className="h-4 w-4" />精选商品</Link><span className="text-[14px] font-medium tracking-[0.15em]">贵州精选</span><span className="w-14" /></header>
    <section className="px-6 pb-6 pt-10"><p className="text-[10px] tracking-[0.25em] text-[var(--mt-gold)]">GUIZHOU SELECTION</p><h1 className="mb-3 mt-3 font-serif text-[32px] tracking-[0.12em]">一方风土<br />一味酱香</h1><p className="text-[12px] leading-relaxed text-[var(--mt-muted)]">从茅台镇的山水与传统工艺，读懂一瓶经典飞天。<br />本次先呈现飞天茅台，精品与15年陈年后续再延伸。</p></section>
    <Link href="/p/proj_hzxm2t/limited/moutai-feitian" className="mx-4 block overflow-hidden rounded-[12px] border border-[var(--mt-line)] bg-[var(--mt-paper)]"><img src={MOUTAI_THUMB} alt="贵州精选飞天茅台商品故事主视觉" className="block h-auto w-full" /><div className="flex items-center justify-between border-t border-[var(--mt-line)] px-5 py-4"><div><h2 className="font-serif text-[21px]">飞天茅台</h2><p className="mt-1 text-[11px] text-[var(--mt-muted)]">生产年份可选 · 53%vol · 500mL · 每单1—6瓶</p></div><ArrowUpRight className="h-5 w-5 text-[var(--mt-red)]" /></div></Link>
    <p className="flex items-center justify-center gap-1.5 px-5 py-6 text-[10px] text-[var(--mt-muted)]"><ShieldCheck className="h-3 w-3" />仅供页面审核，尚未正式售卖 · 理性饮酒</p>
  </main>;
}
