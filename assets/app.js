const WORKER_TRIGGER_URL = 'https://github-finance-refresh.2293016313mk.workers.dev';
const fmt = (n, digits = 2) => Number.isFinite(n) ? n.toFixed(digits) : '—';
const pct = (n) => Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
const cls = (status) => ({'积极':'good','正常':'normal','谨慎':'warn','过热':'danger','恐慌':'good','极度恐惧':'good','恐惧':'good','中性':'normal','贪婪':'warn','极度贪婪':'danger','失败':'danger'}[status] || 'normal');
function card(name, value, status, time){return `<article class="metric-card"><div class="name">${name}</div><div class="value">${value}</div><span class="badge ${cls(status)}">${status}</span>${time ? `<div class="metric-time">数据时间：${time}</div>` : ''}</article>`}
function indicator(item){return `<article class="indicator"><div class="indicator-header"><div><h3>${item.name}</h3><a href="${item.url}" target="_blank" rel="noreferrer">查看来源</a></div><div class="num">${item.value}</div></div><span class="badge ${cls(item.status)}">${item.status}</span>${item.time ? `<p class="desc"><strong>数据时间：</strong>${item.time}</p>` : ''}<p class="desc">${item.explain}</p><p class="desc"><strong>建议：</strong>${item.action}</p></article>`}
async function main(){
  const res = await fetch(`data/dashboard.json?v=${Date.now()}`);
  const data = await res.json();
  const m = data.metrics;
  document.getElementById('headline-action').textContent = data.decision.action;
  document.getElementById('last-updated').textContent = `更新时间：${new Date(data.generatedAt).toLocaleString('zh-CN')}`;
  document.getElementById('summary-grid').innerHTML = [
    card('VIX 恐慌指数', fmt(m.vix.value), m.vix.status, m.vix.date),
    card('VXN 纳指波动率', fmt(m.vxn.value), m.vxn.status, m.vxn.date),
    card('Fear & Greed', fmt(m.fearGreed.value,0), m.fearGreed.status, new Date(data.generatedAt).toLocaleString('zh-CN')),
    card('QQQ 52周回撤', pct(m.qqq.drawdown52wPct), m.qqq.drawdownStatus, m.qqq.date),
    card('QQQ 历史高点回撤', pct(m.qqq.drawdownAllTimePct), m.qqq.allTimeDrawdownStatus, m.qqq.date)
  ].join('');
  document.getElementById('decision-text').textContent = data.decision.summary;
  document.getElementById('decision-reasons').innerHTML = data.decision.reasons.map(r=>`<li>${r}</li>`).join('');
  const items = [
    {name:'VIX 恐慌指数', value:fmt(m.vix.value), status:m.vix.status, time:m.vix.date, url:'https://www.cboe.com/tradable-products/vix', explain:'衡量标普500未来30天隐含波动率。>30 通常代表恐慌，<14 代表市场非常平静/乐观。', action:m.vix.action},
    {name:'VXN 纳指波动率', value:fmt(m.vxn.value), status:m.vxn.status, time:m.vxn.date, url:'https://www.cboe.com/us/indices/dashboard/VXN/', explain:'更贴近纳斯达克100的波动率指数。纳指波动通常高于标普，因此阈值可略高于 VIX。', action:m.vxn.action},
    {name:'CNN Fear & Greed', value:fmt(m.fearGreed.value,0), status:m.fearGreed.status, time:new Date(data.generatedAt).toLocaleString('zh-CN'), url:'https://www.cnn.com/markets/fear-and-greed', explain:'0-100 的市场情绪指标：0-25 极度恐惧，75-100 极度贪婪。', action:m.fearGreed.action},
    {name:'QQQ 52周回撤', value:pct(m.qqq.drawdown52wPct), status:m.qqq.drawdownStatus, time:m.qqq.date, url:'https://www.nasdaq.com/market-activity/etf/qqq', explain:`当前价 ${fmt(m.qqq.close)}，52周高点 ${fmt(m.qqq.high52w)}。用于判断短中期加仓节奏。`, action:m.qqq.drawdownAction},
    {name:'QQQ 历史高点回撤', value:pct(m.qqq.drawdownAllTimePct), status:m.qqq.allTimeDrawdownStatus, time:m.qqq.date, url:'https://www.tradingview.com/symbols/NASDAQ-QQQ/', explain:`历史高点 ${fmt(m.qqq.allTimeHigh)}。用于判断长期风险位置。`, action:m.qqq.allTimeDrawdownAction}
  ];
  document.getElementById('indicator-list').innerHTML = items.map(indicator).join('');
}
async function triggerRefresh(){
  const button = document.getElementById('refresh-button');
  const status = document.getElementById('refresh-status');
  if (!WORKER_TRIGGER_URL || WORKER_TRIGGER_URL.includes('YOUR_WORKER_SUBDOMAIN')) {
    status.textContent = '请先把 assets/app.js 里的 WORKER_TRIGGER_URL 改成你的 Cloudflare Worker 地址';
    return;
  }
  button.disabled = true;
  status.textContent = '正在触发 GitHub Actions...';
  try {
    const res = await fetch(WORKER_TRIGGER_URL, { method: 'POST' });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    status.textContent = '已触发更新，等待 1-3 分钟后刷新页面';
  } catch (err) {
    status.textContent = `触发失败：${err.message}`;
  } finally {
    button.disabled = false;
  }
}
document.getElementById('refresh-button')?.addEventListener('click', triggerRefresh);
main().catch(err=>{
  document.getElementById('headline-action').textContent='数据加载失败';
  document.getElementById('decision-text').textContent=err.message;
});
