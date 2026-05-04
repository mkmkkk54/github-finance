import { mkdir, writeFile } from 'node:fs/promises';

const sources = {
  vixCsv: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
  vxnCsv: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VXN_History.csv',
  cnnFearGreed: 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
  qqqInfo: 'https://api.nasdaq.com/api/quote/QQQ/info?assetclass=etf',
  qqqHistoricalBase: 'https://api.nasdaq.com/api/quote/QQQ/historical?assetclass=etf'
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'personal-finance-dashboard/1.0' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 personal-finance-dashboard/1.0' } });
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
function lastCboeClose(rows) {
  const row = rows.at(-1);
  const key = ['CLOSE','Close','close'].find(k => row[k] != null) || Object.keys(row).at(-1);
  return { value: Number(row[key]), date: row.DATE || row.Date || row.date };
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
async function getQQQ() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear() - 10, now.getUTCMonth(), now.getUTCDate()));
  const histUrl = `${sources.qqqHistoricalBase}&fromdate=${ymd(from)}&todate=${ymd(now)}&limit=9999`;
  const [info, hist] = await Promise.all([fetchJson(sources.qqqInfo), fetchJson(histUrl)]);
  const rows = (hist?.data?.tradesTable?.rows || []).map(r => ({
    date: mdyToDate(r.date),
    close: moneyToNumber(r.close),
    high: moneyToNumber(r.high)
  })).filter(r => Number.isFinite(r.close) && Number.isFinite(r.high)).sort((a, b) => a.date - b.date);
  if (!rows.length) throw new Error('Nasdaq historical API returned no usable QQQ rows');
  const latestHist = rows.at(-1);
  const liveClose = moneyToNumber(info?.data?.primaryData?.lastSalePrice);
  const close = Number.isFinite(liveClose) ? liveClose : latestHist.close;
  const allTimeHigh = Math.max(...rows.map(r => r.high), close);
  const cutoff = new Date(latestHist.date); cutoff.setDate(cutoff.getDate() - 365);
  const rows52 = rows.filter(r => r.date >= cutoff);
  const high52w = Math.max(...rows52.map(r => r.high), close);
  const drawdown52wPct = (close / high52w - 1) * 100;
  const drawdownAllTimePct = (close / allTimeHigh - 1) * 100;
  const [drawdownStatus, drawdownActionText] = drawdownAction(drawdown52wPct);
  const [allTimeDrawdownStatus, allTimeDrawdownAction] = drawdownAction(drawdownAllTimePct);
  return { close, date: ymd(latestHist.date), high52w, allTimeHigh, drawdown52wPct, drawdownAllTimePct, drawdownStatus, drawdownAction: drawdownActionText, allTimeDrawdownStatus, allTimeDrawdownAction };
}
function buildDecision(metrics) {
  const reasons = [];
  const { vix, vxn, fearGreed, qqq } = metrics;
  const overheating = vix.value < 14 && fearGreed.value > 80;
  const panic = vix.value > 30 || vxn.value > 35 || fearGreed.value <= 25 || Math.abs(qqq.drawdown52wPct) >= 15;
  if (overheating) reasons.push('VIX < 14 且 Fear & Greed > 80，触发过热减速规则。');
  if (panic) reasons.push('至少一个恐慌/深度回撤信号出现，可按计划分批加仓。');
  reasons.push(`QQQ 52周回撤 ${qqq.drawdown52wPct.toFixed(2)}%，对应动作：${qqq.drawdownAction}`);
  reasons.push(`VIX ${vix.value.toFixed(2)}：${vix.action}`);
  reasons.push(`Fear & Greed ${fearGreed.value.toFixed(0)}：${fearGreed.action}`);
  if (overheating) return { action: '过热减速', summary: '当前满足过热组合信号：不追加，只维持低速定投；如仓位超标，再考虑再平衡。', reasons };
  if (panic) return { action: '按规则加仓', summary: '市场出现恐慌或明显回撤信号，可以按你的加仓表分批执行，避免一次性打满。', reasons };
  if (fearGreed.value > 75 || vix.value < 14) return { action: '谨慎定投', summary: '市场情绪偏热或波动偏低，维持常规定投即可，不做额外追涨。', reasons };
  return { action: '正常定投', summary: '当前未触发明显恐慌或过热组合信号，按既定月定投计划执行。', reasons };
}
async function main() {
  const [vixRows, vxnRows, fearJson, qqq] = await Promise.all([
    fetchText(sources.vixCsv).then(parseCsv),
    fetchText(sources.vxnCsv).then(parseCsv),
    fetchJson(sources.cnnFearGreed),
    getQQQ()
  ]);
  const vixLatest = lastCboeClose(vixRows);
  const vxnLatest = lastCboeClose(vxnRows);
  const fearValue = latestFearGreed(fearJson);
  const [vixStatus, vixAction] = classifyVix(vixLatest.value);
  const [vxnStatus, vxnAction] = classifyVxn(vxnLatest.value);
  const [fgStatus, fgAction] = classifyFearGreed(fearValue);
  const metrics = {
    vix: { ...vixLatest, status: vixStatus, action: vixAction },
    vxn: { ...vxnLatest, status: vxnStatus, action: vxnAction },
    fearGreed: { value: fearValue, status: fgStatus, action: fgAction },
    qqq
  };
  const payload = { generatedAt: new Date().toISOString(), sources, metrics, decision: buildDecision(metrics) };
  await mkdir('data', { recursive: true });
  await writeFile('data/dashboard.json', JSON.stringify(payload, null, 2));
  console.log(`dashboard data updated: ${payload.decision.action}`);
}
main().catch(err => { console.error(err); process.exit(1); });
