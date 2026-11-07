import originalAIAnimation from "@/assets/aitag-blue.json";

/** 只重着色独立副本：52号融资页继续使用原来的蓝色素材和动画。 */
const animation = JSON.parse(JSON.stringify(originalAIAnimation)) as typeof originalAIAnimation;
function recolorShapes(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(recolorShapes);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, any>;
  if ((node.ty === "fl" || node.ty === "st") && node.c?.a === 0 && Array.isArray(node.c.k)) {
    const [r, g, b, alpha = 1] = node.c.k as number[];
    node.c.k = r > 0.95 && g > 0.95 && b > 0.95
      ? [231 / 255, 252 / 255, 1, alpha]
      : [46 / 255, 206 / 255, 224 / 255, alpha];
  }
  Object.values(node).forEach(recolorShapes);
}
recolorShapes(animation);
export const aiStockSearchAnimation = animation;
