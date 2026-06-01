"""
将海报图片压缩为 webp 格式，符合 Banner 规范：
- 格式：.webp
- 建议尺寸：1200×400 px（移动端 Banner 用 750×400 更合适）
- 建议大小：< 300 KB
"""
from PIL import Image
import os

def compress_banner(src_path, dst_path, target_width=1200, target_height=630, quality=85):
    """压缩并转换为 webp，保持比例居中裁切到目标尺寸"""
    img = Image.open(src_path).convert('RGB')
    orig_w, orig_h = img.size
    
    # 按目标比例缩放（保持比例，取最大覆盖）
    ratio = max(target_width / orig_w, target_height / orig_h)
    new_w = int(orig_w * ratio)
    new_h = int(orig_h * ratio)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    
    # 居中裁切
    left = (new_w - target_width) // 2
    top = (new_h - target_height) // 2
    img = img.crop((left, top, left + target_width, top + target_height))
    
    # 保存为 webp
    img.save(dst_path, 'WEBP', quality=quality, method=6)
    size_kb = os.path.getsize(dst_path) / 1024
    print(f'压缩完成: {dst_path} ({target_width}x{target_height}px, {size_kb:.1f}KB)')
    return size_kb

# AI 旅行海报
compress_banner(
    '/home/ubuntu/haoyouji-web-git/ai_travel_poster_v14.png',
    '/home/ubuntu/haoyouji-web-git/client/public/ai-travel-banner.webp',
    target_width=1200, target_height=630, quality=85
)

# NBA 海报（从临时文件）
compress_banner(
    '/tmp/nba_banner.png',
    '/home/ubuntu/haoyouji-web-git/client/public/nba-finals-banner.webp',
    target_width=1200, target_height=630, quality=85
)

print('全部压缩完成！')
