import Plotly from 'plotly.js-dist-min';
import './style.css';

const regions = {
  '北海道':['北海道'], '東北':['青森','岩手','宮城','秋田','山形','福島'],
  '関東':['茨城','栃木','群馬','埼玉','千葉','東京','神奈川'],
  '中部':['新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知'],
  '近畿':['三重','滋賀','京都','大阪','兵庫','奈良','和歌山'],
  '中国':['鳥取','島根','岡山','広島','山口'],
  '四国':['徳島','香川','愛媛','高知'],
  '九州・沖縄':['福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄']
};
const regionNames = Object.keys(regions);
const regionOf = Object.fromEntries(Object.entries(regions).flatMap(([r,names])=>names.map(n=>[n,r])));
const palette = ['#2563eb','#0d9488','#f59e0b','#8b5cf6','#ec4899','#84cc16','#ef4444','#06b6d4'];
const colRegion = Object.fromEntries(regionNames.map((r,i)=>[r,palette[i]]));
const ACCENT = '#2563eb', MUTED = '#94a3b8', NEG = '#f43f5e', POS = '#10b981', ORANGE = '#f59e0b', SOFT = '#cbd5e1';

const HEAT = [[0,'#f1f5f9'],[.2,'#bfdbfe'],[.5,'#38bdf8'],[.75,'#2563eb'],[1,'#1e1b4b']];
const txt = n => Number(n).toLocaleString('ja-JP');
const pct = (n,d=1) => Number.isFinite(n) ? (n*100).toFixed(d)+'%' : '—';
const average = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const signed = (n,d=1) => (n>0?'+':'')+n.toFixed(d);

let years=[], prefectures=[], others={}, totals={}, chosenYear='all', metric='count', tab='overview', regionSel='東北', yearA=null, yearB=null;
let selected=['福島','宮城','茨城','東京'];
let currentRanking=[];

// ---- CSV ----
function parseCSV(raw){
  const rows=[];let row=[],cell='',quoted=false;
  raw=raw.replace(/^﻿/,'');
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(c==='"'){if(quoted&&raw[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell.trim());cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(cell.trim());if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell.length||row.length){row.push(cell.trim());rows.push(row);}
  const header=rows.shift();
  if(!header.includes('都道府県'))throw new Error('「都道府県」列がありません。');
  const yr=header.filter(s=>/^20\d{2}年度$/.test(s)).map(s=>parseInt(s)).sort((a,b)=>a-b);
  if(yr.length<2)throw new Error('年度列が2列以上必要です。');
  const idx=Object.fromEntries(header.map((h,i)=>[h,i]));
  const data=rows.map(r=>({name:r[idx['都道府県']],vals:Object.fromEntries(yr.map(y=>{
    const n=Number((r[idx[y+'年度']]||'').replace(/,/g,''));
    if(!Number.isInteger(n)||n<0)throw new Error(`${r[idx['都道府県']]}の${y}年度の値が不正です。`);
    return [y,n];
  }))}));
  const prefs=data.filter(d=>regionOf[d.name]);
  if(prefs.length!==47||new Set(prefs.map(d=>d.name)).size!==47)throw new Error('47都道府県の行が必要です。');
  const extra=data.find(d=>d.name==='その他');
  if(!extra)throw new Error('「その他」の行がありません。');
  // 合計は「合計」行ではなく、内訳（47都道府県＋その他）の再計算値を正とする
  const tot=Object.fromEntries(yr.map(y=>[y,prefs.reduce((s,d)=>s+d.vals[y],extra.vals[y])]));
  return {years:yr,prefs,extra,totals:tot};
}

// ---- 指標 ----
const totalPref = d => years.reduce((a,y)=>a+d.vals[y],0);
const v = (d,y) => y==='all' ? totalPref(d) : d.vals[y];
const grandTotal = () => years.reduce((a,y)=>a+totals[y],0);
const sumOf = (items,y) => items.reduce((a,d)=>a+v(d,y),0);
const inRegion = r => prefectures.filter(d=>regionOf[d.name]===r);
const fuku = () => prefectures.find(d=>d.name==='福島');
const prefTotalOf = y => sumOf(prefectures,y);
const unit = () => metric==='share' ? '%' : '人';

function diversity(y){
  const total=prefTotalOf(y);
  if(!total)return {eff:0,active:0};
  const ps=prefectures.map(d=>v(d,y)/total);
  return {eff:Math.exp(-ps.reduce((s,p)=>s+(p?p*Math.log(p):0),0)), active:prefectures.filter(d=>v(d,y)>0).length};
}
function slope(d){
  const xs=years.map((_,i)=>i), mx=average(xs), ys=years.map(y=>d.vals[y]), my=average(ys);
  return xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0);
}
function stats(){
  const n=Math.min(3,Math.floor(years.length/2));
  return prefectures.map(d=>{
    const vals=years.map(y=>d.vals[y]), mean=average(vals), total=totalPref(d);
    const early=average(years.slice(0,n).map(y=>d.vals[y])), late=average(years.slice(-n).map(y=>d.vals[y]));
    const sd=Math.sqrt(average(vals.map(x=>(x-mean)**2)));
    return {name:d.name,region:regionOf[d.name],total,share:total/grandTotal(),early,late,change:late-early,trend:slope(d),cv:mean?sd/mean:null};
  });
}

// ---- 追加の指標 ----
const Y = () => years.map(String);
const seriesTotal = () => years.map(y=>totals[y]);
const yoy = () => years.slice(1).map((z,i)=>100*(totals[z]/totals[years[i]]-1));
function linreg(xs,ys){
  const mx=average(xs), my=average(ys);
  const b=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0);
  return {b,a:my-b*mx};
}
function movingAvg(a,k=3){return a.map((_,i)=>i<k-1?null:average(a.slice(i-k+1,i+1)));}
function gini(arr){
  const s=[...arr].sort((a,b)=>a-b), t=s.reduce((a,b)=>a+b,0);
  return t?s.reduce((a,x,i)=>a+(2*i-s.length+1)*x,0)/(s.length*t):0;
}
function topShare(y,k){
  const vals=prefectures.map(d=>d.vals[y]).sort((a,b)=>b-a);
  return 100*vals.slice(0,k).reduce((a,b)=>a+b,0)/totals[y];
}
function hhi(y){const t=prefTotalOf(y);return t?prefectures.reduce((s,d)=>s+(d.vals[y]/t)**2,0):0;}
function jsDistance(y1,y2){
  const names=[...prefectures,{vals:others}];
  const a=names.map(d=>d.vals[y1]/totals[y1]), b=names.map(d=>d.vals[y2]/totals[y2]);
  const kl=(p,m)=>p>0?p*Math.log2(p/m):0;
  return Math.sqrt(a.reduce((s,p,i)=>s+(kl(p,(p+b[i])/2)+kl(b[i],(p+b[i])/2))/2,0));
}
const regionSum = (r,y) => sumOf(inRegion(r),y);

// ---- 描画 ----
const layout = (height,extra={}) => ({
  height, margin:{t:20,l:52,r:20,b:44},
  paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', transition:{duration:500,easing:'cubic-in-out'}, hoverlabel:{bgcolor:'#0f172a',font:{color:'#fff'},bordercolor:'#0f172a'},
  font:{family:'-apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif',size:13,color:'#475569'},
  xaxis:{showgrid:false,zeroline:false}, yaxis:{gridcolor:'#e8eef5',zeroline:false},
  legend:{orientation:'h',y:1.14,x:0}, ...extra
});
const config = {displaylogo:false,responsive:true};
// 棒・線はまずゼロの状態を描き、最終値へ遷移させる。
// 円・ヒートマップなどは形が崩れやすいため、従来どおりのフェード表示にする。
function chartStart(trace){
  if(trace.type==='bar'){
    if(Array.isArray(trace.y))return {...trace,y:trace.y.map(()=>0),text:undefined};
    if(Array.isArray(trace.x))return {...trace,x:trace.x.map(()=>0),text:undefined};
  }
  if(trace.type==='scatter'&&Array.isArray(trace.y))return {...trace,y:trace.y.map(()=>0)};
  return trace;
}
const canGrow = trace => (trace.type==='bar'&&(Array.isArray(trace.x)||Array.isArray(trace.y))) || (trace.type==='scatter'&&Array.isArray(trace.y));
const draw = (id,traces,extra={}) => {
  const el=document.getElementById(id);
  if(!el)return;
  traces.forEach(t=>{if(t.type==='bar')t.marker={cornerradius:5,...t.marker};});
  // 横棒の外側ラベルが切れないよう、数値軸に余白を持たせる
  const hb=traces.filter(t=>t.type==='bar'&&t.orientation==='h'&&t.textposition==='outside');
  if(hb.length&&!(extra.xaxis&&extra.xaxis.range)){
    const xs=hb.flatMap(t=>t.x), lo=Math.min(0,...xs), hi=Math.max(0,...xs), pad=(hi-lo)*0.22;
    extra={...extra,xaxis:{...extra.xaxis,range:[lo<0?lo-pad:0,hi>0?hi+pad:0]}};
    hb.forEach(t=>t.cliponaxis=false);
  }
  const growing=traces.map((trace,index)=>({trace,index})).filter(({trace})=>canGrow(trace));
  const initial=growing.length?traces.map(chartStart):traces;
  Plotly.react(el,initial,layout(extra.height??340,extra),config).then(()=>{
    if(growing.length){
      Plotly.animate(el,{data:growing.map(({trace})=>trace),traces:growing.map(({index})=>index)}, {
        transition:{duration:620,easing:'cubic-in-out'}, frame:{duration:620,redraw:false},mode:'afterall'
      });
    }
    el.classList.remove('chart-enter');
    void el.offsetWidth; // 同じグラフを再描画したときもアニメーションを再開する
    el.classList.add('chart-enter');
  });
};
const ax = (title,extra={}) => ({title,gridcolor:'#e8eef5',zeroline:false,...extra});
const catX = {type:'category'};

function panel(title,note,id,cls=''){
  return `<section class="panel ${cls}"><h2>${title}</h2>${note?`<p class="note">${note}</p>`:''}<div id="${id}"></div></section>`;
}
const grid = (...p) => `<div class="grid">${p.join('')}</div>`;
const yearLabel = () => chosenYear==='all' ? '全期間累計' : chosenYear+'年度';

// ---- タブ ----
const tabs = [
  {id:'overview',label:'概要',html:()=>
    `<div id="kpis" class="kpis"></div>`+
    grid(panel('入学者数の推移','棒：総入学者数　線：3年移動平均','annualChart','full'),
         panel('福島県内と県外','福島県出身者と、県外・その他の割合。','fukushimaChart'),
         panel('前年比','総入学者数の前年からの増減率。','yoyChart')),
    draw:drawOverview},
  {id:'trend',label:'推移・予測',html:()=>
    grid(panel('トレンドと次年度予測','線形回帰による単純な外挿です。参考値としてご覧ください。','forecastChart','full'),
         panel('累積入学者数','年度を追うごとの累計。','cumChart'),
         panel('県外・その他の入学者数','福島県を除いた入学者数と割合。','outsideChart'),
         panel('年度別 上位5県の推移','全期間で人数の多い上位5県。','top5Chart','full')),
    draw:drawTrend},
  {id:'region',label:'地方',html:()=>
    `<div class="filters inner"><label>地方の内訳<select id="regionSelect">${regionNames.map(r=>`<option ${r===regionSel?'selected':''}>${r}</option>`).join('')}</select></label></div>`+
    grid(panel('地方別の入学者','「表示」で人数と構成比を切り替え。','regionChart','full'),
         panel('地方の構成','選択した期間の地方別割合。','regionPie'),
         panel('地方別シェアの変化','初期3年と直近3年の構成比の差（ポイント）。','regionShareChange'),
         panel('東日本と西日本','北海道〜中部を東日本、近畿以西を西日本とした簡易区分。構成比の推移。','eastWestChart','full'),
         panel('地方 × 年度（構成比）','各年度に占める割合（%）。','regionHeat','full'),
         panel('選択した地方の内訳','上の「地方の内訳」で選んだ地方の都道府県別推移。','regionDetail','full')),
    draw:drawRegion},
  {id:'pref',label:'都道府県',html:()=>
    grid(panel('ランキング','上位15都道府県。','rankingChart'),
         panel('勢力図（ツリーマップ）','面積が入学者数に比例。0人の県は非表示。','treemapChart'),
         panel('規模と安定性','横：年平均　縦：変動係数（小さいほど安定）　大きさ：累計','bubbleChart'),
         panel('初期と直近の比較','対角線より上は増加、下は減少。','scatterChart'),
         panel('都道府県 × 年度','人数の濃淡。累計の多い順。','heatmapChart','full')),
    draw:drawPref},
  {id:'concentration',label:'集中・多様性',html:()=>
    grid(panel('累積構成比（パレート図）','人数の多い県から積み上げた割合。','paretoChart','full'),
         panel('上位県のシェア','上位1・3・5・10県が占める割合（%）。','topShareChart'),
         panel('出身地の広がり','出身都道府県数と実効都道府県数（大きいほど分散）。','diversityChart'),
         panel('集中度指標','HHI・ジニ係数（小さいほど分散）。福島県を含む都道府県内で算出。','concChart'),
         panel('前年との分布の違い','Jensen–Shannon距離（0〜1）。大きいほど出身地の構成が変化。','jsChart'),
         panel('入学者ゼロの年数','期間中に入学者がいなかった年の数が多い県。出身地としての定着度の目安。','zeroChart')),
    draw:drawConc},
  {id:'change',label:'増減',html:()=>
    grid(panel('増えた県・減った県','初期3年と直近3年の年平均の差。上位・下位9県。','movementChart'),
         panel('年あたりの増減（傾き）','線形回帰の傾き。上位・下位9県。','slopeChart'),
         panel('増減率','初期3年平均が1人以上の県。直近÷初期−1（%）。','ratioChart'),
         panel('地方別の増減','初期3年と直近3年の年平均人数。','regionChangeChart'),
         panel('ピーク年の分布','各県の入学者数が最大になった年（同数は最初の年）。','peakChart'),
         panel('外れ値（特異な年）','県ごとの平均から標準偏差で何個分離れたか（z値）。年平均1人以上の県が対象。','outlierChart')),
    draw:drawChange},
  {id:'compare',label:'比較',html:()=>
    `<div class="actions"><button id="selectTop" class="btn">上位5県を選択</button><button id="clearPref" class="btn">選択解除</button></div><div id="comparePicker" class="picker"></div>`+
    panel('都道府県の比較','チェックした県の推移。「表示」で人数と構成比を切り替え。','compareChart','full')+
    `<div class="filters inner"><label>年度A<select id="yearA"></select></label><label>年度B<select id="yearB"></select></label></div>`+
    grid(panel('福島県との連動性','年度別入学者数の相関係数。＋は同じ方向、−は逆方向に動いた県（上位・下位10県）。','corrChart','full'),
         panel('2つの年度の差','年度B − 年度A。増減の大きい県。','diffChart'),
         panel('2つの年度の地方別','年度AとBの地方別人数。','diffRegionChart')),
    draw:drawCompare},
  {id:'table',label:'データ表',html:()=>
    `<section class="panel"><h2>都道府県別の指標</h2><p class="note">初期／直近は最初・最後の3年度の年平均。傾き＝年あたりの増減、変動＝変動係数（標準偏差÷平均）。見出しクリックで並べ替え。</p>
    <input id="searchPref" class="search" type="search" placeholder="都道府県・地方で検索">
    <div class="table-wrap"><table><thead><tr>${tableCols.map(c=>`<th data-k="${c.k}">${c.l}</th>`).join('')}</tr></thead><tbody id="tableBody"></tbody></table></div></section>`,
    draw:drawTable}
];

function countUp(root){
  root.querySelectorAll('.kpi strong').forEach((el,i)=>{
    const m=el.textContent.match(/-?[\d,]+(\.\d+)?/);if(!m)return;
    const target=parseFloat(m[0].replace(/,/g,'')), dec=(m[1]||'').length, pre=el.textContent.slice(0,m.index), post=el.textContent.slice(m.index+m[0].length);
    const t0=performance.now()+i*40, dur=900;
    const fmt=x=>dec?x.toFixed(dec):Math.round(x).toLocaleString('ja-JP');
    const step=now=>{const p=Math.min(1,Math.max(0,(now-t0)/dur)),e=1-(1-p)**3;el.textContent=pre+fmt(target*e)+post;if(p<1)requestAnimationFrame(step);};
    requestAnimationFrame(step);
  });
}
function drawOverview(){
  const first=years[0], last=years.at(-1), f=fuku(), st=stats();
  const top=st.slice().sort((a,b)=>b.total-a.total);
  const fs=f?totalPref(f)/grandTotal():0;
  const reg=regionNames.map(r=>[r,regionSum(r,'all')]).sort((a,b)=>b[1]-a[1])[0];
  const lastYoY=100*(totals[last]/totals[years.at(-2)]-1);
  const items=[
    ['累計入学者数',txt(grandTotal())+'人',`${first}〜${last}年度`],
    ['年平均',average(seriesTotal()).toFixed(1)+'人',`${txt(Math.min(...seriesTotal()))}〜${txt(Math.max(...seriesTotal()))}人`],
    [`${last}年度`,txt(totals[last])+'人',`前年比 ${signed(lastYoY)}%`],
    ['福島県出身',pct(fs),`${f?txt(totalPref(f)):0}人`],
    ['県外・その他',pct(1-fs),`${txt(grandTotal()-(f?totalPref(f):0))}人`],
    ['最多の出身県',top[0].name,`${txt(top[0].total)}人（${pct(top[0].share)}）`],
    ['上位5県の割合',pct(top.slice(0,5).reduce((s,d)=>s+d.total,0)/grandTotal()),top.slice(0,5).map(d=>d.name).join('・')],
    ['最多の地方',reg[0],`${pct(reg[1]/grandTotal())}`],
    ['出身都道府県数',`${diversity('all').active} / 47`,'期間中に1人以上'],
    ['実効都道府県数',diversity('all').eff.toFixed(1),'偏りを考慮した広がり'],
    ['入学者数の傾き',signed(linreg(years.map((_,i)=>i),seriesTotal()).b,2)+'人/年','線形回帰'],
    ['最も増えた県',[...st].sort((a,b)=>b.change-a.change)[0].name,signed([...st].sort((a,b)=>b.change-a.change)[0].change)+'人/年']
  ];
  const kEl=document.getElementById('kpis');
  kEl.innerHTML=items.map(([l,val,s])=>`<div class="kpi"><span>${l}</span><strong>${val}</strong><small>${s}</small></div>`).join('');
  countUp(kEl);
  draw('annualChart',[
    {type:'bar',name:'入学者数',x:Y(),y:seriesTotal(),marker:{color:ACCENT},text:seriesTotal(),textposition:'outside',hovertemplate:'%{x}年度 %{y}人<extra></extra>'},
    {type:'scatter',mode:'lines',name:'3年移動平均',x:Y(),y:movingAvg(seriesTotal()),line:{color:ORANGE,width:3},connectgaps:false,hovertemplate:'%{x}年度 平均 %{y:.1f}人<extra></extra>'}
  ],{xaxis:catX,yaxis:ax('人',{rangemode:'tozero'}),height:380});
  if(f)draw('fukushimaChart',[
    {type:'bar',name:'福島県',x:Y(),y:years.map(z=>100*f.vals[z]/totals[z]),marker:{color:ACCENT},hovertemplate:'%{x}年度 %{y:.1f}%<extra>福島県</extra>'},
    {type:'bar',name:'県外・その他',x:Y(),y:years.map(z=>100*(totals[z]-f.vals[z])/totals[z]),marker:{color:SOFT},hovertemplate:'%{x}年度 %{y:.1f}%<extra>県外・その他</extra>'}
  ],{barmode:'stack',xaxis:catX,yaxis:ax('%',{range:[0,100]})});
  draw('yoyChart',[{type:'bar',x:years.slice(1).map(String),y:yoy(),marker:{color:yoy().map(x=>x>=0?POS:NEG)},text:yoy().map(x=>signed(x)+'%'),textposition:'outside',hovertemplate:'%{x}年度 %{y:.1f}%<extra></extra>'}],{xaxis:catX,yaxis:ax('%')});
}

function drawTrend(){
  const idx=years.map((_,i)=>i), tot=seriesTotal(), {a,b}=linreg(idx,tot);
  const next=years.at(-1)+1, pred=a+b*years.length;
  const resid=Math.sqrt(average(tot.map((t,i)=>(t-(a+b*i))**2)));
  draw('forecastChart',[
    {type:'scatter',mode:'lines+markers',name:'実績',x:Y(),y:tot,line:{color:ACCENT,width:3},marker:{size:7},hovertemplate:'%{x}年度 %{y}人<extra></extra>'},
    {type:'scatter',mode:'lines',name:'線形トレンド',x:[...Y(),String(next)],y:[...idx,years.length].map(i=>a+b*i),line:{color:ORANGE,dash:'dash',width:2},hovertemplate:'%{x}年度 %{y:.1f}人<extra>トレンド</extra>'},
    {type:'scatter',mode:'markers',name:`${next}年度 予測`,x:[String(next)],y:[pred],error_y:{type:'constant',value:1.96*resid,color:MUTED},marker:{size:11,color:ORANGE},hovertemplate:`${next}年度 予測 %{y:.0f}人（±${(1.96*resid).toFixed(0)}）<extra></extra>`}
  ],{xaxis:catX,yaxis:ax('人'),height:380});
  let acc=0;
  draw('cumChart',[{type:'scatter',mode:'lines+markers',fill:'tozeroy',fillcolor:'rgba(26,69,107,.12)',x:Y(),y:tot.map(t=>acc+=t),line:{color:ACCENT,width:3},hovertemplate:'%{x}年度まで %{y}人<extra></extra>'}],{xaxis:catX,yaxis:ax('人')});
  const f=fuku();
  draw('outsideChart',[
    {type:'bar',name:'人数',x:Y(),y:years.map(z=>totals[z]-(f?f.vals[z]:0)),marker:{color:SOFT},hovertemplate:'%{x}年度 %{y}人<extra></extra>'},
    {type:'scatter',mode:'lines+markers',name:'割合',yaxis:'y2',x:Y(),y:years.map(z=>100*(1-(f?f.vals[z]:0)/totals[z])),line:{color:ACCENT,width:3},hovertemplate:'%{x}年度 %{y:.1f}%<extra></extra>'}
  ],{xaxis:catX,yaxis:ax('人'),yaxis2:{title:'%',overlaying:'y',side:'right',showgrid:false,range:[0,100]},margin:{t:20,l:52,r:52,b:44}});
  const top5=stats().sort((x,y)=>y.total-x.total).slice(0,5).map(s=>s.name);
  draw('top5Chart',top5.map((n,i)=>{const d=prefectures.find(p=>p.name===n);return {type:'scatter',mode:'lines+markers',name:n,x:Y(),y:years.map(z=>d.vals[z]),line:{color:palette[i],width:2.5},marker:{size:6},hovertemplate:`%{x}年度 %{y}人<extra>${n}</extra>`};}),{xaxis:catX,yaxis:ax('人'),height:380});
}

function drawEastWest(){
  const east=prefectures.filter(d=>EAST.includes(regionOf[d.name])), west=prefectures.filter(d=>!EAST.includes(regionOf[d.name]));
  const mk=(name,color,f)=>({type:'scatter',mode:'lines',stackgroup:'a',name,x:Y(),y:years.map(f),line:{color,width:1.5},fillcolor:color+'cc',hovertemplate:`%{x}年度 ${name} %{y:.1f}%<extra></extra>`});
  draw('eastWestChart',[mk('東日本','#2563eb',z=>100*sumOf(east,z)/totals[z]),mk('西日本','#f59e0b',z=>100*sumOf(west,z)/totals[z]),mk('その他・不明','#cbd5e1',z=>100*others[z]/totals[z])],{height:320,xaxis:catX,yaxis:ax('%',{range:[0,100]})});
}
function drawRegion(){
  drawEastWest();
  const y=chosenYear;
  draw('regionChart',regionNames.map(r=>({type:'bar',name:r,x:Y(),
    y:years.map(z=>{const n=regionSum(r,z);return metric==='share'?100*n/totals[z]:n;}),
    marker:{color:colRegion[r]},hovertemplate:`%{x}年度 %{y:.1f}${unit()}<extra>${r}</extra>`})),
    {barmode:'stack',xaxis:catX,yaxis:ax(unit()),height:400});
  const vals=regionNames.map(r=>regionSum(r,y));
  draw('regionPie',[{type:'pie',labels:regionNames,values:vals,hole:.45,sort:false,marker:{colors:regionNames.map(r=>colRegion[r])},textinfo:'percent',textposition:'inside',hovertemplate:'%{label}: %{value}人 (%{percent})<extra></extra>'}],{showlegend:true,legend:{orientation:'h',y:-0.05},margin:{t:10,l:10,r:10,b:40}});
  const n=Math.min(3,Math.floor(years.length/2));
  const sh=(r,ys)=>100*ys.reduce((s,z)=>s+regionSum(r,z),0)/ys.reduce((s,z)=>s+totals[z],0);
  const diff=regionNames.map(r=>sh(r,years.slice(-n))-sh(r,years.slice(0,n)));
  draw('regionShareChange',[{type:'bar',x:regionNames,y:diff,marker:{color:diff.map(x=>x>=0?POS:NEG)},text:diff.map(x=>signed(x)),textposition:'outside',hovertemplate:'%{x} %{y:.2f}pt<extra></extra>'}],{yaxis:ax('pt')});
  draw('regionHeat',[{type:'heatmap',x:Y(),y:regionNames,z:regionNames.map(r=>years.map(z=>100*regionSum(r,z)/totals[z])),text:regionNames.map(r=>years.map(z=>(100*regionSum(r,z)/totals[z]).toFixed(1))),texttemplate:'%{text}',colorscale:HEAT,hovertemplate:'%{y} / %{x}年度 %{z:.1f}%<extra></extra>',colorbar:{title:'%',thickness:12}}],{height:320,margin:{l:80,r:20,t:10,b:30},yaxis:{autorange:'reversed'},xaxis:catX});
  const ps=inRegion(regionSel);
  draw('regionDetail',ps.map((d,i)=>({type:'bar',name:d.name,x:Y(),y:years.map(z=>d.vals[z]),marker:{color:palette[i%palette.length]},hovertemplate:`%{x}年度 %{y}人<extra>${d.name}</extra>`})),{barmode:'stack',xaxis:catX,yaxis:ax('人'),height:340});
}

function drawPref(){
  const y=chosenYear, st=stats();
  const rank=prefectures.slice().sort((a,b)=>v(b,y)-v(a,y)).slice(0,15).reverse();
  draw('rankingChart',[{type:'bar',orientation:'h',x:rank.map(d=>v(d,y)),y:rank.map(d=>d.name),marker:{color:rank.map(d=>d.name==='福島'?ACCENT:MUTED)},text:rank.map(d=>v(d,y)),textposition:'outside',hovertemplate:'%{y}: %{x}人<extra></extra>'}],{height:460,margin:{l:60,r:40,t:10,b:36},xaxis:{title:'人',showgrid:false},yaxis:{automargin:true}});
  // labels ではなく一意な ids で親子関係を作る。地域ごとの色配列も marker に明示する。
  // これにより同名ラベルへの依存をなくし、Plotly のバージョン差でも安定して表示できる。
  const labels=['全国'],ids=['all'],parents=[''],values=[prefTotalOf(y)],colors=['#e2e8f0'];
  regionNames.forEach(r=>{
    const p=inRegion(r).filter(d=>v(d,y)>0);
    if(!p.length)return;
    const regionId=`region-${r}`;
    labels.push(r);ids.push(regionId);parents.push('all');values.push(sumOf(p,y));colors.push(colRegion[r]);
    p.forEach(d=>{labels.push(d.name);ids.push(`pref-${d.name}`);parents.push(regionId);values.push(v(d,y));colors.push(colRegion[r]);});
  });
  draw('treemapChart',[{type:'treemap',labels,ids,parents,values,branchvalues:'total',marker:{colors,line:{color:'#fff',width:2}},texttemplate:'%{label}<br>%{value}人',hovertemplate:'%{label}: %{value}人<extra></extra>',pathbar:{visible:false}}],{height:460,margin:{l:5,r:5,t:5,b:5}});
  const act=st.filter(s=>s.total>0);
  draw('bubbleChart',[{type:'scatter',mode:'markers+text',x:act.map(s=>s.total/years.length),y:act.map(s=>s.cv),text:act.map(s=>s.name),textposition:'top center',textfont:{size:9},marker:{size:act.map(s=>Math.max(6,Math.sqrt(s.total)*3.2)),color:act.map(s=>colRegion[s.region]),opacity:.75},customdata:act.map(s=>s.total),hovertemplate:'%{text}<br>年平均 %{x:.1f}人 / 変動 %{y:.2f}<br>累計 %{customdata}人<extra></extra>'}],{height:460,xaxis:{title:'年平均（人）',type:'log',gridcolor:'#e8eef5'},yaxis:ax('変動係数')});
  const mx=Math.max(1,...st.map(s=>Math.max(s.early,s.late)));
  draw('scatterChart',[
    {type:'scatter',mode:'lines',x:[0,mx],y:[0,mx],line:{color:MUTED,dash:'dot'},hoverinfo:'skip',showlegend:false},
    {type:'scatter',mode:'markers+text',x:st.map(s=>s.early),y:st.map(s=>s.late),text:st.map(s=>s.change!==0&&Math.abs(s.change)>=1.5?s.name:''),textposition:'top center',textfont:{size:10},marker:{size:9,color:st.map(s=>colRegion[s.region]),opacity:.8},customdata:st.map(s=>s.name),hovertemplate:'%{customdata}<br>初期 %{x:.1f} → 直近 %{y:.1f}<extra></extra>',showlegend:false}
  ],{height:460,xaxis:ax('初期3年平均'),yaxis:ax('直近3年平均')});
  const order=st.slice().sort((a,b)=>b.total-a.total).map(s=>s.name);
  draw('heatmapChart',[{type:'heatmap',x:Y(),y:order,z:order.map(n=>years.map(z=>prefectures.find(d=>d.name===n).vals[z])),colorscale:HEAT,hovertemplate:'%{y} / %{x}年度<br>%{z}人<extra></extra>',colorbar:{title:'人',thickness:12}}],{height:900,margin:{l:60,r:20,t:10,b:36},yaxis:{autorange:'reversed',automargin:true,tickfont:{size:10},dtick:1},xaxis:{type:'category',side:'top'}});
}

const EAST=['北海道','東北','関東','中部'];
function corr(a,b){
  const ma=average(a),mb=average(b);
  const num=a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0);
  const den=Math.sqrt(a.reduce((s,x)=>s+(x-ma)**2,0)*b.reduce((s,x)=>s+(x-mb)**2,0));
  return den?num/den:null;
}
function drawConc(){
  const y=chosenYear;
  const sorted=prefectures.slice().sort((a,b)=>v(b,y)-v(a,y));
  const tot=y==='all'?grandTotal():totals[y];
  let acc=0;const cum=sorted.map(d=>acc+=v(d,y));
  draw('paretoChart',[
    {type:'bar',name:'人数',x:sorted.map(d=>d.name),y:sorted.map(d=>v(d,y)),marker:{color:MUTED},hovertemplate:'%{x}: %{y}人<extra></extra>'},
    {type:'scatter',mode:'lines+markers',name:'累積構成比',yaxis:'y2',x:sorted.map(d=>d.name),y:cum.map(c=>100*c/tot),line:{color:ACCENT,width:2.5},marker:{size:5},hovertemplate:'%{x}まで 累積 %{y:.1f}%<extra></extra>'}
  ],{height:400,margin:{t:20,l:52,r:52,b:70},xaxis:{tickangle:-60,tickfont:{size:10}},yaxis:ax('人'),yaxis2:{title:'累積 %',overlaying:'y',side:'right',range:[0,100],showgrid:false}});
  draw('topShareChart',[1,3,5,10].map((k,i)=>({type:'scatter',mode:'lines+markers',name:`上位${k}県`,x:Y(),y:years.map(z=>topShare(z,k)),line:{color:palette[i],width:2.5},marker:{size:6},hovertemplate:`%{x}年度 上位${k}県 %{y:.1f}%<extra></extra>`})),{xaxis:catX,yaxis:ax('%',{range:[0,100]})});
  draw('diversityChart',[
    {type:'bar',name:'出身都道府県数',x:Y(),y:years.map(z=>diversity(z).active),marker:{color:SOFT},hovertemplate:'%{x}年度 %{y}県<extra></extra>'},
    {type:'scatter',mode:'lines+markers',name:'実効都道府県数',x:Y(),y:years.map(z=>diversity(z).eff),line:{color:ACCENT,width:3},marker:{size:8},hovertemplate:'%{x}年度 %{y:.1f}<extra></extra>'}
  ],{xaxis:catX,yaxis:ax('県',{rangemode:'tozero'})});
  draw('concChart',[
    {type:'scatter',mode:'lines+markers',name:'HHI',x:Y(),y:years.map(hhi),line:{color:ORANGE,width:3},hovertemplate:'%{x}年度 HHI %{y:.4f}<extra></extra>'},
    {type:'scatter',mode:'lines+markers',name:'ジニ係数',yaxis:'y2',x:Y(),y:years.map(z=>gini(prefectures.map(d=>d.vals[z]))),line:{color:ACCENT,width:3},hovertemplate:'%{x}年度 ジニ %{y:.3f}<extra></extra>'}
  ],{xaxis:catX,yaxis:ax('HHI'),yaxis2:{title:'ジニ係数',overlaying:'y',side:'right',showgrid:false},margin:{t:20,l:60,r:60,b:44}});
  const zs=prefectures.map(d=>({name:d.name,n:years.filter(z=>d.vals[z]===0).length})).filter(s=>s.n>0).sort((a,b)=>b.n-a.n).slice(0,15).reverse();
  draw('zeroChart',zs.length?[{type:'bar',orientation:'h',x:zs.map(s=>s.n),y:zs.map(s=>s.name),marker:{color:ORANGE},text:zs.map(s=>s.n+'年'),textposition:'outside',hovertemplate:'%{y}: %{x}年<extra></extra>'}]:[],{height:380,margin:{l:60,r:40,t:10,b:36},xaxis:ax('年数'),yaxis:{automargin:true}});
  draw('jsChart',[{type:'bar',x:years.slice(1).map(String),y:years.slice(1).map((z,i)=>jsDistance(years[i],z)),marker:{color:'#8b5cf6'},hovertemplate:'%{x}年度 %{y:.3f}<extra></extra>'}],{xaxis:catX,yaxis:ax('距離',{rangemode:'tozero'})});
}

function drawExtra(){
  const st=stats();
  // ピーク年
  const peaks=Object.fromEntries(years.map(z=>[z,[]]));
  prefectures.forEach(d=>{if(!totalPref(d))return;const m=Math.max(...years.map(z=>d.vals[z]));peaks[years.find(z=>d.vals[z]===m)].push(d.name);});
  draw('peakChart',[{type:'bar',x:Y(),y:years.map(z=>peaks[z].length),marker:{color:years.map((_,i)=>palette[i%palette.length])},customdata:years.map(z=>peaks[z].join('・')||'なし'),hovertemplate:'%{x}年度がピーク: %{y}県<br>%{customdata}<extra></extra>'}],{xaxis:catX,yaxis:ax('県数'),height:380});
  // 外れ値
  const out=[];
  prefectures.forEach(d=>{const vals=years.map(z=>d.vals[z]),m=average(vals),sd=Math.sqrt(average(vals.map(x=>(x-m)**2)));if(m<1||!sd)return;years.forEach((z,i)=>out.push({label:`${d.name} ${z}`,z:(vals[i]-m)/sd,val:vals[i],mean:m}));});
  const top=out.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z)).slice(0,12).reverse();
  draw('outlierChart',[{type:'bar',orientation:'h',x:top.map(o=>o.z),y:top.map(o=>`${o.label}（${o.val}人／平均${o.mean.toFixed(1)}）`),marker:{color:top.map(o=>o.z>=0?POS:NEG)},text:top.map(o=>signed(o.z,2)),textposition:'outside',hovertemplate:'%{y}: z=%{x:.2f}<extra></extra>'}],{height:380,margin:{l:170,r:40,t:10,b:36},xaxis:ax('z値',{zeroline:true}),yaxis:{automargin:true}});
}
function drawChange(){
  drawExtra();
  const st=stats();
  const pick=(key,k=9)=>{const s=st.slice().sort((a,b)=>a[key]-b[key]);return [...s.slice(0,k),...s.slice(-k)];};
  const bar=(id,set,key,fmt,t)=>draw(id,[{type:'bar',orientation:'h',x:set.map(s=>s[key]),y:set.map(s=>s.name),marker:{color:set.map(s=>s[key]>=0?POS:NEG)},text:set.map(s=>fmt(s[key])),textposition:'outside',hovertemplate:'%{y}: %{x:.2f}<extra></extra>'}],{height:500,margin:{l:60,r:50,t:10,b:36},xaxis:ax(t,{zeroline:true}),yaxis:{automargin:true}});
  bar('movementChart',pick('change'),'change',x=>signed(x),'人/年（直近 − 初期）');
  bar('slopeChart',pick('trend'),'trend',x=>signed(x,2),'人/年（回帰の傾き）');
  const rs=st.filter(s=>s.early>=1).map(s=>({...s,ratio:100*(s.late/s.early-1)}));
  const r2=rs.slice().sort((a,b)=>a.ratio-b.ratio);
  bar('ratioChart',[...r2.slice(0,9),...r2.slice(-9)],'ratio',x=>signed(x,0)+'%','%');
  const rc=regionNames.map(r=>{const p=st.filter(s=>s.region===r);return {r,e:p.reduce((a,s)=>a+s.early,0),l:p.reduce((a,s)=>a+s.late,0)};});
  draw('regionChangeChart',[
    {type:'bar',name:'初期3年平均',x:rc.map(c=>c.r),y:rc.map(c=>c.e),marker:{color:SOFT},hovertemplate:'%{x} 初期 %{y:.1f}人<extra></extra>'},
    {type:'bar',name:'直近3年平均',x:rc.map(c=>c.r),y:rc.map(c=>c.l),marker:{color:ACCENT},hovertemplate:'%{x} 直近 %{y:.1f}人<extra></extra>'}
  ],{barmode:'group',height:500,yaxis:ax('人/年')});
}

function drawCorr(){
  const f=fuku(), fs=years.map(z=>f.vals[z]);
  const cs=prefectures.filter(d=>d.name!=='福島').map(d=>({name:d.name,r:corr(fs,years.map(z=>d.vals[z]))})).filter(c=>c.r!==null).sort((a,b)=>a.r-b.r);
  const set=[...cs.slice(0,10),...cs.slice(-10)];
  draw('corrChart',[{type:'bar',x:set.map(c=>c.name),y:set.map(c=>c.r),marker:{color:set.map(c=>c.r>=0?POS:NEG)},text:set.map(c=>signed(c.r,2)),textposition:'outside',hovertemplate:'%{x}: r=%{y:.2f}<extra></extra>'}],{height:340,yaxis:ax('相関係数',{range:[-1,1],zeroline:true}),xaxis:{tickangle:-40}});
}
function drawCompare(){
  drawCorr();
  const picker=document.getElementById('comparePicker');
  picker.innerHTML=prefectures.slice().sort((a,b)=>totalPref(b)-totalPref(a)).map(d=>`<label><input type="checkbox" value="${d.name}" ${selected.includes(d.name)?'checked':''}>${d.name}</label>`).join('');
  picker.querySelectorAll('input').forEach(e=>e.addEventListener('change',()=>{selected=[...picker.querySelectorAll('input:checked')].map(i=>i.value);updateCompare();}));
  document.getElementById('selectTop').onclick=()=>{selected=stats().sort((a,b)=>b.total-a.total).slice(0,5).map(s=>s.name);drawCompare();};
  document.getElementById('clearPref').onclick=()=>{selected=[];drawCompare();};
  const opts=years.map(z=>`<option value="${z}">${z}年度</option>`).join('');
  for(const [id,val] of [['yearA',yearA],['yearB',yearB]]){const el=document.getElementById(id);el.innerHTML=opts;el.value=val;}
  document.getElementById('yearA').onchange=e=>{yearA=+e.target.value;drawDiff();};
  document.getElementById('yearB').onchange=e=>{yearB=+e.target.value;drawDiff();};
  updateCompare();drawDiff();
}
function updateCompare(){
  const t=document.getElementById('compareChart');
  if(!selected.length){Plotly.purge(t);t.innerHTML='<div class="empty">比較したい都道府県を選んでください。</div>';return;}
  if(!t.querySelector('.js-plotly-plot'))t.innerHTML='';
  draw('compareChart',selected.map((n,i)=>{const d=prefectures.find(p=>p.name===n);
    return {type:'scatter',mode:'lines+markers',name:n,x:Y(),y:years.map(z=>metric==='share'?100*d.vals[z]/totals[z]:d.vals[z]),line:{width:2.5,color:palette[i%palette.length]},marker:{size:6},hovertemplate:`%{x}年度 %{y:.1f}${unit()}<extra>${n}</extra>`};}),
    {height:380,xaxis:catX,yaxis:ax(unit())});
}
function drawDiff(){
  const df=prefectures.map(d=>({name:d.name,diff:d.vals[yearB]-d.vals[yearA]})).filter(s=>s.diff!==0).sort((a,b)=>a.diff-b.diff);
  const set=df.length>20?[...df.slice(0,10),...df.slice(-10)]:df;
  draw('diffChart',[{type:'bar',orientation:'h',x:set.map(s=>s.diff),y:set.map(s=>s.name),marker:{color:set.map(s=>s.diff>=0?POS:NEG)},text:set.map(s=>signed(s.diff,0)),textposition:'outside',hovertemplate:'%{y}: %{x}人<extra></extra>'}],{height:460,margin:{l:60,r:40,t:10,b:36},xaxis:ax('人',{zeroline:true}),yaxis:{automargin:true}});
  draw('diffRegionChart',[
    {type:'bar',name:yearA+'年度',x:regionNames,y:regionNames.map(r=>regionSum(r,yearA)),marker:{color:SOFT}},
    {type:'bar',name:yearB+'年度',x:regionNames,y:regionNames.map(r=>regionSum(r,yearB)),marker:{color:ACCENT}}
  ],{barmode:'group',height:460,yaxis:ax('人')});
}

// ---- 表 ----
const tableCols=[
  {k:'rank',l:'順位'},{k:'name',l:'都道府県'},{k:'region',l:'地方'},{k:'total',l:'累計'},{k:'share',l:'構成比'},
  {k:'early',l:'初期'},{k:'late',l:'直近'},{k:'change',l:'差'},{k:'trend',l:'傾き'},{k:'cv',l:'変動'}
];
let sortKey='total', sortDir=-1;
function drawTable(){
  currentRanking=stats().sort((a,b)=>b.total-a.total).map((s,i)=>({...s,rank:i+1}));
  document.getElementById('searchPref').oninput=renderTable;
  document.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;sortDir=sortKey===k?-sortDir:(k==='name'||k==='region'?1:-1);sortKey=k;renderTable();});
  renderTable();
}
function renderTable(){
  const term=document.getElementById('searchPref').value.trim();
  const cmp=(a,b)=>{const x=a[sortKey]??-Infinity,y=b[sortKey]??-Infinity;return (typeof x==='string'?x.localeCompare(y,'ja'):x-y)*sortDir;};
  const rows=currentRanking.filter(s=>s.name.includes(term)||s.region.includes(term)).sort(cmp);
  document.getElementById('tableBody').innerHTML=rows.map(s=>
    `<tr><td>${s.rank}</td><td>${s.name}</td><td>${s.region}</td><td class="num">${txt(s.total)}</td><td class="num">${pct(s.share)}</td>`+
    `<td class="num">${s.early.toFixed(1)}</td><td class="num">${s.late.toFixed(1)}</td>`+
    `<td class="num ${s.change>0?'up':s.change<0?'down':''}">${signed(s.change)}</td>`+
    `<td class="num">${signed(s.trend,2)}</td><td class="num">${s.cv==null?'—':s.cv.toFixed(2)}</td></tr>`).join('')||'<tr><td colspan="10" class="empty">該当なし</td></tr>';
}

// ---- 画面 ----
function renderControls(){
  const sel=document.getElementById('yearSelect');
  sel.innerHTML='<option value="all">全期間（累計）</option>'+years.map(z=>`<option value="${z}">${z}年度</option>`).join('');
  sel.value=chosenYear;
}
function renderTabs(){
  document.getElementById('tabs').innerHTML=tabs.map(t=>`<button class="tab ${t.id===tab?'active':''}" data-id="${t.id}">${t.label}</button>`).join('');
  document.querySelectorAll('#tabs .tab').forEach(b=>b.onclick=()=>{tab=b.dataset.id;history.replaceState(null,'','#'+tab);renderTabs();render();window.scrollTo({top:0});});
}
function render(){
  const t=tabs.find(x=>x.id===tab);
  const pane=document.getElementById('pane');
  pane.innerHTML=t.html();
  const rs=document.getElementById('regionSelect');
  if(rs)rs.onchange=e=>{regionSel=e.target.value;drawRegion();};
  t.draw();
  // 年度・表示の切り替えが効くタブだけ、フィルターを有効表示
  const yearTabs=['region','pref','concentration'], metricTabs=['region','compare'];
  document.getElementById('yearWrap').classList.toggle('dim',!yearTabs.includes(tab));
  document.getElementById('metricWrap').classList.toggle('dim',!metricTabs.includes(tab));
}

function load(raw){
  const d=parseCSV(raw);
  if(tabs.some(t=>t.id===location.hash.slice(1)))tab=location.hash.slice(1);
  years=d.years;prefectures=d.prefs;others=d.extra.vals;totals=d.totals;
  selected=selected.filter(p=>prefectures.some(x=>x.name===p));
  chosenYear='all';yearA=years[0];yearB=years.at(-1);
  renderControls();renderTabs();render();
}

document.getElementById('app').innerHTML=`
<header class="top"><div class="wrap"><h1>会津大学 入学者データ</h1><p>都道府県別の入学者数（2016〜2026年度）</p></div>
  <div class="wrap bar"><nav id="tabs" class="tabs"></nav>
    <div class="filters"><label id="yearWrap">期間<select id="yearSelect"></select></label>
    <label id="metricWrap">表示<select id="metricSelect"><option value="count">人数</option><option value="share">構成比（%）</option></select></label></div></div></header>
<main class="wrap"><div id="error" class="error" hidden></div><div id="pane"></div>
<footer class="foot">合計は47都道府県と「その他」の内訳から再計算した値です。</footer></main>`;
document.getElementById('yearSelect').addEventListener('change',e=>{chosenYear=e.target.value;render();});
document.getElementById('metricSelect').addEventListener('change',e=>{metric=e.target.value;render();});

fetch(`${import.meta.env.BASE_URL}enrollments.csv`)
  .then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.text();})
  .then(load)
  .catch(e=>{const el=document.getElementById('error');el.hidden=false;el.textContent='読み込みエラー: '+e.message;console.error(e);});
