#!/usr/bin/env python3
"""
生成带用户专属邀请二维码的海报
"""
import sys
import qrcode
from PIL import Image, ImageDraw, ImageFont
import io
import base64

def generate_poster(username: str, invite_url: str, template_path: str, output_path: str):
    """
    生成个性化海报
    
    Args:
        username: 用户名
        invite_url: 邀请链接
        template_path: 海报模板路径
        output_path: 输出路径
    """
    # 加载海报模板
    poster = Image.open(template_path)
    draw = ImageDraw.Draw(poster)
    
    # 生成二维码
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=0,
    )
    qr.add_data(invite_url)
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # 调整二维码大小为200x200
    qr_img = qr_img.resize((200, 200), Image.Resampling.LANCZOS)
    
    # 计算二维码位置（右下角区域）
    # 海报尺寸是1536x2752，二维码应该在右下角的红色区域
    # 根据设计，二维码中心应该在右侧40%区域的中央
    poster_width, poster_height = poster.size
    
    # 红色区域从底部开始，高度约为22%
    red_section_height = int(poster_height * 0.22)
    red_section_top = poster_height - red_section_height
    
    # 二维码放在右侧40%区域
    right_section_left = int(poster_width * 0.6)
    right_section_width = poster_width - right_section_left
    
    # 二维码居中
    qr_x = right_section_left + (right_section_width - 200) // 2
    qr_y = red_section_top + (red_section_height - 200) // 2
    
    # 粘贴二维码
    poster.paste(qr_img, (qr_x, qr_y))
    
    # 添加用户名文字（在二维码上方）
    try:
        # 尝试使用系统中文字体
        font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 24)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
        except:
            font = ImageFont.load_default()
    
    # 绘制"邀请人：username"文字
    text = f"邀请人：{username}"
    
    # 获取文字边界框
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # 文字居中在二维码上方
    text_x = qr_x + (200 - text_width) // 2
    text_y = qr_y - text_height - 20
    
    # 绘制白色文字
    draw.text((text_x, text_y), text, font=font, fill=(255, 255, 255))
    
    # 添加"扫码加入"文字（在二维码下方）
    scan_text = "扫码加入"
    bbox = draw.textbbox((0, 0), scan_text, font=font)
    scan_width = bbox[2] - bbox[0]
    
    scan_x = qr_x + (200 - scan_width) // 2
    scan_y = qr_y + 200 + 15
    
    draw.text((scan_x, scan_y), scan_text, font=font, fill=(255, 255, 255))
    
    # 保存海报
    poster.save(output_path, quality=95)
    print(f"Poster generated: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python3 generate_poster.py <username> <invite_url> <template_path> <output_path>")
        sys.exit(1)
    
    username = sys.argv[1]
    invite_url = sys.argv[2]
    template_path = sys.argv[3]
    output_path = sys.argv[4]
    
    generate_poster(username, invite_url, template_path, output_path)
