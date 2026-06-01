"""隐藏首页轮播中的NBA海报页，并将SOCIAL_PAGES从5改为4"""
with open('/home/ubuntu/haoyouji-web-git/client/src/pages/Home.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. SOCIAL_PAGES 从 5 改为 4
content = content.replace('const SOCIAL_PAGES = 5;', 'const SOCIAL_PAGES = 4;')

# 2. 用 {false && ...} 注释掉 NBA 海报页（页3）
old_nba = '''          // 页3：AI球伴NBA总决赛海报（仅展示，不可点击）
          <div
            key="p2-nba"
            className="w-full h-full relative"
          >
            <img
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/banners/nba-finals-banner.webp"
              alt="AI球伴·NBA总决赛同行"
              className="w-full h-full object-cover"
            />
          </div>,'''

new_nba = '''          // 页3：AI球伴NBA总决赛海报（暂时隐藏）
          // <div key="p2-nba" ...> 已隐藏，SOCIAL_PAGES=4 时不包含此页 </div>'''

content = content.replace(old_nba, new_nba)

with open('/home/ubuntu/haoyouji-web-git/client/src/pages/Home.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# 验证
import re
pages = re.search(r'SOCIAL_PAGES = (\d+)', content)
print(f'SOCIAL_PAGES = {pages.group(1)}')
nba_hidden = 'NBA总决赛海报（暂时隐藏）' in content
print(f'NBA海报已隐藏: {nba_hidden}')
print('SUCCESS')
