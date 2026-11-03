# 全站地址下拉数据

`china-regions-source.json` 是全站地址选择的单一离线来源。由 `shared/china-regions.ts` 生成省、市、区县视图，米伴、商品购买、牙伴、自定和洗护入口不得再维护各自的抽样地区表。

## 来源与版本

- 上游：[mumuy/data_location](https://github.com/mumuy/data_location)，MIT 许可，原许可证保存在 `china-regions-source.LICENSE`。
- 固定数据提交：`a40c560aba1bff85fbf3e371cdf6a923f923328f`，上游提交时间 2026-04-18。
- [固定版本原始数据](https://raw.githubusercontent.com/mumuy/data_location/a40c560aba1bff85fbf3e371cdf6a923f923328f/list.json)。本地仅做 JSON 缩进和尾换行调整；全部 3433 个代码名称对均已与该版本比对一致。
- 收录 34 个省级名称。港澳台编码由上游为前端统一检索整理，不应当作官方行政代码提交至政府、物流或其他外部接口。当前业务继续保存原来的中文地区字段，不切换到编码。
- 核验时参考了 [cn-division](https://github.com/kk-418/cn-division) 和 [AreaCity 数据来源说明](https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov)，以识别直辖市、省直管县市和无县级行政区城市的结构差异。本项目未将街镇数据合并进区县层。

该快照不代表行政区永不变化。更新时应固定新的来源提交、保留许可证并重新执行下述全量覆盖测试，而不能在页面里逐个手补城市。

## 层级及旧地址兼容

北京、天津、上海、重庆、香港、澳门在统一的三层视图中使用同名的省级和市级；原来跳过市级的表单继续直接选择区县。重庆的区和县同时合并，不能漏掉县级节点。

济源、仙桃、神农架、海南省直管县市、新疆兵团城市及其他无地级父节点的县市，直接作为所在省的可选市级节点，不再用“其他地区”假分组代替。没有真实县级子节点的城市，区县数组为空且区县可选填，街镇和门牌号由详细地址承载。

投递地址还需覆盖实际管辖地区。按[大兴安岭行署官方行政区划说明](https://dxal.gov.cn/dxal/c100014/tydp.shtml)，在黑龙江省大兴安岭地区补入加格达奇区、松岭区、新林区、呼中区四个选项；基础 JSON 原样保留，补充集中在共享适配层，不能为其编造官方编码。

`withCurrentRegionOption` 只在编辑或回填旧地址时保留已保存的原名称，不把撤并、更名或历史错字静默改成其他地址；切换省、市时仍清空其下级。地区数据更新不迁移或改写真实订单及地址簿记录。

## 检查

```bash
pnpm exec vitest run server/china-regions.test.ts server/miban-region-data.test.ts
pnpm check
pnpm build
```

测试逐条验证来源中每个省、市、县区的归属和可达性，并覆盖省内城市完整性、直辖市、港澳台、省直管县市、无县级区划城市和历史名称保留。
