#!/usr/bin/env python3
"""
Patch: FinanceManagement.tsx 添加用户 Tab 切换
- owner/admin 可看所有人，顶部显示用户 Tab（全部 + 各成员）
- 普通成员只看自己，不显示 Tab
"""

with open('client/src/pages/FinanceManagement.tsx', 'r') as f:
    content = f.read()

# 1. 在 state 定义区域添加 activeUserTab state（在 showPaymentPanel 之后）
old_state = "  const [showPaymentPanel, setShowPaymentPanel] = useState<number | null>(null);"
new_state = """  const [showPaymentPanel, setShowPaymentPanel] = useState<number | null>(null);
  // 用户 Tab 筛选（管理员可切换，普通成员固定看自己）
  const [activeUserTab, setActiveUserTab] = useState<number | 'all'>('all');"""

if old_state in content:
    content = content.replace(old_state, new_state, 1)
    print('OK: 添加 activeUserTab state')
else:
    print('FAIL: 未找到 showPaymentPanel state')

# 2. 在 realMembers 定义后，添加 isManager 和 filteredOrders 计算
old_real_members = """  const realMembers = (members as any[] || []).filter((m: any) => !m.isAiClone);"""
new_real_members = """  const realMembers = (members as any[] || []).filter((m: any) => !m.isAiClone);
  // 当前登录用户在账本中的角色（通过 orders 返回的 user_id 推断：管理员能看到多个用户的订单）
  // 更可靠的方式：检查 members 列表中是否有多于一个用户的订单
  const uniqueOrderUserIds = Array.from(new Set(orders.map((o: any) => o.user_id)));
  // 如果 orders 中有多个不同 user_id，说明当前用户是管理员
  const amIManager = uniqueOrderUserIds.length > 1 || (realMembers.length > 0 && (() => {
    // 备用：通过 members 中找到当前用户的 role
    // 由于前端没有直接的 currentUserId，通过 orders 中自己的 user_id 来判断
    // 如果 orders 为空但有成员列表，无法判断，默认显示全部
    return false;
  })());
  // 按 activeUserTab 筛选订单
  const displayOrders = activeUserTab === 'all'
    ? orders
    : orders.filter((o: any) => o.user_id === activeUserTab);
  // 获取有订单的用户列表（用于 Tab 展示）
  const usersWithOrders = realMembers.filter((m: any) =>
    orders.some((o: any) => o.user_id === m.userId)
  );"""

if old_real_members in content:
    content = content.replace(old_real_members, new_real_members, 1)
    print('OK: 添加 isManager / filteredOrders 计算')
else:
    print('FAIL: 未找到 realMembers 定义')

# 3. 在订单列表区域前插入用户 Tab（在 "融资订单列表" 标题前）
old_list_header = """        <div>
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            融资订单列表 {orders.length > 0 ? `· ${orders.length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无融资订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order: any) => {"""

new_list_header = """        <div>
          {/* 用户 Tab：有多个用户有订单时才显示 */}
          {usersWithOrders.length > 1 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setActiveUserTab('all')}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={
                  activeUserTab === 'all'
                    ? { background: '#1A56DB', color: '#fff', boxShadow: '0 2px 6px rgba(26,86,219,0.3)' }
                    : { background: '#fff', color: '#6B7280', border: '1px solid #E5E7EB' }
                }
              >
                全部 {orders.length > 0 ? `(${orders.length})` : ''}
              </button>
              {usersWithOrders.map((m: any) => {
                const name = m.nickname || m.username || `用户${m.userId}`;
                const count = orders.filter((o: any) => o.user_id === m.userId).length;
                const isActive = activeUserTab === m.userId;
                return (
                  <button
                    key={m.userId}
                    onClick={() => setActiveUserTab(m.userId)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={
                      isActive
                        ? { background: '#1A56DB', color: '#fff', boxShadow: '0 2px 6px rgba(26,86,219,0.3)' }
                        : { background: '#fff', color: '#6B7280', border: '1px solid #E5E7EB' }
                    }
                  >
                    {m.avatar && (
                      <img src={m.avatar} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                    )}
                    {name}
                    {count > 0 && <span className="opacity-70">({count})</span>}
                  </button>
                );
              })}
            </div>
          )}
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            {activeUserTab === 'all'
              ? `融资订单列表 ${orders.length > 0 ? `· ${orders.length} 笔` : ''}`
              : `${(realMembers.find((m: any) => m.userId === activeUserTab)?.nickname || realMembers.find((m: any) => m.userId === activeUserTab)?.username || '用户')} 的订单 · ${displayOrders.length} 笔`}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : displayOrders.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无融资订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {displayOrders.map((order: any) => {"""

if old_list_header in content:
    content = content.replace(old_list_header, new_list_header, 1)
    print('OK: 添加用户 Tab 和替换 orders.map 为 displayOrders.map')
else:
    print('FAIL: 未找到订单列表 header 代码块')
    # 调试
    idx = content.find('融资订单列表')
    print(f'  "融资订单列表" 位置: {idx}')

with open('client/src/pages/FinanceManagement.tsx', 'w') as f:
    f.write(content)

print('FinanceManagement.tsx 修改完成')
