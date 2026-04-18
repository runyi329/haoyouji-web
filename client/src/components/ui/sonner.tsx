import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useEffect, useState } from "react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  // 动态计算APP容器的水平中心位置，修正toast偏移
  const [offset, setOffset] = useState<string>("50%");

  useEffect(() => {
    const calcOffset = () => {
      // APP内容区通常是 max-w-md mx-auto，找到它的中心
      const appEl =
        document.querySelector<HTMLElement>(".max-w-md") ||
        document.querySelector<HTMLElement>("[class*='max-w-md']") ||
        document.body;
      const rect = appEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      setOffset(`${centerX}px`);
    };
    calcOffset();
    window.addEventListener("resize", calcOffset);
    return () => window.removeEventListener("resize", calcOffset);
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      toastOptions={{
        style: {
          fontSize: '15px',
          padding: '14px 20px',
          borderRadius: '12px',
          textAlign: 'center',
          minWidth: '240px',
          maxWidth: '300px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // 覆盖sonner默认的left定位，对齐到APP容器中心
          left: offset,
          right: "auto",
          transform: "translateX(-50%)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
