#!/usr/bin/env python3
"""
在AI旅行海报上叠加「AI环游世界」文字
位置：底部往上20%，水平居中
样式：白色主调，带彩色渐变阴影，毛笔艺术感
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# 读取原图（无文字版本）
src = '/home/ubuntu/haoyouji-web-git/ai_travel_base.png'
img = Image.open(src).convert('RGBA')
W, H = img.size
print(f"原图尺寸: {W}x{H}")

# 创建文字层
txt_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(txt_layer)

# 尝试加载中文字体
font_paths = [
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
]
font = None
font_size = int(W * 0.12)  # 字体大小约为图片宽度的12%
for fp in font_paths:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, font_size)
            print(f"使用字体: {fp}")
            break
        except:
            continue

if font is None:
    font = ImageFont.load_default()
    print("使用默认字体")

text = "AI环游世界"

# 计算文字位置（底部往上20%，水平居中）
bbox = draw.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
x = (W - text_w) // 2
y = int(H * 0.72)  # 底部往上28%的位置，确保不被容器截到

print(f"文字尺寸: {text_w}x{text_h}, 位置: ({x}, {y})")

# 1. 绘制彩色阴影（偏移+模糊）
shadow_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
shadow_draw = ImageDraw.Draw(shadow_layer)
# 彩色阴影：渐变色（橙→紫）
shadow_colors = [
    (255, 120, 50, 180),   # 橙
    (200, 80, 220, 180),   # 紫
]
for i, color in enumerate(shadow_colors):
    offset = 4 + i * 2
    shadow_draw.text((x + offset, y + offset), text, font=font, fill=color)
shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=6))

# 2. 绘制主文字（白色，带轻微彩色描边）
# 先画彩色描边
outline_colors = [
    (100, 200, 255, 200),  # 青蓝
    (255, 180, 50, 180),   # 金黄
]
for oc in outline_colors:
    for dx, dy in [(-2,-2),(2,-2),(-2,2),(2,2),(0,-3),(0,3),(-3,0),(3,0)]:
        draw.text((x + dx, y + dy), text, font=font, fill=oc)

# 主白色文字
draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))

# 3. 合并图层
result = Image.alpha_composite(img, shadow_layer)
result = Image.alpha_composite(result, txt_layer)

# 4. 转为RGB保存
result_rgb = result.convert('RGB')
out_path = '/home/ubuntu/haoyouji-web-git/ai_travel_poster_final_text.png'
result_rgb.save(out_path, 'PNG', quality=95)
print(f"保存完成: {out_path}")

# 5. 同时保存webp版本到client/public
webp_path = '/home/ubuntu/haoyouji-web-git/client/public/ai-travel-banner.webp'
result_rgb_resized = result_rgb.resize((900, 900), Image.LANCZOS)
result_rgb_resized.save(webp_path, 'WEBP', quality=85)
size = os.path.getsize(webp_path)
print(f"webp保存完成: {webp_path}, 大小: {size//1024}KB")
