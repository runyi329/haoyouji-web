/**
 * SentiaWhitepaper.tsx
 * Design: Binance-style dark theme (#0B0E11 bg, #F0B90B accent)
 * Layout: Two-column (TOC sidebar + content), bilingual ZH/EN toggle
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { SECTIONS, TABLE_OF_CONTENTS, WHITEPAPER_VERSION, WHITEPAPER_DATE } from "./SentiaWhitepaperData";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/snt-ai-2-N3gEAMNGbei2Fqn5vNs6VJ.png";

type Lang = "zh" | "en";

// ── Markdown-lite renderer (bold, tables, newlines) ──────────────────────────
function renderContent(text: string) {
  const lines = text.split("\n");
  const result: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection: lines starting with |
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(renderTable(tableLines, result.length));
      continue;
    }

    // Bold heading (starts with **)
    if (line.trim().startsWith("**") && line.trim().endsWith("**")) {
      const text2 = line.trim().slice(2, -2);
      result.push(
        <p key={result.length} className="font-semibold text-[#F0B90B] mt-6 mb-2 text-sm tracking-wide uppercase">
          {text2}
        </p>
      );
      i++;
      continue;
    }

    // Numbered list item
    if (/^\d+\./.test(line.trim())) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\./.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s*/, ""));
        i++;
      }
      result.push(
        <ol key={result.length} className="list-decimal list-inside space-y-1 my-3 pl-2">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-[#848E9C] text-sm leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list
    if (line.trim().startsWith("- ")) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      result.push(
        <ul key={result.length} className="space-y-1 my-3 pl-4">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-[#848E9C] text-sm leading-relaxed flex gap-2">
              <span className="text-[#F0B90B] mt-1 shrink-0">▸</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      result.push(<div key={result.length} className="h-3" />);
      i++;
      continue;
    }

    // Normal paragraph
    result.push(
      <p key={result.length} className="text-[#848E9C] text-sm leading-relaxed mb-3">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return result;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-[#EAECEF] font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderTable(lines: string[], key: number) {
  const rows = lines
    .filter(l => !l.trim().match(/^\|[-| ]+\|$/))
    .map(l =>
      l.trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map(cell => cell.trim())
    );

  if (rows.length === 0) return <div key={key} />;
  const [header, ...body] = rows;

  return (
    <div key={key} className="my-4 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#2B2F36]">
            {header.map((cell, i) => (
              <th key={i} className="text-left py-2 px-3 text-[#EAECEF] font-semibold text-xs uppercase tracking-wide">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-[#2B2F36] hover:bg-[#2B2F36]/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="py-2 px-3 text-[#848E9C] text-xs">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SentiaWhitepaper() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const prev = document.title;
    document.title = "";
    return () => { document.title = prev; };
  }, []);
  const [lang, setLang] = useState<Lang>("zh");
  const [activeSection, setActiveSection] = useState("abstract");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF]" style={{ fontFamily: "'Inter', 'PingFang SC', sans-serif" }}>
      {/* ── Top Nav ── */}
      <nav className="sticky top-0 z-50 bg-[#0B0E11] border-b border-[#2B2F36]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/sentia")}
              className="flex items-center gap-1.5 text-[#848E9C] hover:text-[#EAECEF] transition-colors text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {lang === "zh" ? "返回" : "Back"}
            </button>
            <span className="text-[#2B2F36]">|</span>
            <div className="flex items-center gap-2">
              <img src={SENTIA_ICON} alt="SNT" className="w-5 h-5 rounded-full" />
              <span className="text-[#EAECEF] font-semibold text-sm">Sentia</span>
              <span className="text-[#848E9C] text-xs">{lang === "zh" ? "白皮书" : "Whitepaper"}</span>
              <span className="bg-[#2B2F36] text-[#848E9C] text-xs px-1.5 py-0.5 rounded">{WHITEPAPER_VERSION}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex items-center bg-[#1E2026] rounded border border-[#2B2F36] overflow-hidden">
              <button
                onClick={() => setLang("zh")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  lang === "zh" ? "bg-[#F0B90B] text-[#0B0E11]" : "text-[#848E9C] hover:text-[#EAECEF]"
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  lang === "en" ? "bg-[#F0B90B] text-[#0B0E11]" : "text-[#848E9C] hover:text-[#EAECEF]"
                }`}
              >
                EN
              </button>
            </div>

            <span className="text-[#848E9C] text-xs hidden sm:block">{WHITEPAPER_DATE}</span>
          </div>
        </div>
      </nav>

      {/* ── Hero Banner ── */}
      <div className="border-b border-[#2B2F36] bg-gradient-to-r from-[#0B0E11] via-[#161A1F] to-[#0B0E11]">
        <div className="max-w-7xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-[#1E2026] border border-[#2B2F36] flex items-center justify-center">
              <img src={SENTIA_ICON} alt="SNT" className="w-10 h-10 rounded-full" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#EAECEF]">
                {lang === "zh" ? "Sentia 技术白皮书" : "Sentia Technical Whitepaper"}
              </h1>
              <p className="text-[#848E9C] text-sm mt-0.5">
                {lang === "zh"
                  ? "AI 原生区块链协议 · 感知代理网络 · 关系图谱引擎"
                  : "AI-Native Blockchain Protocol · Sentient Agent Network · Relational Graph Engine"}
              </p>
            </div>
          </div>
          <div className="sm:ml-auto flex flex-wrap gap-2">
            {[
              { label: lang === "zh" ? "版本" : "Version", value: WHITEPAPER_VERSION },
              { label: lang === "zh" ? "发布日期" : "Date", value: WHITEPAPER_DATE },
              { label: lang === "zh" ? "底层网络" : "Network", value: "BNB Chain" },
              { label: lang === "zh" ? "代币符号" : "Symbol", value: "SNT" },
            ].map(item => (
              <div key={item.label} className="bg-[#1E2026] border border-[#2B2F36] rounded px-3 py-2 text-center min-w-[80px]">
                <div className="text-[#848E9C] text-xs">{item.label}</div>
                <div className="text-[#F0B90B] text-sm font-semibold mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
        {/* ── Sidebar TOC ── */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-20">
            <p className="text-[#848E9C] text-xs uppercase tracking-widest mb-3 font-medium">
              {lang === "zh" ? "目录" : "Contents"}
            </p>
            <nav className="space-y-0.5">
              {TABLE_OF_CONTENTS.map(item => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors group ${
                    activeSection === item.id
                      ? "text-[#F0B90B] bg-[#F0B90B]/10"
                      : "text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#1E2026]"
                  }`}
                >
                  <span className={`font-mono text-[10px] shrink-0 ${activeSection === item.id ? "text-[#F0B90B]" : "text-[#474D57]"}`}>
                    {item.num}
                  </span>
                  <span className="truncate">{lang === "zh" ? item.titleZh : item.titleEn}</span>
                </button>
              ))}
            </nav>

            {/* Download hint */}
            <div className="mt-6 p-3 bg-[#1E2026] border border-[#2B2F36] rounded">
              <p className="text-[#848E9C] text-xs leading-relaxed">
                {lang === "zh"
                  ? "本白皮书持续更新，请以官网最新版本为准。"
                  : "This whitepaper is continuously updated. Please refer to the latest version on the official website."}
              </p>
            </div>
          </div>
        </aside>

        {/* ── Content ── */}
        <main ref={contentRef} className="flex-1 min-w-0 max-w-3xl">
          {SECTIONS.map((section, idx) => (
            <section
              key={section.id}
              id={section.id}
              ref={el => { sectionRefs.current[section.id] = el; }}
              className={`mb-12 ${idx > 0 ? "pt-4 border-t border-[#2B2F36]" : ""}`}
            >
              {/* Section header */}
              <div className="flex items-baseline gap-3 mb-5">
                <span className="font-mono text-[#F0B90B] text-sm font-bold">{section.num}/</span>
                <h2 className="text-lg font-bold text-[#EAECEF]">
                  {lang === "zh" ? section.titleZh : section.titleEn}
                </h2>
              </div>

              {/* Content */}
              <div className="prose-custom">
                {renderContent(lang === "zh" ? section.contentZh : section.contentEn)}
              </div>

              {/* Subsections */}
              {section.subsections?.map((sub, si) => (
                <div key={si} className="mt-6 pl-4 border-l-2 border-[#2B2F36]">
                  <h3 className="text-sm font-semibold text-[#EAECEF] mb-3">
                    {lang === "zh" ? sub.titleZh : sub.titleEn}
                  </h3>
                  <div>{renderContent(lang === "zh" ? sub.contentZh : sub.contentEn)}</div>
                </div>
              ))}
            </section>
          ))}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-[#2B2F36] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={SENTIA_ICON} alt="SNT" className="w-5 h-5 rounded-full opacity-60" />
              <span className="text-[#474D57] text-xs">© 2025 Sentia Protocol. All Rights Reserved.</span>
            </div>
            <button
              onClick={() => navigate("/sentia/buy")}
              className="bg-[#F0B90B] hover:bg-[#F8D12F] text-[#0B0E11] font-semibold text-sm px-5 py-2 rounded transition-colors"
            >
              {lang === "zh" ? "立即参与预售" : "Join Presale"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
