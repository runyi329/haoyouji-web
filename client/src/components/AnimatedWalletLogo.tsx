import { memo, useEffect, useState } from "react";
import Lottie from "lottie-react";
import { Wallet } from "lucide-react";

/** 与脉动首页共用金色跳动钱包素材，不引入首页的业务查询。 */
const AnimatedWalletLogo = memo(function AnimatedWalletLogo() {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/wallet_gold.json", { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("钱包动画暂时不可用");
        return response.json();
      })
      .then(setAnimationData)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <span className="pointer-events-none block h-full w-full" aria-hidden="true">
      {animationData ? (
        <Lottie animationData={animationData} loop autoplay style={{ width: "100%", height: "100%" }} />
      ) : (
        <Wallet className="h-full w-full p-1 text-[#C9A84C]" strokeWidth={1.8} />
      )}
    </span>
  );
});

export default AnimatedWalletLogo;
