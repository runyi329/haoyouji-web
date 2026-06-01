from PIL import Image, ImageFilter, ImageEnhance
import numpy as np

src = "/home/ubuntu/haoyouji-web-git/ai_travel_poster_v8.png"
dst = "/home/ubuntu/haoyouji-web-git/ai_travel_poster_v9.png"

img = Image.open(src).convert("RGB")

# 1. 轻微高斯模糊消除过度锐化的光晕边缘（radius=0.6，非常轻）
blurred = img.filter(ImageFilter.GaussianBlur(radius=0.6))

# 2. 用 Unsharp Mask 做自然的细节增强（而非锐化）
# radius小、percent低、threshold高 = 自然细节，无光晕
natural_sharp = blurred.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=4))

# 3. 轻微提升对比度（+5%），让画面通透
contrast = ImageEnhance.Contrast(natural_sharp)
result = contrast.enhance(1.05)

# 4. 轻微提升亮度（+3%），补偿模糊带来的轻微变暗
brightness = ImageEnhance.Brightness(result)
result = brightness.enhance(1.03)

# 5. 色彩饱和度微调（保持不变，避免过饱和）
color = ImageEnhance.Color(result)
result = color.enhance(1.02)

result.save(dst, "PNG", quality=95)
print(f"Done: {dst}")
print(f"Size: {result.size}")
