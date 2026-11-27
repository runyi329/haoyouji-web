import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cryptoPortfolioBase, parsePortfolioInstrument, portfolioCurrency, portfolioDisplaySymbol, portfolioQuantityUnit, portfolioQuotePrefix, portfolioCashMultiplier, isValidCryptoPortfolioQuantity, type PortfolioCurrency, type PortfolioMarket } from "@shared/portfolio-instruments";
import { CryptoAssetSelect, getCryptoAssetSearchText } from "@/components/CryptoAssetSelect";
import { useDemandCryptoQuotes } from "@/hooks/useDemandCryptoQuotes";

type TradeType = "buy" | "sell";

type EditingSale = {
  eventId: number;
  lotId: number;
  stockName: string;
  symbol: string;
  currency: PortfolioCurrency;
  soldQuantity: number;
  unitCost: number;
  sellPrice: number;
  soldAt: string;
  sellNote?: string;
  memberShares?: Array<{ userId: number; name?: string; percentage: number }>;
};

type Props = {
  categoryId: number;
  categoryName: string;
  open: boolean;
  type: TradeType;
  /** 从股票列表逐笔卖出时，自动选中的持仓编号；顶部卖出入口保持手动选择。 */
  initialLotId?: number | null;
  /** 已卖出订单采用同一张卖出表单编辑，保存时覆盖原卖出记录而非新建更正单。 */
  editingSale?: EditingSale | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Sandbox hot previews read real ledger data, so transaction writes must stay disabled there. */
  readOnlyPreview?: boolean;
};

const formatQuantity = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 8 });
const STOCK_TRADE_FEE_RATE = 0.001;
const money = (value: number | null | undefined, currency: PortfolioCurrency = 'CNY') => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const prefix = portfolioQuotePrefix(currency);
  return `${prefix}${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// datetime-local 不携带时区，数字币一律按北京时间填入、按 +08:00 提交。
export function beijingTradeInputTime(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 16);
}

export function parseTradeInputTime(value: string, type: TradeType, isCrypto: boolean) {
  if (isCrypto) return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}:00+08:00`) : new Date(NaN);
  return type === 'sell' ? new Date(`${value}T12:00:00+08:00`) : new Date(value);
}

function localInputTime(now = new Date()) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function localInputDate(now = new Date()) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/**
 * New stock-tag trades are deliberately limited to two operations:
 * - buy: create a brand-new numbered lot;
 * - sell: select one existing numbered lot and close all its remaining shares.
 */
export function StockTagTradeDialog({ categoryId, categoryName, open, type, initialLotId = null, editingSale = null, onOpenChange, onSaved, readOnlyPreview = false }: Props) {
  const utils = trpc.useUtils();
  const { data: usdCnyRateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: 'USD', tocoin: 'CNY', money: 1 },
    { enabled: open, staleTime: 30_000, refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  const quotedUsdCnyRate = Number((usdCnyRateData as any)?.money);
  const usdCnyRate = Number.isFinite(quotedUsdCnyRate) && quotedUsdCnyRate > 0 ? quotedUsdCnyRate : 7.2;
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [stockMarket, setStockMarket] = useState<PortfolioMarket>('A');
  const [quantity, setQuantity] = useState("");
  const [executionPrice, setExecutionPrice] = useState("");
  const [actualTradedAt, setActualTradedAt] = useState(localInputTime());
  const [note, setNote] = useState("");
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [profitSharePercentages, setProfitSharePercentages] = useState<Record<string, string>>({});

  const portfolioQuery = trpc.ledger.getStockTagPortfolio.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: open && categoryId > 0, staleTime: 0, refetchInterval: (query) => (query.state.data as any)?.positions?.some((position: any) => parsePortfolioInstrument(position.symbol)?.market === 'CRYPTO') ? 5_000 : false, refetchIntervalInBackground: false },
  );
  const usdtCnyRate = portfolioCashMultiplier('USDT', null, (portfolioQuery.data as any)?.summary?.usdtCnyRate);
  const allocationMatrixQuery = trpc.ledger.getStockLotParticipationMatrix.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: open && type === "sell" && categoryId > 0, staleTime: 0 },
  );

  const isEditingSale = type === 'sell' && !!editingSale;
  const saleLots = useMemo(() => {
    let positionNumber = 0;
    const activeLots = (((portfolioQuery.data as any)?.positions || []) as any[]).flatMap((position: any) => (
      (position.lots || []).map((lot: any) => {
        positionNumber += 1;
        return {
          id: Number(lot.id),
          positionNumber: String(positionNumber).padStart(2, "0"),
          stockName: String(position.stockName || lot.stockName || "股票"),
          symbol: String(position.symbol || lot.symbol || ""),
          quantity: Number(lot.quantity || 0),
          unitCost: Number(lot.unitCost || 0),
          marketPrice: position.marketPrice === null || position.marketPrice === undefined ? null : Number(position.marketPrice),
          currency: portfolioCurrency(position.symbol || lot.symbol),
          tradedAt: String(lot.actualTradedAt || lot.openedAt || ''),
        };
      })
    )).filter((lot: any) => lot.id > 0 && lot.quantity > 0);
    if (!editingSale) return activeLots;
    return [{
      id: Number(editingSale.lotId),
      positionNumber: '已卖出',
      stockName: String(editingSale.stockName || '股票'),
      symbol: String(editingSale.symbol || ''),
      quantity: Number(editingSale.soldQuantity || 0),
      unitCost: Number(editingSale.unitCost || 0),
      marketPrice: null,
      currency: portfolioCurrency(editingSale.symbol),
      tradedAt: editingSale.soldAt,
    }];
  }, [portfolioQuery.data, editingSale]);

  const selectedSaleLot = saleLots.find((lot: any) => lot.id === selectedLotId) || null;
  const tradeCurrency: PortfolioCurrency = type === 'buy'
    ? (stockMarket === 'CRYPTO' ? 'USDT' : stockMarket === 'US' ? 'USD' : 'CNY')
    : (selectedSaleLot?.currency || 'CNY');
  const isCryptoTrade = tradeCurrency === 'USDT';
  const tradeQuantityUnit = isCryptoTrade ? '币' : '股';
  const canWrite = !readOnlyPreview && Boolean((portfolioQuery.data as any)?.canEdit);
  const tradeCashRate = portfolioCashMultiplier(tradeCurrency, usdCnyRate, usdtCnyRate);
  const tradePrice = Number(executionPrice);
  const tradePriceCny = tradeCurrency !== 'CNY' && tradeCashRate !== null && Number.isFinite(tradePrice) && tradePrice > 0
    ? tradePrice * tradeCashRate
    : null;
  const saleSettlementPreview = type === 'sell' && selectedSaleLot && Number.isFinite(tradePrice) && tradePrice > 0
    ? (() => {
      const quantity = Number(selectedSaleLot.quantity || 0);
      const buyAmount = quantity * Number(selectedSaleLot.unitCost || 0);
      const sellAmount = quantity * tradePrice;
      const buyFee = buyAmount * STOCK_TRADE_FEE_RATE;
      const sellFee = sellAmount * STOCK_TRADE_FEE_RATE;
      return { buyAmount, sellAmount, buyFee, sellFee, netProfit: sellAmount - sellFee - buyAmount - buyFee };
    })()
    : null;
  // 这里直接读取初始标签管理所用的「批次 × 成员」份额矩阵。
  // 卖出页改比例后，服务端会在结清前原子地写回同一份成员持仓记录。
  const saleAllocationMembers = useMemo(() => {
    const matrix = allocationMatrixQuery.data as any;
    const lot = (matrix?.lots || []).find((item: any) => Number(item.id) === Number(selectedLotId));
    if (!selectedLotId) return [];
    const savedSharesByUser = new Map((editingSale?.memberShares || []).map((share) => [Number(share.userId), Number(share.percentage)]));
    const matrixMembers = (matrix?.members || []) as any[];
    const members = matrixMembers.length > 0
      ? matrixMembers
      : (editingSale?.memberShares || []).map((share) => ({ userId: share.userId, name: share.name || `用户#${share.userId}` }));
    return members.map((member) => {
      const participation = (lot?.participations || []).find((item: any) => Number(item.userId) === Number(member.userId));
      const quantity = editingSale
        ? Number(selectedSaleLot?.quantity || 0) * (savedSharesByUser.get(Number(member.userId)) || 0) / 100
        : Number(participation?.remainingQuantity || 0);
      return {
        key: `member:${Number(member.userId)}`,
        userId: Number(member.userId),
        name: String(member.name || member.username || `用户#${member.userId}`),
        quantity,
      };
    }).sort((left, right) => {
      const leftHasShares = left.quantity > 0.00000001;
      const rightHasShares = right.quantity > 0.00000001;
      if (leftHasShares !== rightHasShares) return leftHasShares ? -1 : 1;
      if (Math.abs(right.quantity - left.quantity) > 0.00000001) return right.quantity - left.quantity;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
  }, [allocationMatrixQuery.data, editingSale, selectedLotId, selectedSaleLot?.quantity]);
  const saleAllocationMemberKey = saleAllocationMembers.map((member) => `${member.key}:${member.quantity}`).join("|");
  useEffect(() => {
    if (!open || type !== "sell" || saleAllocationMembers.length === 0 || !selectedSaleLot) {
      setProfitSharePercentages({});
      return;
    }
    const totalQuantity = Number(selectedSaleLot.quantity || 0);
    setProfitSharePercentages(Object.fromEntries(saleAllocationMembers.map((member) => [
      member.key,
      (totalQuantity > 0 ? member.quantity / totalQuantity * 100 : 0).toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"),
    ])));
  }, [open, type, selectedLotId, saleAllocationMemberKey, selectedSaleLot?.id, selectedSaleLot?.quantity]);
  const saleMemberDistribution = saleAllocationMembers.map((member) => ({
    ...member,
    percentage: Number(profitSharePercentages[member.key]),
  }));
  const distributionTotalPercent = saleMemberDistribution.reduce((sum, member) => sum + (Number.isFinite(member.percentage) ? member.percentage : 0), 0);
  const accountRetainedPercent = Math.max(0, 100 - distributionTotalPercent);
  const distributionGapPercent = 100 - distributionTotalPercent;
  const distributionStatus = distributionTotalPercent > 100.001
    ? { text: `超出 ${Math.abs(distributionGapPercent).toFixed(0)}%`, className: 'text-[#D32F2F]' }
    : { text: `剩余 ${Math.max(0, distributionGapPercent).toFixed(0)}%`, className: 'text-[#6B7280]' };
  const profitDistributionLoading = type === "sell" && !!selectedSaleLot && allocationMatrixQuery.isLoading;
  const profitDistributionValid = !profitDistributionLoading && (saleMemberDistribution.length === 0 || (
    saleMemberDistribution.every((member) => Number.isFinite(member.percentage) && member.percentage >= 0 && member.percentage <= 100)
    && distributionTotalPercent <= 100.001
  ));
  const cryptoCatalogQuery = trpc.searchManualStocks.useQuery(
    { query: '*', market: 'CRYPTO' },
    { enabled: open && type === 'buy' && stockMarket === 'CRYPTO', staleTime: 600_000 },
  );
  const cryptoOptions = ((cryptoCatalogQuery.data as any)?.results || []).filter((stock: any) => stock.market === 'CRYPTO' && stock.currency === 'USDT' && cryptoPortfolioBase(stock.symbol));
  const selectedCryptoBase = cryptoPortfolioBase(type === 'buy' ? selectedStock?.symbol : selectedSaleLot?.symbol);
  const cryptoSelectionQuoteQuery = useDemandCryptoQuotes(
    [selectedCryptoBase], open && !!selectedCryptoBase && (type === 'sell' || stockMarket === 'CRYPTO'),
  );
  const selectedCryptoPrice = selectedCryptoBase ? cryptoSelectionQuoteQuery.prices[selectedCryptoBase] ?? null : null;
  const shouldSearchStock = open && type === "buy" && symbolQuery.trim().length >= (stockMarket === 'A' ? 2 : 1) && !selectedStock;
  const suggestionsQuery = trpc.searchManualStocks.useQuery(
    { query: symbolQuery.trim() || 'A', market: stockMarket },
    { enabled: shouldSearchStock && stockMarket !== 'CRYPTO', staleTime: 3_000 },
  );
  // 数字币名称/代码在无价目录本地过滤，模糊命中的20个币不会产生报价租约。
  const suggestions = stockMarket === 'CRYPTO'
    ? cryptoOptions.filter((stock: any) => `${getCryptoAssetSearchText(cryptoPortfolioBase(stock.symbol) || '')} ${stock.name || ''}`.toLowerCase().includes(symbolQuery.trim().toLowerCase()))
    : ((suggestionsQuery.data as any)?.results || []);
  const searchIsFetching = stockMarket === 'CRYPTO' ? cryptoCatalogQuery.isFetching : suggestionsQuery.isFetching;
  const searchError = stockMarket === 'CRYPTO' ? cryptoCatalogQuery.error : suggestionsQuery.error;
  const searchData = stockMarket === 'CRYPTO' ? cryptoCatalogQuery.data : suggestionsQuery.data;

  const selectStock = (stock: any) => {
    setSelectedStock(stock);
    setSymbolQuery('');
    // 目录中的旧参考价不充当当前选中价；切币后先清空，再等待这个币的有效报价。
    setExecutionPrice(stock.market === 'CRYPTO' || stock.latestPrice == null ? '' : String(stock.latestPrice));
  };
  useEffect(() => {
    if (!open || type !== 'buy' || stockMarket !== 'CRYPTO' || selectedCryptoPrice === null) return;
    // 首次补价后继续续租供只读参考，不覆盖手工实际成交价。
    setExecutionPrice(previous => previous.trim() ? previous : String(selectedCryptoPrice));
  }, [open, type, stockMarket, selectedCryptoBase, selectedCryptoPrice]);

  const changeMarket = (market: PortfolioMarket) => {
    setStockMarket(market);
    setSelectedStock(null);
    setSymbolQuery('');
    setExecutionPrice('');
    setQuantity('');
    setActualTradedAt(market === 'CRYPTO' ? beijingTradeInputTime() : localInputTime());
  };

  const resetForm = () => {
    setSymbolQuery("");
    setSelectedStock(null);
    setStockMarket('A');
    setQuantity("");
    setExecutionPrice("");
    setActualTradedAt(type === 'sell' ? localInputDate() : localInputTime());
    setNote("");
    setSelectedLotId(null);
    setProfitSharePercentages({});
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    if (editingSale && type === 'sell') {
      setSelectedLotId(Number(editingSale.lotId));
      setExecutionPrice(String(editingSale.sellPrice || ''));
      setActualTradedAt(portfolioCurrency(editingSale.symbol) === 'USDT' ? beijingTradeInputTime(new Date(editingSale.soldAt)) : localInputDate(new Date(editingSale.soldAt)));
      setNote(String(editingSale.sellNote || ''));
    }
  }, [open, type, editingSale?.eventId]);

  useEffect(() => {
    if (!open || type !== "sell" || !initialLotId || editingSale) return;
    const initialLot = saleLots.find((lot: any) => lot.id === Number(initialLotId));
    if (!initialLot) return;
    if (selectedLotId === initialLot.id) return;
    setSelectedLotId(initialLot.id);
    setExecutionPrice(initialLot.marketPrice === null || initialLot.marketPrice === undefined ? '' : String(initialLot.marketPrice));
  }, [open, type, initialLotId, saleLots, editingSale, selectedLotId]);

  useEffect(() => {
    if (!open || type !== 'sell' || !selectedSaleLot) return;
    const date = editingSale ? new Date(editingSale.soldAt) : new Date();
    setActualTradedAt(selectedSaleLot.currency === 'USDT' ? beijingTradeInputTime(date) : localInputDate(date));
  }, [open, type, selectedSaleLot?.id, selectedSaleLot?.currency, editingSale?.eventId]);

  const addEventMutation = trpc.ledger.addStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success(type === "buy" ? "买入已登记并生成新持仓编号" : "卖出已登记并结清所选持仓编号");
      onOpenChange(false);
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockTagDailySnapshots.invalidate({ ledgerId: 37, categoryId });
      onSaved?.();
    },
    onError: (error) => toast.error(`登记失败：${error.message}`),
  });
  const updateSaleMutation = trpc.ledger.updateStockTagSale.useMutation({
    onSuccess: () => {
      toast.success("已卖出订单已修改并覆盖原记录");
      onOpenChange(false);
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockTagDailySnapshots.invalidate({ ledgerId: 37, categoryId });
      onSaved?.();
    },
    onError: (error) => toast.error(`修改失败：${error.message}`),
  });

  const submit = () => {
    if (readOnlyPreview) {
      toast.info("热预览仅供核对界面，不会写入正式股票账本");
      return;
    }
    if (!canWrite) return toast.error('仅管理员可登记实际买卖');
    // A/US卖出仍固定所选日期中午；数字币买卖保留完整北京时间。
    const actualDate = parseTradeInputTime(actualTradedAt, type, isCryptoTrade);
    if (Number.isNaN(actualDate.getTime())) {
      toast.error(type === 'sell' && !isCryptoTrade ? "请选择实际成交日期" : "请选择实际成交时间（北京时间）");
      return;
    }
    const price = Number(executionPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("请输入正确的实际成交价格");
      return;
    }

    if (type === "buy") {
      const buyQuantity = Number(quantity);
      if (!selectedStock || (isCryptoTrade && (selectedStock.market !== 'CRYPTO' || selectedStock.currency !== 'USDT' || parsePortfolioInstrument(selectedStock.symbol)?.market !== 'CRYPTO'))) {
        toast.error("请从检索结果中选择已核验的买卖标的");
        return;
      }
      if (!Number.isFinite(buyQuantity) || buyQuantity <= 0 || (isCryptoTrade && !isValidCryptoPortfolioQuantity(quantity))) {
        toast.error(isCryptoTrade ? "币数量最小0.00000001，最多8位小数" : "请输入正确的买入数量");
        return;
      }
      addEventMutation.mutate({
        ledgerId: 37,
        categoryId,
        eventType: "buy",
        symbol: selectedStock.symbol,
        quantity: buyQuantity,
        executionPrice: price,
        actualTradedAt: actualDate.toISOString(),
        note: note.trim() || undefined,
      });
      return;
    }

    if (!selectedSaleLot) {
      toast.error("请选择要卖出的持仓编号");
      return;
    }
    if (!profitDistributionValid) {
      toast.error(profitDistributionLoading ? "正在读取成员分配，请稍候" : `利润分配比例合计必须为100%，当前为${distributionTotalPercent.toFixed(4)}%`);
      return;
    }
    const salePayload = {
      ledgerId: 37,
      categoryId,
      executionPrice: price,
      actualTradedAt: actualDate.toISOString(),
      note: note.trim() || undefined,
      profitAllocations: saleMemberDistribution.length > 0 ? saleMemberDistribution.map((member) => ({
        userId: member.userId,
        percentage: member.percentage,
      })) : undefined,
    };
    if (editingSale) {
      updateSaleMutation.mutate({ ...salePayload, eventId: editingSale.eventId });
    } else {
      addEventMutation.mutate({ ...salePayload, eventType: "sell", lotId: selectedSaleLot.id });
    }
  };

  const dialogTitle = type === "buy" ? `买入 · ${categoryName}` : isEditingSale ? `修改已卖出订单 · ${categoryName}` : `卖出 · ${categoryName}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-1">
          {type === "buy" ? (
            <>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border border-[#D8E0E8] text-xs font-medium">
                <button type="button" onClick={() => changeMarket('A')} className={`px-3 py-2 ${stockMarket === 'A' ? 'bg-[#C62828] text-white' : 'bg-white text-gray-500'}`}>A 股 · 人民币</button>
                <button type="button" onClick={() => changeMarket('US')} className={`border-l border-[#D8E0E8] px-3 py-2 ${stockMarket === 'US' ? 'bg-[#1565C0] text-white' : 'bg-white text-gray-500'}`}>美股 · 美元</button>
                <button type="button" onClick={() => changeMarket('CRYPTO')} className={`border-l border-[#D8E0E8] px-1 py-2 ${stockMarket === 'CRYPTO' ? 'bg-[#7C3AED] text-white' : 'bg-white text-gray-500'}`}>数字币·USDT</button>
              </div>
              <div>
                <Label>{stockMarket === 'CRYPTO' ? '数字币现货代码或名称' : stockMarket === 'US' ? '美股代码或名称' : '股票代码、名称或拼音'}</Label>
                <div className="mt-1 flex min-w-0 gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input value={selectedStock ? (stockMarket === 'CRYPTO' ? cryptoPortfolioBase(selectedStock.symbol) || '' : `${selectedStock.name} ${portfolioDisplaySymbol(selectedStock.symbol)}`) : symbolQuery} onChange={(event) => { setSelectedStock(null); setExecutionPrice(''); setSymbolQuery(event.target.value); }} placeholder={stockMarket === 'CRYPTO' ? '如 BTC、ETH、比特币（仅USDT现货）' : stockMarket === 'US' ? '如 CRCL、Circle、AAPL 或 BRK.B' : '如 600519、贵州茅台或 gzm'} autoCapitalize={stockMarket === 'US' ? 'characters' : 'none'} />
                    {(searchIsFetching || (selectedCryptoBase && cryptoSelectionQuoteQuery.isFetching)) && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
                  </div>
                  {stockMarket === 'CRYPTO' && <CryptoAssetSelect aria-label="下拉选择数字币" value={selectedCryptoBase || ''}
                    includeCny={false} includeUsdt={false} options={cryptoOptions.map((stock: any) => cryptoPortfolioBase(stock.symbol)!)}
                    disabled={cryptoCatalogQuery.isFetching && cryptoOptions.length === 0}
                    placeholder={cryptoCatalogQuery.isFetching && cryptoOptions.length === 0 ? '加载中' : '下拉选择'}
                    onValueChange={base => { const stock = cryptoOptions.find((option: any) => cryptoPortfolioBase(option.symbol) === base); if (stock) selectStock(stock); }}
                    className="h-10 w-28 shrink-0 px-2" />}
                </div>
                {stockMarket === 'CRYPTO' && cryptoCatalogQuery.error && <div role="alert" className="mt-1 text-[11px] text-amber-700">币种目录暂未加载。<button type="button" className="ml-2 underline" onClick={() => { void cryptoCatalogQuery.refetch(); }}>重载下拉</button></div>}
                {selectedCryptoBase && cryptoSelectionQuoteQuery.isFetching && selectedCryptoPrice === null && <div role="status" className="mt-1 text-[11px] text-gray-500">正在读取 {selectedCryptoBase} 实时报价…</div>}
                {shouldSearchStock && searchIsFetching && <div role="status" className="mt-1 text-[11px] text-gray-500">{stockMarket === 'CRYPTO' ? '正在加载币种目录，选中后才读取报价…' : '正在搜索…'}</div>}
                {shouldSearchStock && searchError && <div role="alert" className="mt-1 flex items-center justify-between gap-2 text-[11px] text-amber-700"><span>搜索暂未完成，请重试。</span><button type="button" className="shrink-0 underline" onClick={() => { void (stockMarket === 'CRYPTO' ? cryptoCatalogQuery : suggestionsQuery).refetch(); }}>重试</button></div>}
                {shouldSearchStock && !searchIsFetching && !searchError && searchData && suggestions.length === 0 && <div role="status" className="mt-1 text-[11px] text-gray-500">{stockMarket === 'CRYPTO' ? '暂未找到匹配币种，请检查代码或稍后重试，例如 BTC、ETH。' : '暂未找到匹配标的，请检查名称或代码。'}</div>}
                {!selectedStock && shouldSearchStock && suggestions.length > 0 && <div className="mt-1 max-h-44 overflow-y-auto rounded-[3px] border border-gray-200 bg-white">{suggestions.map((stock: any) => <button key={stock.symbol} type="button" onClick={() => selectStock(stock)} className="w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-[#F4F8FF]"><span className="text-sm font-medium">{stockMarket === 'CRYPTO' ? cryptoPortfolioBase(stock.symbol) : stock.name}</span><span className="ml-2 text-xs text-gray-500">{stockMarket === 'CRYPTO' ? stock.name : portfolioDisplaySymbol(stock.symbol)}</span>{stock.market === 'US' && stock.exchange && <span className="ml-1.5 rounded bg-[#EAF2FF] px-1 py-0.5 text-[10px] font-medium text-[#1565C0]">{stock.exchange}</span>}{stockMarket !== 'CRYPTO' && stock.latestPrice ? <span className="float-right text-xs text-[#1565C0]">参考 {money(stock.latestPrice, portfolioCurrency(stock.symbol))}</span> : stock.market === 'CRYPTO' ? <span className="block text-[10px] text-gray-400">选中后读取USDT实时报价</span> : null}</button>)}</div>}
                {selectedStock && <div className="mt-1 text-[11px] text-[#1565C0]">已核验：{stockMarket === 'CRYPTO' ? cryptoPortfolioBase(selectedStock.symbol) : `${selectedStock.name} · ${portfolioDisplaySymbol(selectedStock.symbol)}`}{selectedStock.market === 'US' && selectedStock.exchange ? ` · ${selectedStock.exchange}` : ''} · {portfolioCurrency(selectedStock.symbol) === 'USDT' ? 'USDT现货计价' : selectedStock.currency === 'USD' ? '美元计价' : '人民币计价'}；登记时参考价由服务器留档。{isCryptoTrade ? selectedCryptoPrice !== null ? `当前参考 ${money(selectedCryptoPrice, 'USDT')}。` : !cryptoSelectionQuoteQuery.isFetching ? '参考价暂不可用，请填写实际成交价。' : '' : ''}</div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{tradeCurrency === 'USDT' ? '实际买入价格（USDT）' : tradeCurrency === 'USD' ? '实际买入价格（美元）' : '实际买入价格（人民币）'}</Label><Input inputMode="decimal" value={executionPrice} onChange={(event) => setExecutionPrice(event.target.value)} placeholder="0.00" className="mt-1" /></div>
                <div><Label>实际买入数量（{tradeQuantityUnit}）</Label><Input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} min={isCryptoTrade ? 0.00000001 : undefined} step={isCryptoTrade ? 0.00000001 : undefined} placeholder={isCryptoTrade ? "币数量（最多8位小数）" : "股数"} className="mt-1" /></div>
              </div>
              {tradeCurrency === 'USD' && <div className="-mt-2 text-[11px] text-[#1565C0]">美元开仓价按当前汇率折合 {tradePriceCny === null ? '—' : money(tradePriceCny, 'CNY')}（USD/CNY {usdCnyRate.toFixed(4)}）</div>}
              <div className="rounded-lg bg-[#F5F7FA] px-3 py-2 text-[11px] leading-5 text-gray-600">每次买入都会创建新的持仓编号；已有编号不能再加仓。</div>
            </>
          ) : (
            <>
              {!initialLotId && !isEditingSale && <div>
                <Label>卖出持仓编号</Label>
                <select value={selectedLotId ?? ""} onChange={(event) => { const nextLotId = Number(event.target.value) || null; setSelectedLotId(nextLotId); const lot = saleLots.find((item: any) => item.id === nextLotId); setExecutionPrice(lot?.marketPrice == null ? '' : String(lot.marketPrice)); setActualTradedAt(lot?.currency === 'USDT' ? beijingTradeInputTime() : localInputDate()); }} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-[#C62828]">
                  <option value="">请选择持仓编号</option>
                  {saleLots.map((lot: any) => <option key={lot.id} value={lot.id}>#{lot.positionNumber} · {lot.stockName} {portfolioDisplaySymbol(lot.symbol)} · {formatQuantity(lot.quantity)} {portfolioQuantityUnit(lot.symbol)}</option>)}
                </select>
              </div>}
              {portfolioQuery.isLoading && !isEditingSale && <div className="text-xs text-gray-400">正在载入可卖持仓编号…</div>}
              {selectedSaleLot && <div className="rounded-lg border border-[#F1D8D8] bg-[#FFF8F8] px-3 py-2.5 text-xs leading-5 text-gray-600">{(initialLotId || isEditingSale) && <div className="mb-0.5 text-[10px] text-gray-500">{isEditingSale ? '正在修改的已卖出订单' : '本次卖出持仓'}</div>}<div className="font-semibold text-[#333333]">{isEditingSale ? '' : `#${selectedSaleLot.positionNumber} · `}{selectedSaleLot.stockName} {portfolioDisplaySymbol(selectedSaleLot.symbol)}</div><div className="mt-1 flex justify-between gap-3"><span>买入价 {money(selectedSaleLot.unitCost, selectedSaleLot.currency)}</span><span>{isEditingSale ? '原卖出价' : '当前价'} {money(isEditingSale ? editingSale?.sellPrice : selectedCryptoBase ? selectedCryptoPrice : selectedSaleLot.marketPrice, selectedSaleLot.currency)}</span></div><div className="mt-1 font-medium text-[#C62828]">{isEditingSale ? `本单已卖出 ${formatQuantity(selectedSaleLot.quantity)} ${tradeQuantityUnit}` : `本次将卖出全部剩余 ${formatQuantity(selectedSaleLot.quantity)} ${tradeQuantityUnit}`}</div></div>}
              <div><Label>{tradeCurrency === 'USDT' ? '实际卖出价格（USDT）' : tradeCurrency === 'USD' ? '实际卖出价格（美元）' : '实际卖出价格（人民币）'}</Label><Input inputMode="decimal" value={executionPrice} onChange={(event) => setExecutionPrice(event.target.value)} placeholder="0.00" className="mt-1" /></div>
              {saleSettlementPreview && <div className="rounded-lg border border-[#F1D8D8] bg-[#FFF8F8] px-3 py-2 text-xs leading-5 text-gray-600"><div className="flex justify-between gap-3"><span>买入金额</span><span>{money(saleSettlementPreview.buyAmount, tradeCurrency)}</span></div><div className="flex justify-between gap-3"><span>买入手续费（千分之一）</span><span>−{money(saleSettlementPreview.buyFee, tradeCurrency)}</span></div><div className="mt-0.5 flex justify-between gap-3"><span>卖出金额</span><span>{money(saleSettlementPreview.sellAmount, tradeCurrency)}</span></div><div className="flex justify-between gap-3"><span>卖出手续费（千分之一）</span><span>−{money(saleSettlementPreview.sellFee, tradeCurrency)}</span></div><div className={`mt-1 flex justify-between border-t border-[#EBCFCF] pt-1 font-semibold ${saleSettlementPreview.netProfit >= 0 ? 'text-[#C62828]' : 'text-[#2E7D32]'}`}><span>账户长仓净盈亏</span><span>{saleSettlementPreview.netProfit >= 0 ? '+' : '−'}{money(Math.abs(saleSettlementPreview.netProfit), tradeCurrency)}</span></div><div className="mt-1 text-[10px] text-gray-500">买入、卖出手续费均按成交金额千分之一计算，确认后由服务器固定留档。</div></div>}
              {selectedSaleLot && <section className="rounded-lg border border-[#DDE5EA] bg-[#FAFCFD] px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#333333]">成员分配比例</span>
                  <span className="text-[10px] text-gray-400">调整后即时联动</span>
                </div>
                <div className="mt-1 text-[10px] leading-4 text-gray-500">与初始标签管理共用同一份成员持仓比例；这里调整后会同步该编号的成员数量。成员是账户长仓的对手盘，账户亏损时成员收益为正。</div>
                {profitDistributionLoading ? <div className="py-3 text-center text-[11px] text-gray-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />正在读取成员份额…</div> : saleMemberDistribution.length > 0 ? <div className="mt-2 space-y-1.5 border-t border-[#E9EFF2] pt-2">
                  {saleMemberDistribution.map((member) => {
                    const percentage = Number.isFinite(member.percentage) ? member.percentage : 0;
                    const originalPercentage = Number(selectedSaleLot.quantity || 0) > 0 ? member.quantity / Number(selectedSaleLot.quantity || 0) * 100 : 0;
                    const memberSettlement = saleSettlementPreview ? -saleSettlementPreview.netProfit * percentage / 100 : null;
                    const setPercentage = (nextValue: number) => setProfitSharePercentages((previous) => ({ ...previous, [member.key]: String(Math.max(0, Math.min(100, Number(nextValue.toFixed(4)))))}));
                    return <div key={member.key} className="rounded-md bg-white px-2 py-2" style={{ border: '1px solid #E8EEF1' }}>
                      <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-medium text-[#4B5563]">{member.name}</span><span className="shrink-0 text-[10px] text-gray-400">原分配 {originalPercentage.toFixed(2)}% · {formatQuantity(member.quantity)} {tradeQuantityUnit}</span></div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`shrink-0 whitespace-nowrap text-xs font-medium ${distributionStatus.className}`}>{distributionStatus.text}</span>
                        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                          <div className="flex h-7 w-20 shrink-0 items-center overflow-hidden rounded-[3px] border bg-white" style={{ borderColor: '#D9E8EE' }}>
                            <button type="button" onClick={() => setPercentage(percentage - 1)} aria-label={`减少${member.name}的比例`} className="flex h-full w-4 shrink-0 items-center justify-center border-r text-gray-400 hover:bg-gray-50 hover:text-gray-600" style={{ borderColor: '#D9E8EE' }}><Minus size={10} /></button>
                            <Input inputMode="decimal" value={profitSharePercentages[member.key] ?? ''} onChange={(event) => setProfitSharePercentages((previous) => ({ ...previous, [member.key]: event.target.value }))} className="h-full min-w-0 flex-1 border-0 px-0 text-center text-xs shadow-none focus-visible:ring-0" aria-label={`${member.name} 的成员分配比例`} />
                            <span className="text-[10px] text-gray-400">%</span>
                            <button type="button" onClick={() => setPercentage(percentage + 1)} aria-label={`增加${member.name}的比例`} className="flex h-full w-4 shrink-0 items-center justify-center border-l text-gray-400 hover:bg-gray-50 hover:text-gray-600" style={{ borderColor: '#D9E8EE' }}><Plus size={10} /></button>
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-400">预计收益</span>
                          <span className={`min-w-0 flex-1 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${memberSettlement === null || memberSettlement >= 0 ? 'text-[#C62828]' : 'text-[#2E7D32]'}`}>{memberSettlement === null ? '—' : `${memberSettlement >= 0 ? '+' : '−'}${money(Math.abs(memberSettlement), tradeCurrency)}`}</span>
                        </div>
                      </div>
                    </div>;
                  })}
                  <div className="flex items-center justify-between rounded-md bg-[#F8FAFB] px-2 py-1.5 text-[10px] text-gray-500"><span>账户自留（未分配部分）</span><span>{accountRetainedPercent.toFixed(0)}% · {formatQuantity(Number(selectedSaleLot.quantity || 0) * accountRetainedPercent / 100)} {tradeQuantityUnit}</span></div>
                </div> : <div className="mt-2 rounded bg-white px-2 py-2 text-[11px] text-gray-500">当前没有可编辑的账本成员；未分配数量保留在账户内。</div>}
                {!profitDistributionValid && !profitDistributionLoading && <div className="mt-2 text-[11px] text-[#C62828]">成员分配比例合计不能超过100%，请调整后再确认卖出。</div>}
              </section>}
              {tradeCurrency === 'USD' && <div className="-mt-2 text-[11px] text-[#1565C0]">美元卖出价按当前汇率折合 {tradePriceCny === null ? '—' : money(tradePriceCny, 'CNY')}（USD/CNY {usdCnyRate.toFixed(4)}）</div>}
              <div className="rounded-lg bg-[#F5F7FA] px-3 py-2 text-[11px] leading-5 text-gray-600">{isEditingSale ? '保存会直接覆盖这笔已卖出订单的价格、成交时间、备注和成员分配；不会生成新订单或作废记录。' : '卖出只能结清一个已选持仓编号的全部剩余数量，不能减仓，也不会跨编号 FIFO 扣仓。'}</div>
            </>
          )}
          {isCryptoTrade && <div className="text-[11px] text-[#7C3AED]">USDT参考人民币 {money(tradePriceCny)}（USDT/CNY {usdtCnyRate === null ? '汇率暂不可用' : usdtCnyRate.toFixed(4)}）；仅现货，不含杠杆或合约。</div>}
          <div><Label>{isCryptoTrade ? '实际成交时间（北京时间）' : type === 'sell' ? '实际成交日期' : '实际成交时间'}</Label><div className="mt-1 flex justify-end"><Input type={type === 'sell' && !isCryptoTrade ? 'date' : 'datetime-local'} value={actualTradedAt} onChange={(event) => setActualTradedAt(event.target.value)} className="w-full min-w-0 max-w-[18rem]" /></div></div>
          <div><Label>备注（可选）</Label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="可填写成交说明或补录原因" /></div>
          <div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] text-gray-600">服务器会自动记录登记时间与当时参考价；备注与本次买入或卖出一并留档。{readOnlyPreview ? " 当前为热预览，确认交易已禁用。" : ""}</div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={submit} disabled={addEventMutation.isPending || updateSaleMutation.isPending || !canWrite || (type === 'sell' && !profitDistributionValid)}>{readOnlyPreview ? "热预览不可写入" : addEventMutation.isPending || updateSaleMutation.isPending ? "保存中…" : type === "buy" ? "确认买入" : isEditingSale ? "保存修改" : "确认卖出"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
