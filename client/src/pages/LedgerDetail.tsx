// ... [前面3495行代码保持不变] ...
            className="relative w-full rounded-t-3xl px-5 pt-5 pb-8"
            style={{ background: '#FFF8F0', boxShadow: '0 -4px 32px rgba(58,20,0,0.25)', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-bold" style={{ color: '#1A0A00' }}>权重详情</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(58,20,0,0.5)' }}>最终股票数 = 资金股 × (1 + 资金乘数 + 资源乘数)</div>
              </div>
              <button onClick={() => setShowWeightDetail(false)} style={{ background: 'rgba(58,20,0,0.08)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: 'rgba(58,20,0,0.6)', fontSize: 14 }}>×</button>
            </div>

            {/* ===== 上半部分：用户实际数据（占位） ===== */}
            <div className="rounded-2xl p-6 mb-4" style={{ background: 'rgba(201,168,76,0.05)', border: '1px dashed rgba(201,168,76,0.3)', minHeight: '120px' }}>
              <div className="text-center text-xs" style={{ color: 'rgba(58,20,0,0.4)' }}>用户实际权重数据区域（即将上线）</div>
            </div>

            {/* ===== 下半部分：权重规则说明（合并表格） ===== */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)' }}>

              {/* 总览说明 */}
              <div className="text-xs font-bold mb-1" style={{ color: '#1A0A00' }}>权重计算规则</div>
              <div className="text-[10px] mb-4" style={{ color: 'rgba(58,20,0,0.5)' }}>最终股票数 = 资金股 × (1 + 资金乘数 + 资源乘数)，资金乘数满分 +2.0，资源乘数满分 +2.0</div>

              {/* ===== 合并的权重规则表格 ===== */}
              <table className="w-full text-[10px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(201,168,76,0.15)' }}>
                    <th className="text-center px-2 py-2" style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)' }}>乘数类型</th>
                    <th className="text-left px-2 py-2" style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)' }}>维度</th>
                    <th className="text-center px-2 py-2" style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)' }}>权重</th>
                    <th className="text-center px-2 py-2" style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)' }}>满分</th>
                    <th className="text-left px-2 py-2" style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)' }}>计分规则</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ===== 资源乘数部分 ===== */}
                  <tr style={{ background: 'rgba(201,168,76,0.08)' }}>
                    <td rowSpan={7} className="text-center px-2 py-2 font-bold align-top" style={{ color: '#C9A84C', border: '1px solid rgba(201,168,76,0.2)', verticalAlign: 'top', paddingTop: '12px' }}>
                      资源乘数<br/>
                      <span className="text-[9px] font-normal" style={{ color: 'rgba(58,20,0,0.6)' }}>(满分+2.0)</span>
                    </td>
                    <td colSpan={4} className="px-2 py-1.5 font-bold" style={{ color: 'rgba(58,20,0,0.85)', border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.1)' }}>
                      一、人脉贡献（权重50%，满分 +1.0）
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.8)', border: '1px solid rgba(201,168,76,0.15)' }}>自建人脉</td>
                    <td className="text-center px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(201,168,76,0.15)' }}>50%</td>
                    <td className="text-center px-2 py-1.5 font-bold" style={{ color: '#C9A84C', border: '1px solid rgba(201,168,76,0.15)' }}>+0.50</td>
                    <td className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.6)', border: '1px solid rgba(201,168,76,0.15)' }}>每1人得1分，≥100人满分</td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.04)' }}>
                    <td className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.8)', border: '1px solid rgba(201,168,76,0.15)' }}>直接共享人脉</td>
                    <td className="text-center px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(201,168,76,0.15)' }}>30%</td>
                    <td className="text-center px-2 py-1.5 font-bold" style={{ color: '#C9A84C', border: '1px solid rgba(201,168,76,0.15)' }}>+0.30</td>
                    <td className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.6)', border: '1px solid rgba(201,168,76,0.15)' }}>每8人得1分，≥800人满分</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.8)', border: '1px solid rgba(201,168,76,0.15)' }}>拓扑转介绍人脉</td>
                    <td className="text-center px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(201,168,76,0.15)' }}>20%</td>
                    <td className="text-center px-2 py-1.5 font-bold" style={{ color: '#C9A84C', border: '1px solid rgba(201,168,76,0.15)' }}>+0.20</td>
                    <td className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.6)', border: '1px solid rgba(201,168,76,0.15)' }}>每20人得1分，≥2000人满分</td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.08)' }}>
                    <td colSpan={4} className="px-2 py-1.5 font-bold" style={{ color: 'rgba(58,20,0,0.85)', border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.1)' }}>
                      二、标签贡献（权重30%，满分 +0.6）<span className="text-[9px] font-normal ml-1" style={{ color: 'rgba(58,20,0,0.5)' }}>人均标签数对数曲线</span>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2" style={{ border: '1px solid rgba(201,168,76,0.15)' }}>
                      <div className="text-[9px]" style={{ color: 'rgba(58,20,0,0.6)', lineHeight: '1.4' }}>
                        1个标签→33分(+0.20) | 3个→61分(+0.37) | 5个→75分(+0.45) | 10个→95分(+0.57) | ≥15个→100分(+0.60)
                      </div>
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.04)' }}>
                    <td colSpan={4} className="px-2 py-1.5" style={{ color: 'rgba(58,20,0,0.75)', border: '1px solid rgba(201,168,76,0.15)' }}>
                      <span className="font-bold">三、邀请贡献（权重20%，满分 +0.4）</span>
                      <span className="ml-2 text-[9px]" style={{ color: 'rgba(58,20,0,0.6)' }}>每邀请1位用户得1分，≥100人满分</span>
                    </td>
                  </tr>

                  {/* ===== 资金乘数部分 ===== */}
                  <tr style={{ background: 'rgba(201,168,76,0.08)' }}>
                    <td rowSpan={3} className="text-center px-2 py-2 font-bold align-top" style={{ color: '#C9A84C', border: '1px solid rgba(201,168,76,0.2)', verticalAlign: 'top', paddingTop: '12px' }}>
                      资金乘数<br/>
                      <span className="text-[9px] font-normal" style={{ color: 'rgba(58,20,0,0.6)' }}>(满分+2.0)</span>
                    </td>
                    <td colSpan={4} className="px-2 py-1.5 font-bold" style={{ color: 'rgba(58,20,0,0.85)', border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.1)' }}>
                      一、时间乘数（满分 +1.0）
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2" style={{ border: '1px solid rgba(201,168,76,0.15)' }}>
                      <div className="text-[10px]" style={{ color: 'rgba(58,20,0,0.75)' }}>按入场先后排名，第1名得满分 +1.0，第666名得 0，中间线性递减</div>
                      <div className="text-[9px] mt-0.5" style={{ color: 'rgba(58,20,0,0.5)' }}>第667名及以后：时间乘数为 0</div>
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.04)' }}>
                    <td colSpan={4} className="px-3 py-2" style={{ border: '1px solid rgba(201,168,76,0.15)' }}>
                      <div className="font-bold text-[10px] mb-0.5" style={{ color: 'rgba(58,20,0,0.85)' }}>二、资金量乘数（满分 +1.0）</div>
                      <div className="text-[10px]" style={{ color: 'rgba(58,20,0,0.75)' }}>以10万元为基准，出资金额 ÷ 10万 = 资金量乘数</div>
                      <div className="text-[9px] mt-0.5" style={{ color: 'rgba(58,20,0,0.5)' }}>示例：出资5万 → 乘数0.5；出资10万及以上 → 乘数1.0（满分）</div>
                    </td>
                  </tr>
                </tbody>
              </table>

            </div>

            <button
              onClick={() => setShowWeightDetail(false)}
              className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(58,20,0,0.08)', color: 'rgba(58,20,0,0.7)', border: 'none', cursor: 'pointer' }}
            >关闭</button>
          </div>
        </div>
      )}

      {/* 股权流水弹窗 */}
      {showEquityHistory && isCustomAI && (
        <EquityHistoryModal
          ledgerId={Number(ledgerId)}
          userId={equityHistoryUserId ?? user?.id ?? 0}
          nickname={equityHistoryUserId
            ? ((membersData as any[])?.find((m: any) => m.userId === equityHistoryUserId)?.nickname || '成员')
            : (user?.nickname || user?.username || '我')}
          isAdmin={!viewAsUserId && (isOwner || isAdmin)}
          onClose={() => setShowEquityHistory(false)}
          onViewUser={(uid) => { setEquityHistoryUserId(uid); }}
          membersData={membersData as any[]}
        />
      )}
