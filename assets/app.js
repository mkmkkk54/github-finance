const fmt = (n, digits = 2) => Number.isFinite(n) ? n.toFixed(digits) : '—';
const pct = (n) => Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
const signed = (n, digits = 2) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(digits)}` : '—';
const cls = (status) => ({'积极':'good','正常':'normal','谨慎':'warn','过热':'danger','恐慌':'good','极度恐惧':'good','恐惧':'good','中性':'normal','贪婪':'warn','极度贪婪':'danger','失败':'danger'}[status] || 'normal');
const timeText = (time) => time ? `美东：${time.usEastern}<br>中国：${time.china}` : '';
function card(name, value, status, time, extra = ''){return `<article class="metric-card"><div class="name">${name}</div><div class="value">${value}</div>${extra ? `<div class="metric-extra">${extra}</div>` : ''}<span class="badge ${cls(status)}">${status}</span>${time ? `<div class="metric-time">${timeText(time)}</div>` : ''}</article>`}
function indicator(item){return `<article class="indicator"><div class="indicator-header"><div><h3>${item.name}</h3><a href="${item.url}" target="_blank" rel="noreferrer">查看来源</a></div><div class="num">${item.value}</div></div><span class="badge ${cls(item.status)}">${item.status}</span>${item.time ? `<p class="desc"><strong>数据时间：</strong><br>${timeText(item.time)}</p>` : ''}${item.details ? `<div class="detail-grid">${item.details.map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>` : ''}<p class="desc">${item.explain}</p><p class="desc"><strong>建议：</strong>${item.action}</p></article>`}
function valuationPanel(v){
  if (!v) return '';
  const primary = v.primary;
  const sources = (v.sources || []).map(s => `<tr><td><a href="${s.url}" target="_blank" rel="noreferrer">${s.name}</a></td><td>${s.metric}</td><td>${s.value ? fmt(s.value) : '—'}</td><td>${s.type}</td><td>${s.automated ? (s.status || '自动') : '需人工/付费交叉验证'}</td></tr>`).join('');
  return `<section class="panel"><div class="section-title"><div><h2>纳斯达克 / QQQ 估值</h2><p>PE 口径差异很大：TTM/Trailing 是过去盈利，不带预测；Forward PE 是未来预期盈利，带预测且依赖分析师一致预期。</p></div></div><div class="valuation-grid"><div class="valuation-main"><span class="label">主指标：QQQ PE</span><strong>${primary?.value ? fmt(primary.value) : '—'}</strong><span class="badge ${cls(v.status)}">${v.status}</span><p>${primary?.type || '—'}；${primary?.forwardLooking ? '带预测前瞻性' : '不带预测前瞻性'}</p>${primary?.time ? `<p class="desc"><strong>数据时间：</strong><br>${timeText(primary.time)}</p>` : ''}</div><div class="valuation-main"><span class="label">估算历史百分位</span><strong>${v.percentileEstimate ?? '—'}%</strong><p>${v.percentileMethod}</p></div></div><h3 class="subheading">数据来源对比</h3><div class="table-wrap"><table><thead><tr><th>来源</th><th>指标</th><th>数值</th><th>口径</th><th>状态</th></tr></thead><tbody>${sources}</tbody></table></div></section>`;
}
async function main(){
  const res = await fetch(`data/dashboard.json?v=${Date.now()}`);
  const data = await res.json();
  const m = data.metrics;
  document.getElementById('headline-action').textContent = data.decision.action;
  document.getElementById('last-updated').innerHTML = `页面生成<br>美东：${data.generatedTime?.usEastern || '—'}<br>中国：${data.generatedTime?.china || new Date(data.generatedAt).toLocaleString('zh-CN')}`;
  document.getElementById('summary-grid').innerHTML = [
    card('VIX 恐慌指数', fmt(m.vix.value), m.vix.status, m.vix.time),
    card('VXN 纳指波动率', fmt(m.vxn.value), m.vxn.status, m.vxn.time),
    card('Fear & Greed', fmt(m.fearGreed.value,0), m.fearGreed.status, m.fearGreed.time),
    card('QQQ 当前价', fmt(m.qqq.close), m.qqq.drawdownStatus, m.qqq.time, `${signed(m.qqq.netChange)} / ${signed(m.qqq.percentageChange)}%`),
    card('纳斯达克100 NDX', fmt(m.ndx.value), m.ndx.deltaIndicator === 'up' ? '积极' : '正常', m.ndx.time, `${signed(m.ndx.netChange)} / ${signed(m.ndx.percentageChange)}%`),
    card('QQQ 52周回撤', pct(m.qqq.drawdown52wPct), m.qqq.drawdownStatus, m.qqq.time),
    card('QQQ 历史高点回撤', pct(m.qqq.drawdownAllTimePct), m.qqq.allTimeDrawdownStatus, m.qqq.time),
    card('QQQ PE', m.valuation?.primary?.value ? fmt(m.valuation.primary.value) : '—', m.valuation?.status || '正常', m.valuation?.primary?.time, `估算分位 ${m.valuation?.percentileEstimate ?? '—'}%`)
  ].join('');
  document.getElementById('decision-text').textContent = data.decision.summary;
  document.getElementById('decision-reasons').innerHTML = data.decision.reasons.map(r=>`<li>${r}</li>`).join('');
  const items = [
    {name:'VIX 恐慌指数', value:fmt(m.vix.value), status:m.vix.status, time:m.vix.time, url:'https://www.cboe.com/tradable-products/vix', explain:'衡量标普500未来30天隐含波动率。>30 通常代表恐慌，<14 代表市场非常平静/乐观。', action:m.vix.action},
    {name:'VXN 纳指波动率', value:fmt(m.vxn.value), status:m.vxn.status, time:m.vxn.time, url:'https://www.cnbc.com/quotes/.VXN', explain:'更贴近纳斯达克100的波动率指数。纳指波动通常高于标普，因此阈值可略高于 VIX。', action:m.vxn.action},
    {name:'CNN Fear & Greed', value:fmt(m.fearGreed.value,0), status:m.fearGreed.status, time:m.fearGreed.time, url:'https://www.cnn.com/markets/fear-and-greed', explain:'0-100 的市场情绪指标：0-25 极度恐惧，75-100 极度贪婪。', action:m.fearGreed.action},
    {name:'QQQ 当前价格', value:fmt(m.qqq.close), status:m.qqq.drawdownStatus, time:m.qqq.time, url:'https://www.nasdaq.com/market-activity/etf/qqq', explain:`当前价 ${fmt(m.qqq.close)}，涨跌 ${signed(m.qqq.netChange)} / ${signed(m.qqq.percentageChange)}%。52周高点 ${fmt(m.qqq.high52w)}。`, action:m.qqq.drawdownAction, details:[['买一/卖一', `${fmt(m.qqq.bid)} / ${fmt(m.qqq.ask)}`], ['成交量', fmt(m.qqq.volume,0)], ['前收', fmt(m.qqq.previousClose)], ['日内区间', m.qqq.dayRange || '—']]},
    {name:'纳斯达克100指数 NDX', value:fmt(m.ndx.value), status:m.ndx.deltaIndicator === 'up' ? '积极' : '正常', time:m.ndx.time, url:'https://www.nasdaq.com/market-activity/index/ndx', explain:`当前点位 ${fmt(m.ndx.value)}，涨跌 ${signed(m.ndx.netChange)} / ${signed(m.ndx.percentageChange)}%。`, action:'用于确认纳指本身走势，和 QQQ ETF 价格互相校验。', details:[['前收', fmt(m.ndx.previousClose)], ['日内区间', m.ndx.dayRange || '—']]},
    {name:'QQQ 52周回撤', value:pct(m.qqq.drawdown52wPct), status:m.qqq.drawdownStatus, time:m.qqq.time, url:'https://www.tradingview.com/symbols/NASDAQ-QQQ/', explain:`52周高点 ${fmt(m.qqq.high52w)}。用于判断短中期加仓节奏。`, action:m.qqq.drawdownAction},
    {name:'QQQ 历史高点回撤', value:pct(m.qqq.drawdownAllTimePct), status:m.qqq.allTimeDrawdownStatus, time:m.qqq.time, url:'https://www.tradingview.com/symbols/NASDAQ-QQQ/', explain:`历史高点 ${fmt(m.qqq.allTimeHigh)}。用于判断长期风险位置。`, action:m.qqq.allTimeDrawdownAction}
  ];
  document.getElementById('indicator-list').innerHTML = items.map(indicator).join('');
  document.getElementById('valuation-panel').innerHTML = valuationPanel(m.valuation);
}
main().catch(err=>{
  document.getElementById('headline-action').textContent='数据加载失败';
  document.getElementById('decision-text').textContent=err.message;
});
