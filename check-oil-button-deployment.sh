#!/bin/bash

echo "=== 石油按钮部署验证 ==="
echo "时间: $(date)"
echo ""

echo "1. 检查石油按钮代码..."
if grep -q "石油业务" client/src/pages/LedgerDetail.tsx; then
    echo "✅ 石油按钮代码已添加"
else
    echo "❌ 石油按钮代码未找到"
fi

echo ""
echo "2. 检查石油页面文件..."
if [ -f "client/src/pages/OilBusinessPage.tsx" ]; then
    echo "✅ OilBusinessPage.tsx 存在"
else
    echo "❌ OilBusinessPage.tsx 不存在"
fi

if [ -f "client/src/pages/OilPricesPage.tsx" ]; then
    echo "✅ OilPricesPage.tsx 存在"
else
    echo "❌ OilPricesPage.tsx 不存在"
fi

if [ -f "client/src/pages/OilTradesPage.tsx" ]; then
    echo "✅ OilTradesPage.tsx 存在"
else
    echo "❌ OilTradesPage.tsx 不存在"
fi

echo ""
echo "3. 检查路由配置..."
if grep -q "OilBusinessPage" client/src/App.tsx; then
    echo "✅ 石油路由已配置"
else
    echo "❌ 石油路由未配置"
fi

echo ""
echo "4. 检查按钮位置..."
echo "石油按钮应该在QQ按钮旁边，条件相同："
echo "- 仅 jiang(870413) 和 yjh(4957151) 可见"
echo "- 仅 isCustomAF 账本显示"
echo ""
echo "按钮代码片段："
grep -B2 -A10 "石油业务入口" client/src/pages/LedgerDetail.tsx | head -15

echo ""
echo "5. 部署步骤："
echo "✅ 代码修改已完成"
echo "🔧 需要重新编译：npm run build"
echo "🚀 需要重启服务器：pm2 restart haoyouji-web"
echo ""
echo "6. 测试步骤："
echo "   1. 访问52号账本：/ledger/52"
echo "   2. 查看右上角QQ按钮旁边是否有石油图标"
echo "   3. 点击石油图标进入石油业务页面"
echo "   4. 测试页面导航功能"

echo ""
echo "=== 部署验证完成 ==="