from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

src = "/home/ubuntu/haoyouji-web-git/ai_travel_poster_v10.png"
dst = "/home/ubuntu/haoyouji-web-git/ai_travel_poster_v11.png"

img = Image.open(src).convert("RGB")
arr = np.array(img, dtype=np.float32) / 255.0

r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]

# ============================================================
# 分色域增强：针对不同颜色范围做定向微调
# 目标：让黄/红/绿/蓝各色域更丰富，但不整体提饱和度
# ============================================================

result = arr.copy()

# 1. 暖化石材/沙漠/建筑的灰黄区域
#    识别：中等亮度、偏灰、R略大于G略大于B
gray_stone_mask = (
    (r > 0.35) & (r < 0.75) &
    (np.abs(r - g) < 0.12) &
    (np.abs(g - b) < 0.12) &
    (r >= g) & (g >= b)
).astype(np.float32)
gray_stone_mask = np.stack([gray_stone_mask]*3, axis=2)
# 给石材区域加一点暖黄色
warm_shift = np.zeros_like(arr)
warm_shift[:,:,0] = 0.025   # 加红
warm_shift[:,:,1] = 0.015   # 加绿（变黄）
warm_shift[:,:,2] = -0.010  # 减蓝
result = result + warm_shift * gray_stone_mask

# 2. 丰富绿植区域（草绿、深绿）
#    识别：G明显大于R和B
green_mask = (
    (g > r + 0.04) &
    (g > b + 0.04) &
    (g > 0.25)
).astype(np.float32)
green_mask = np.stack([green_mask]*3, axis=2)
# 让绿色更饱满（加深绿，减灰）
green_shift = np.zeros_like(arr)
green_shift[:,:,1] = 0.03   # 加绿
green_shift[:,:,0] = -0.01  # 微减红
result = result + green_shift * green_mask

# 3. 丰富水面/天空蓝色区域
#    识别：B明显大于R，G适中
blue_mask = (
    (b > r + 0.06) &
    (b > 0.3) &
    (g > 0.2)
).astype(np.float32)
blue_mask = np.stack([blue_mask]*3, axis=2)
# 让蓝色更通透（加蓝青）
blue_shift = np.zeros_like(arr)
blue_shift[:,:,2] = 0.025   # 加蓝
blue_shift[:,:,1] = 0.010   # 加一点青
result = result + blue_shift * blue_mask

# 4. 丰富暖色区域（橙红、金黄 - 日出/金字塔/长城暖光）
#    识别：R高，G中，B低
warm_color_mask = (
    (r > 0.5) &
    (r > g + 0.08) &
    (g > b + 0.05)
).astype(np.float32)
warm_color_mask = np.stack([warm_color_mask]*3, axis=2)
# 让暖色更饱满
warm_color_shift = np.zeros_like(arr)
warm_color_shift[:,:,0] = 0.02   # 加红
warm_color_shift[:,:,1] = 0.008  # 微加绿（保持橙感）
result = result + warm_color_shift * warm_color_mask

# 5. 整体轻微提升色彩对比（让各色域拉开距离，增加丰富感）
#    用Lab空间思路：把颜色往各自主色方向轻推
mean_color = np.mean(result, axis=2, keepdims=True)
mean_color = np.repeat(mean_color, 3, axis=2)
chroma_boost = (result - mean_color) * 0.12  # 色度增强12%
result = result + chroma_boost

# 6. 轻微整体亮度提升（补偿）
result = result * 1.02

result = np.clip(result, 0, 1)

# 7. 最后用PIL做极轻微的清晰度提升（不是锐化，是clarity）
result_img = Image.fromarray((result * 255).astype(np.uint8))

# Clarity = 中频对比度提升（大半径unsharp mask，低强度）
clarity = result_img.filter(ImageFilter.UnsharpMask(radius=8, percent=18, threshold=3))

# 轻微提升整体对比度（让色彩更有层次）
contrast = ImageEnhance.Contrast(clarity)
final = contrast.enhance(1.06)

final.save(dst, "PNG")
print(f"Done: {dst}")
