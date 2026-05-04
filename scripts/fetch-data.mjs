import { mkdir, writeFile } from 'node:fs/promises';

const sources = {
  vixCsv: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
  vxnCsv: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VXN_History.csv',
  vixLive: 'https://cdn.cboe.com/api/global/delayed_quotes/options/_VIX.json',
  vxnLivePage: 'https://www.cnbc.com/quotes/.VXN',
  cnnFearGreed: 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
  qqqInfo: 'https://api.nasdaq.com/api/quote/QQQ/info?assetclass=etf',
  qqqSummary: 'https://api.nasdaq.com/api/quote/QQQ/summary?assetclass=etf',
  qqqHistoricalBase: 'https://api.nasdaq.com/api/quote/QQQ/historical?assetclass=etf',
  ndxInfo: 'https://api.nasdaq.com/api/quote/NDX/info?assetclass=index',
  qqqPeStockAnalysis: 'https://stockanalysis.com/etf/qqq/',
  qqqOfficial: 'https://www.invesco.com/qqq-etf/en/home.html',
  qqqMorningstar: 'https://www.morningstar.com/etfs/xnas/qqq/portfolio',
  qqqYCharts: 'https://ycharts.com/companies/QQQ/pe_ratio'
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 personal-finance-dashboard/1.0', 'accept': 'text/html,text/csv,*/*' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 personal-finance-dashboard/1.0', 'accept': 'application/json,*/*' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  return lines.map(line => {
    const cells = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
}
function moneyToNumber(value) {
  return Number(String(value ?? '').replace(/[$,%\s,]/g, ''));
}
function ymd(date) {
  return date.toISOString().slice(0, 10);
}
function mdyToDate(value) {
  const [m, d, y] = String(value).split('/').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date).replace(/\//g, '-');
}
function offsetForEastern(date) {
  const month = date.getUTCMonth() + 1;
  return month >= 3 && month <= 11 ? '-04:00' : '-05:00';
}
function parseMarketDate(raw, defaultZone = 'America/New_York') {
  if (!raw) return new Date();
  const text = String(raw).trim();
  let normalized = text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const hasExplicitZone = /([+-]\d{2}:?\d{2}|Z)$/i.test(normalized);
  let date = hasExplicitZone ? new Date(normalized) : new Date(NaN);
  if (Number.isFinite(date.getTime())) return date;

  const isoNoZone = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (isoNoZone) {
    const temp = new Date(`${isoNoZone[1]}T${isoNoZone[2]}Z`);
    // CBOE timestamps like 2026-05-04T13:53:16 are UTC-like in this feed.
    // Treat no-zone ISO timestamps as UTC to avoid shifting them back twice.
    const offset = 'Z';
    date = new Date(`${isoNoZone[1]}T${isoNoZone[2]}${offset}`);
    if (Number.isFinite(date.getTime())) return date;
  }

  const us = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+(ET|EDT|EST)$/i);
  if (us) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    let hour = Number(us[4]);
    if (us[6].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (us[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
    const base = new Date(Date.UTC(Number(us[3]), months[us[1].slice(0,3).toLowerCase()], Number(us[2]), hour, Number(us[5]), 0));
    const zone = us[7].toUpperCase() === 'EST' ? '-05:00' : us[7].toUpperCase() === 'EDT' ? '-04:00' : offsetForEastern(base);
    date = new Date(`${us[3]}-${String(months[us[1].slice(0,3).toLowerCase()] + 1).padStart(2,'0')}-${String(us[2]).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${us[5]}:00${zone}`);
    if (Number.isFinite(date.getTime())) return date;
  }
  return new Date();
}
function withTimes(raw, defaultZone = 'America/New_York') {
  const date = parseMarketDate(raw, defaultZone);
  return {
    raw: String(raw || ''),
    iso: date.toISOString(),
    usPacific: formatInZone(date, 'America/Los_Angeles'),
    china: formatInZone(date, 'Asia/Shanghai')
  };
}
function lastCboeClose(rows) {
  const row = rows.at(-1);
  const key = ['CLOSE','Close','close'].find(k => row[k] != null) || Object.keys(row).at(-1);
  const rawDate = row.DATE || row.Date || row.date;
  return { value: Number(row[key]), time: withTimes(`${rawDate} 16:00:00`, 'America/New_York') };
}
async function getCnbcQuote(url) {
  const html = await fetchText(url);
  const priceMatch = html.match(/"price"\s*:\s*"?([0-9.]+)/) || html.match(/QuoteStrip-lastPrice">([0-9.]+)/);
  const timeMatch = html.match(/"last_time"\s*:\s*"([^"]+)/) || html.match(/"lastTradeTime"\s*:\s*"([^"]+)/);
  const value = Number(priceMatch?.[1]);
  if (!Number.isFinite(value)) throw new Error(`CNBC quote missing price: ${url}`);
  return { value, time: withTimes(timeMatch?.[1] || new Date().toISOString(), 'America/New_York') };
}
async function getCboeLiveQuote(url) {
  const json = await fetchJson(url);
  const data = json?.data;
  const value = Number(data?.current_price ?? data?.close);
  if (!Number.isFinite(value)) throw new Error(`CBOE live quote missing current_price: ${url}`);
  const rawTime = data?.last_trade_time || json?.timestamp || new Date().toISOString();
  return { value, time: withTimes(rawTime, 'UTC') };
}
function classifyVix(value) {
  if (!Number.isFinite(value)) return ['失败', '数据源暂不可用，操作前请手动交叉验证。'];
  if (value > 30) return ['恐慌', '恐慌区间，可考虑按计划加仓，但仍需分批。'];
  if (value < 14) return ['过热', '市场过于平静，避免追涨；若 Fear & Greed >80，只维持低速定投。'];
  if (value >= 20) return ['谨慎', '波动升高，保持纪律，观察是否出现更好加仓点。'];
  return ['正常', '正常波动区间，按计划定投。'];
}
function classifyVxn(value) {
  if (!Number.isFinite(value)) return ['失败', '数据源暂不可用，操作前请手动交叉验证。'];
  if (value > 35) return ['恐慌', '纳指波动明显升高，可重点关注分批加仓。'];
  if (value < 18) return ['过热', '纳指波动较低，不宜额外追涨。'];
  if (value >= 25) return ['谨慎', '纳指波动偏高，按计划分批，不要一次性重仓。'];
  return ['正常', '纳指波动正常，按计划定投。'];
}
function classifyFearGreed(value) {
  if (!Number.isFinite(value)) return ['失败', '数据源暂不可用，操作前请手动交叉验证。'];
  if (value <= 25) return ['极度恐惧', '适合关注加仓信号。'];
  if (value <= 45) return ['恐惧', '可正常或略加定投。'];
  if (value <= 55) return ['中性', '正常定投。'];
  if (value <= 75) return ['贪婪', '正常定投即可，不额外追涨。'];
  return ['极度贪婪', '避免追涨，考虑降低新增资金速度。'];
}
function drawdownAction(dd) {
  const d = Math.abs(dd);
  if (!Number.isFinite(d)) return ['失败', '数据源暂不可用。'];
  if (d < 5) return ['正常', '正常定投。'];
  if (d < 10) return ['积极', '定投金额 × 1.5。'];
  if (d < 15) return ['积极', '定投金额 × 2。'];
  if (d < 20) return ['恐慌', '额外加仓备用资金 25%。'];
  if (d < 30) return ['恐慌', '再加备用资金 25%-35%。'];
  return ['恐慌', '分批投入剩余备用资金，避免一天打完。'];
}
function latestFearGreed(json) {
  const candidates = [json?.fear_and_greed?.score, json?.fear_and_greed?.score?.value, json?.data?.[0]?.y, json?.data?.at?.(-1)?.y];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  if (Array.isArray(json?.fear_and_greed_historical?.data)) {
    const n = Number(json.fear_and_greed_historical.data.at(-1)?.y);
    if (Number.isFinite(n)) return n;
  }
  throw new Error('CNN Fear & Greed response shape changed');
}
function classifyPe(value) {
  if (!Number.isFinite(value)) return ['失败', '估值数据暂不可用。'];
  if (value >= 38) return ['过热', 'TTM PE 接近/进入历史极高估区，避免追涨，优先等待盈利消化或回撤。'];
  if (value >= 34) return ['谨慎', 'TTM PE 偏高，新增资金建议放慢，重点关注前瞻 PE 和盈利增速。'];
  if (value >= 28) return ['正常', 'TTM PE 略高于常见中枢，维持纪律定投，不额外追涨。'];
  return ['积极', 'TTM PE 接近或低于常见中枢，可结合回撤规则提高定投。'];
}
function estimatePePercentile(pe) {
  if (!Number.isFinite(pe)) return null;
  const anchors = [[20,10],[24,25],[28,50],[32,68],[35,80],[38,90],[42,96]];
  if (pe <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (pe <= x1) return Math.round(y0 + (pe - x0) * (y1 - y0) / (x1 - x0));
  }
  return 98;
}
async function getQqqPe() {
  const sourcesOut = [
    { name: 'StockAnalysis QQQ', url: sources.qqqPeStockAnalysis, metric: 'PE Ratio', type: 'TTM / trailing，非前瞻', automated: true },
    { name: 'Invesco QQQ official', url: sources.qqqOfficial, metric: 'Portfolio valuation / factsheet', type: '官方组合口径，需人工交叉验证', automated: false },
    { name: 'Morningstar QQQ Portfolio', url: sources.qqqMorningstar, metric: 'Portfolio PE / forward metrics', type: '可能含前瞻估值，免费抓取不稳定', automated: false },
    { name: 'YCharts / Koyfin 等', url: sources.qqqYCharts, metric: 'PE / forward PE history', type: '付费/半付费，更适合精确历史分位', automated: false }
  ];
  let primary = null;
  try {
    const html = await fetchText(sources.qqqPeStockAnalysis);
    const match = html.match(/PE Ratio<\/td><td[^>]*>([0-9.]+)/) || html.match(/PE Ratio[\s\S]{0,300}?>([0-9]+\.[0-9]+)<\/td>/);
    const pageTime = html.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s+[AP]M\s+EDT)/);
    const value = Number(match?.[1]);
    if (Number.isFinite(value)) {
      primary = {
        value,
        source: 'StockAnalysis QQQ',
        type: 'TTM / trailing，非前瞻',
        forwardLooking: false,
        time: withTimes(pageTime?.[1] || new Date().toISOString(), 'America/New_York')
      };
      sourcesOut[0].value = value;
      sourcesOut[0].status = '自动抓取成功';
    }
  } catch (err) {
    sourcesOut[0].status = `自动抓取失败：${err.message}`;
  }
  const percentile = estimatePePercentile(primary?.value);
  const [status, action] = classifyPe(primary?.value);
  return {
    primary,
    percentileEstimate: percentile,
    percentileMethod: '估算分位：使用常见纳指/QQQ TTM PE 阈值锚点插值（20≈10%、28≈50%、35≈80%、38≈90%、42≈96%），不是官方精确历史序列。若需要精确历史百分位，建议接 YCharts/Koyfin/FactSet/Wind 等付费历史数据。',
    status,
    action,
    sources: sourcesOut
  };
}
async function getQQQ() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear() - 10, now.getUTCMonth(), now.getUTCDate()));
  const histUrl = `${sources.qqqHistoricalBase}&fromdate=${ymd(from)}&todate=${ymd(now)}&limit=9999`;
  const [info, summary, hist] = await Promise.all([fetchJson(sources.qqqInfo), fetchJson(sources.qqqSummary), fetchJson(histUrl)]);
  const rows = (hist?.data?.tradesTable?.rows || []).map(r => ({
    date: mdyToDate(r.date),
    close: moneyToNumber(r.close),
    high: moneyToNumber(r.high)
  })).filter(r => Number.isFinite(r.close) && Number.isFinite(r.high)).sort((a, b) => a.date - b.date);
  if (!rows.length) throw new Error('Nasdaq historical API returned no usable QQQ rows');
  const latestHist = rows.at(-1);
  const primary = info?.data?.primaryData || {};
  const close = moneyToNumber(primary.lastSalePrice);
  const liveClose = Number.isFinite(close) ? close : latestHist.close;
  const allTimeHigh = Math.max(...rows.map(r => r.high), liveClose);
  const cutoff = new Date(latestHist.date); cutoff.setDate(cutoff.getDate() - 365);
  const rows52 = rows.filter(r => r.date >= cutoff);
  const high52w = Math.max(...rows52.map(r => r.high), liveClose);
  const drawdown52wPct = (liveClose / high52w - 1) * 100;
  const drawdownAllTimePct = (liveClose / allTimeHigh - 1) * 100;
  const [drawdownStatus, drawdownActionText] = drawdownAction(drawdown52wPct);
  const [allTimeDrawdownStatus, allTimeDrawdownAction] = drawdownAction(drawdownAllTimePct);
  const liveTimestamp = primary.lastTradeTimestamp;
  return {
    close: liveClose,
    netChange: moneyToNumber(primary.netChange),
    percentageChange: moneyToNumber(primary.percentageChange),
    deltaIndicator: primary.deltaIndicator,
    bid: moneyToNumber(primary.bidPrice),
    ask: moneyToNumber(primary.askPrice),
    volume: moneyToNumber(primary.volume),
    previousClose: moneyToNumber(summary?.data?.summaryData?.PreviousClose?.value),
    dayRange: summary?.data?.summaryData?.TodayHighLow?.value,
    time: withTimes(liveTimestamp || ymd(latestHist.date), 'America/New_York'),
    high52w, allTimeHigh, drawdown52wPct, drawdownAllTimePct,
    drawdownStatus, drawdownAction: drawdownActionText, allTimeDrawdownStatus, allTimeDrawdownAction
  };
}
async function getNDX() {
  const info = await fetchJson(sources.ndxInfo);
  const primary = info?.data?.primaryData || {};
  const keyStats = info?.data?.keyStats || {};
  return {
    value: moneyToNumber(primary.lastSalePrice),
    netChange: moneyToNumber(primary.netChange),
    percentageChange: moneyToNumber(primary.percentageChange),
    deltaIndicator: primary.deltaIndicator,
    previousClose: moneyToNumber(keyStats.previousclose?.value),
    dayRange: keyStats.dayrange?.value,
    time: withTimes(primary.lastTradeTimestamp || new Date().toISOString(), 'America/New_York')
  };
}
function buildDecision(metrics) {
  const reasons = [];
  const { vix, vxn, fearGreed, qqq, valuation } = metrics;
  const overheating = vix.value < 14 && fearGreed.value > 80;
  const panic = vix.value > 30 || vxn.value > 35 || fearGreed.value <= 25 || Math.abs(qqq.drawdown52wPct) >= 15;
  if (overheating) reasons.push('VIX < 14 且 Fear & Greed > 80，触发过热减速规则。');
  if (panic) reasons.push('至少一个恐慌/深度回撤信号出现，可按计划分批加仓。');
  reasons.push(`QQQ 当前价 ${qqq.close.toFixed(2)}，52周回撤 ${qqq.drawdown52wPct.toFixed(2)}%，对应动作：${qqq.drawdownAction}`);
  reasons.push(`VIX ${vix.value.toFixed(2)}：${vix.action}`);
  reasons.push(`Fear & Greed ${fearGreed.value.toFixed(0)}：${fearGreed.action}`);
  if (valuation?.primary?.value) reasons.push(`QQQ PE ${valuation.primary.value.toFixed(2)}（${valuation.primary.type}），估算历史分位 ${valuation.percentileEstimate}%：${valuation.action}`);
  if (overheating) return { action: '过热减速', summary: '当前满足过热组合信号：不追加，只维持低速定投；如仓位超标，再考虑再平衡。', reasons };
  if (panic) return { action: '按规则加仓', summary: '市场出现恐慌或明显回撤信号，可以按你的加仓表分批执行，避免一次性打满。', reasons };
  if (fearGreed.value > 75 || vix.value < 14 || valuation?.status === '谨慎' || valuation?.status === '过热') return { action: '谨慎定投', summary: '市场情绪或估值偏热，维持常规定投即可，不做额外追涨。', reasons };
  return { action: '正常定投', summary: '当前未触发明显恐慌或过热组合信号，按既定月定投计划执行。', reasons };
}
async function main() {
  const generatedAt = new Date();
  const [vixRows, vxnRows, vixLiveResult, vxnLiveResult, fearJson, qqq, ndx, valuation] = await Promise.all([
    fetchText(sources.vixCsv).then(parseCsv),
    fetchText(sources.vxnCsv).then(parseCsv),
    getCboeLiveQuote(sources.vixLive).catch(err => { console.warn(`VIX live quote failed, fallback to daily close: ${err.message}`); return null; }),
    getCnbcQuote(sources.vxnLivePage).catch(err => { console.warn(`VXN live quote failed, fallback to daily close: ${err.message}`); return null; }),
    fetchJson(sources.cnnFearGreed),
    getQQQ(),
    getNDX(),
    getQqqPe()
  ]);
  const vixLatest = vixLiveResult || lastCboeClose(vixRows);
  const vxnLatest = vxnLiveResult || lastCboeClose(vxnRows);
  const fearValue = latestFearGreed(fearJson);
  const [vixStatus, vixAction] = classifyVix(vixLatest.value);
  const [vxnStatus, vxnAction] = classifyVxn(vxnLatest.value);
  const [fgStatus, fgAction] = classifyFearGreed(fearValue);
  const metrics = {
    vix: { ...vixLatest, status: vixStatus, action: vixAction },
    vxn: { ...vxnLatest, status: vxnStatus, action: vxnAction },
    fearGreed: { value: fearValue, time: withTimes(generatedAt.toISOString(), 'UTC'), status: fgStatus, action: fgAction },
    qqq,
    ndx,
    valuation
  };
  const payload = { generatedAt: generatedAt.toISOString(), generatedTime: withTimes(generatedAt.toISOString(), 'UTC'), sources, metrics, decision: buildDecision(metrics) };
  await mkdir('data', { recursive: true });
  await writeFile('data/dashboard.json', JSON.stringify(payload, null, 2));
  console.log(`dashboard data updated: ${payload.decision.action}`);
}
main().catch(err => { console.error(err); process.exit(1); });
