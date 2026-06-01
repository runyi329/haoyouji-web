from PIL import Image, ImageFilter, ImageEnhance
import numpy as np

src = "/home/ubuntu/haoyouji-web-git/ai_travel_poster_v8.png"
dst = "/home/ubuntu/haoyouji-web-git/ai_travel_poster_v10.png"

img = Image.open(src).convert("RGB")
arr = np.array(img, dtype=np.float32) / 255.0

# ============================================================
# 去HDR核心：压制局部对比度（Local Contrast Reduction）
# HDR的本质是局部对比度过高，用大半径模糊提取"局部亮度基底"
# 然后把原图往基底方向拉，减弱局部反差
# ============================================================

# 1. 提取大范围低频亮度基底（模拟HDR的局部tone mapping逆操作）
base_img = img.filter(ImageFilter.GaussianBlur(radius=30))
base = np.array(base_img, dtype=np.float32) / 255.0

# 2. 计算局部对比度层（高频细节层）
detail = arr - base  # 范围约 -1 ~ 1

# 3. 压制局部对比度：把detail层乘以系数（<1 = 减弱HDR感）
detail_reduced = detail * 0.72  # 压制28%的局部对比度

# 4. 重建图像
result = base + detail_reduced
result = np.clip(result, 0, 1)

# 5. 轻微降低整体对比度（S曲线压缩，避免高光死白/阴影死黑）
# 用gamma压缩高光区域
gamma = 1.08  # 轻微提亮暗部
result = np.power(result, 1.0 / gamma)

# 6. 轻微降低饱和度（HDR通常饱和度也偏高）
result_img = Image.fromarray((result * 255).astype(np.uint8))
color_enhance = ImageEnhance.Color(result_img)
result_img = color_enhance.enhance(0.92)  # 降8%饱和度

# 7. 轻微提升整体亮度补偿
brightness = ImageEnhance.Brightness(result_img)
result_img = brightness.enhance(1.04)

result_img.save(dst, "PNG")
print(f"Done: {dst}, size: {result_img.size}")
