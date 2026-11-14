/* GONER PACK 011 (на базе 010): конвейер распознавания чека. Не зависит от DOM и от конкретного OCR-движка:
   движок передаётся функцией recognize(img,{psm,tag},onPct) → {text,words:[{text,conf,x0,y0,x1,y1,line}]}.
   В браузере это Tesseract.js (ocr.js), в тестах — нативный Tesseract (tests/node-recognizer.js). */
(function(r,f){const nd=typeof require==='function'&&typeof module==='object',m=f(nd?require('./imgproc.js'):r.IMG,nd?require('./parser.js'):r.GP,nd?require('./matcher.js'):r.GPM);if(typeof module==='object'&&module.exports)module.exports=m;else r.PIPE=m})(typeof self!=='undefined'?self:this,function(IMG,GP,GPM){
const TARGET_H=34;                       // целевая высота букв (px) для OCR: при меньшей Tesseract ошибается чаще
const VARIANTS=[                         // порядок: сначала самые вероятные; дальше работают только если первый не дал надёжного чека
 {id:'contrast',label:'Контраст, увеличение',psm:4,prep:(c,s)=>IMG.stretch(IMG.resize(c,c.w*s,c.h*s))},
 {id:'binary',label:'Адаптивная бинаризация',psm:4,prep:(c,s)=>{const b=IMG.resize(c,c.w*s*1.3,c.h*s*1.3);return IMG.sauvola(IMG.stretch(b),Math.max(12,Math.round(b.w/40)))}},
 {id:'flat',label:'Выравнивание света',psm:6,prep:(c,s)=>{const b=IMG.resize(c,c.w*s,c.h*s);return IMG.stretch(IMG.flatten(b,Math.max(25,Math.round(b.w/8))))}},
 {id:'plain',label:'Серое без обработки',psm:6,prep:(c,s)=>IMG.resize(c,c.w*s*.8,c.h*s*.8)}];
const idOf=(w,k)=>w&&w[k];
const rank=p=>p.quality==='good'?2:p.quality==='ok'?1:0,better=(a,b)=>rank(a)-rank(b)||a.score-b.score;
/* два разбора одного прохода: «как отдал Tesseract» и «по геометрии слов» (строки пересобраны по y); берём лучший по самопроверке */
function parseRun(res){const pT=GP.parse(res.text);let gl=null,pG=null;
 if(res.words&&res.words.length>8){gl=GP.linesFromWords(res.words);if(gl.text)pG=GP.parse(gl.text,{lineY:gl.lines.map(l=>(l.y0+l.y1)/2)})}
 const useG=pG&&better(pG,pT)>0;return{parsed:useG?pG:pT,src:useG?'geo':'text',gl,alt:useG?pT:pG}}
/* границы таблицы по пересобранным строкам: от заголовка «Наименование/Кол-во/Сумма» до первой строки итогов */
function tableBounds(gl){if(!gl||!gl.lines.length)return null;const L=gl.lines,th=L.findIndex(l=>GP.isTH(l.text));if(th<0)return null;let te=-1;for(let i=th+1;i<L.length;i++)if(GP.isTot(L[i].text)||GP.isPay(L[i].text)){te=i;break}
 if(te<0||te-th<2)return null;return{y0:L[th].y1-.05*gl.H,y1:L[te].y0+.05*gl.H,lines:te-th-1}}
/* Объединение проходов (011). Принципы:
   1) строки разных проходов сопоставляются по сумме позиции (она читается надёжнее названия), а при её расхождении — по вертикальной позиции в кадре (ny), если совпало количество;
   2) НИКОГДА не сочиняем название: выбираем только из прочтений, реально бывших в проходах, и только «похожие на название» (не мусор, не шапка/реклама);
   3) если в лучшем проходе строка достоверна — она сохраняется; заменяется лишь на прочтение, подтверждённое справочником лучше;
   4) строка, которой нет в лучшем проходе, добавляется только если после этого сходится итог чека;
   5) «другие прочтения» — только близкие по смыслу к выбранному названию. */
const nameOk=n=>GP.nameish(n)&&!GP.hdrish(n),sk=x=>x.sum!=null?x.sum.toFixed(2):null;
const simName=(a,b)=>GPM.compare(GPM.tokens(a),GPM.tokens(b)).score;
function consensus(runs,best,opt){const m=opt&&opt.match,P=best.parsed,info={renamed:0,added:0,qtyConflicts:0,rejected:0,byGeometry:0},groups={},dishOf=r=>r.parsed.items.filter(x=>x.kind==='dish'&&x.sum!=null);
 runs.forEach(r=>{const seen={};dishOf(r).forEach(x=>{const k=sk(x),n=seen[k]=(seen[k]||0)+1,g=k+'#'+n;(groups[g]=groups[g]||[]).push({name:x.name,qty:x.qty,ny:x.ny,w:r.id===best.id?1.5:1,run:r.id})})});
 const choose=(c,cur)=>{const vs=c.filter(x=>nameOk(x.name)),curOk=!!cur&&nameOk(cur);
  if(m){let top=null;for(const x of vs){const r=m(x.name);if(r.st==='o'&&(!top||r.score>top.r.score||r.score===top.r.score&&x.w>top.x.w))top={x,r}}
   if(top){if(curOk){const rc=m(cur);if(rc.st==='o'&&rc.score>=top.r.score)return{name:cur,by:'best'}}return{name:top.x.name,by:'dict'}}}
  if(curOk){if(m&&m(cur).st==='o')return{name:cur,by:'best'};const cnt={};vs.forEach(x=>{if(x.run!==best.id){const k=GP.norm(x.name);(cnt[k]=cnt[k]||{n:0,name:x.name}).n++}});
   const top=Object.values(cnt).sort((p,q)=>q.n-p.n)[0];if(top&&top.n>=2&&GP.norm(top.name)!==GP.norm(cur)&&simName(top.name,cur)>=.75)return{name:top.name,by:'majority'};   // два и более других прохода единодушны и близки
   return{name:cur,by:'best'}}
  if(vs.length){let b=null,bd=1e9;for(const a of vs){let d=0;for(const o of vs)d+=o.w*GP.lev(GP.norm(a.name),GP.norm(o.name));d-=.01*a.w;if(d<bd){bd=d;b=a}}return{name:b.name,by:'consensus'}}
  return{name:cur,by:'none'}};
 const used=new Set(),seenB={},open=[];
 P.items.forEach(x=>{if(x.kind!=='dish'||x.sum==null)return;const k=sk(x),n=seenB[k]=(seenB[k]||0)+1,g=k+'#'+n,c=groups[g];if(c&&c.length>=2){used.add(g);x._g=g}else open.push(x)});
 // координатное сопоставление для строк, у которых сумма в других проходах прочитана иначе
 open.forEach(x=>{if(x.ny==null)return;const c=[];runs.forEach(r=>{if(r.id===best.id)return;dishOf(r).concat(r.parsed.items.filter(y=>y.kind==='dish'&&y.sum==null)).forEach(y=>{if(y.ny!=null&&Math.abs(y.ny-x.ny)<=.02&&y.qty===x.qty&&nameOk(y.name)&&simName(y.name,x.name)>=.5)c.push({name:y.name,qty:y.qty,ny:y.ny,w:1,run:r.id})})});
  if(c.length){x._extra=c;info.byGeometry++}});
 P.items.forEach(x=>{if(x.kind!=='dish')return;let c=x._g?groups[x._g].slice():[{name:x.name,qty:x.qty,w:1.5,run:best.id}];if(x._extra)c=c.concat([{name:x.name,qty:x.qty,w:1.5,run:best.id}],x._extra);delete x._g;delete x._extra;
  const ch=choose(c,x.name),good=c.filter(z=>nameOk(z.name));if(ch.name&&ch.name!==x.name){x.name=ch.name;info.renamed++}
  const alts=[...new Map(good.filter(z=>GP.norm(z.name)!==GP.norm(x.name)&&simName(z.name,x.name)>=.75).map(z=>[GP.norm(z.name),z.name])).values()];
  if(alts.length){x.alts=alts.slice(0,2);if(ch.by==='consensus'&&!x.doubt.includes('проходы OCR прочитали название по-разному'))x.doubt.push('проходы OCR прочитали название по-разному')}
  if(!nameOk(x.name)&&!x.doubt.some(d=>d.startsWith('название похоже на мусор')))x.doubt.push('название похоже на мусор распознавания: проверьте по фото');
  const qs=[...new Set(c.map(z=>z.qty))];if(qs.length>1){info.qtyConflicts++;const t='количество в проходах OCR разное: '+qs.join(' / ');if(!x.doubt.some(d=>d.startsWith('количество в проходах')))x.doubt.push(t)}});
 // приборы: количество — по большинству проходов, у каждого прибора отдельная строка
 P.items.forEach(x=>{if(x.kind!=='cutlery')return;const v={};runs.forEach(r=>r.parsed.items.forEach(y=>{if(y.kind==='cutlery'&&GP.norm(y.name)===GP.norm(x.name))v[y.qty]=(v[y.qty]||0)+(r.id===best.id?1.5:1)}));
  const top=Object.entries(v).sort((a,b)=>b[1]-a[1]);if(top.length>1){const q=+top[0][0];if(q!==x.qty&&top[0][1]>top[1][1]){x.qty=q;info.cutleryFixed=(info.cutleryFixed||0)+1}if(top[0][1]-top[1][1]<1.5&&!x.doubt.includes('количество прибора в проходах OCR разное'))x.doubt.push('количество прибора в проходах OCR разное')}});
 if(!(P.check&&P.check.ok)&&P.tableFound){const have=new Set(Object.keys(seenB).flatMap(k=>Array.from({length:seenB[k]},(_,i)=>k+'#'+(i+1)))),readings=[...new Set(runs.flatMap(r=>(r.parsed.check&&r.parsed.check.readings)||[]))];
  let cur=P.items.reduce((a,x)=>a+(x.sum||0),0);const miss=Object.entries(groups).filter(([g])=>!have.has(g)).sort((a,b)=>b[1].length-a[1].length);
  for(const[g,c]of miss){const sum=+g.split('#')[0],hit=readings.some(v=>Math.abs(cur+sum-v)<=.02),sup=new Set(c.map(z=>z.run)).size;if(!hit&&!(sup>=2&&!readings.length))continue;
   if(!c.some(z=>nameOk(z.name))){info.rejected++;continue}
   const ch=choose(c,null),q=c[0];P.items.push({name:ch.name,qty:q.qty,kind:'dish',sum,doubt:[hit?'строка найдена только в другом проходе OCR; после её добавления сумма чека сошлась':'строка найдена в нескольких проходах OCR; проверьте по фото'],added:true});cur+=sum;info.added++;if(hit)break}
  P.items.sort((a,b)=>(a.kind==='cutlery')-(b.kind==='cutlery'));
  if(info.added&&readings.length){const ok=readings.some(v=>Math.abs(cur-v)<=.02);P.check={sum:+cur.toFixed(2),total:ok?+cur.toFixed(2):(P.check&&P.check.total)||readings[0],readings,ok};if(ok){P.warn=P.warn.filter(w=>!w.startsWith('Сумма позиций'));P.skipped=P.skipped||[];if(P.no&&P.items.some(x=>x.kind==='dish'))P.quality='good'}}}
 P.merge=info;return info}
/* Голосование: кандидаты — строки цифр; выбираем «медоид» (минимальная взвешенная сумма расстояний Левенштейна до остальных).
   Независимые одиночные ошибки OCR в разных проходах так взаимно гасятся, в отличие от голосования по точному совпадению. */
function vote(items){const c={};let tot=0;for(const{v,w}of items){if(!/^\d{4,10}$/.test(v||''))continue;c[v]=(c[v]||0)+w;tot+=w}const keys=Object.keys(c);if(!keys.length)return null;
 let best=null,bd=1e18;for(const k of keys){let d=0;for(const j of keys)d+=c[j]*GP.lev(k,j);d-=.01*c[k];if(d<bd){bd=d;best=k}}return{value:best,votes:c[best],total:tot,all:c,unanimous:keys.length===1}}
const votesOf=(runs,f,extra)=>vote([...runs.map(r=>({v:r.parsed[f],w:1})),...(extra||[])]);
async function recognizeReceipt(src,o){o=o||{};const T0=Date.now(),log=[],P=o.onProgress||(()=>{}),cancelled=o.cancelled||(()=>false),maxRuns=o.maxRuns||4;
 const g=src.d.length===src.w*src.h*4?IMG.gray(src):src;let crop,locate={mode:'full',words:0},skew={deg:0,n:0},wordH=0,locWords=null,locBox=null;
 if(o.quad){P({phase:'crop',label:'Выпрямление по вашей рамке'});const w=IMG.warpQuad(g,o.quad,1600);if(!w)throw new Error('Рамка обрезки слишком мала или искажена');crop=w;locate={mode:'manual',words:0}}
 else{ /* проход 1: найти чек по уверенным словам на уменьшенном кадре */
  P({phase:'locate',label:'Поиск чека на фото'});const k=Math.min(1,(o.locateLong||1300)/Math.max(g.w,g.h)),small=IMG.stretch(IMG.resize(g,g.w*k,g.h*k)),t0=Date.now(),res=await o.recognize(small,{psm:11,tag:'locate'},p=>P({phase:'locate',pct:p,label:'Поиск чека на фото'}));
  const words=res.words.map(w=>({...w,x0:w.x0/k,y0:w.y0/k,x1:w.x1/k,y1:w.y1/k})),box=IMG.textBox(words);locWords=words;locBox=box;log.push({id:'locate',ms:Date.now()-t0,words:res.words.length,box:box&&{...box}});
  if(box){const w=box.x1-box.x0,h=box.y1-box.y0,mx=.25*w,mt=.12*h,mb=.18*h;skew=IMG.skewDeg(words.filter(x=>x.conf>=50));
   const hs=words.filter(x=>x.conf>=70&&x.text.length>=3).map(x=>x.y1-x.y0).sort((a,b)=>a-b);wordH=hs[hs.length>>1]||0;
   let c=IMG.crop(g,box.x0-mx*1.4,box.y0-mt*1.5,box.x1+mx*1.4,box.y1+mb*1.5);if(skew.n>=2&&Math.abs(skew.deg)>.4)c=IMG.rotate(c,-skew.deg); // rotate(+a) увеличивает наклон, поэтому исправляем поворотом на −угол (tests/imgproc.test.js)
   crop=c;locate={mode:'text-box',words:box.n,box,skew:skew.deg,skewLines:skew.n,wordH}}
  else{crop=g.w*g.h>2.5e6?IMG.resize(g,g.w*.7,g.h*.7):g;locate={mode:'full',words:0,note:'чек не найден: уверенных слов мало'}}}
 if(cancelled())return{cancelled:true,runs:[],log};
 const hdrVotes=[];
 if(locate.mode==='text-box'){ /* полоса заголовка «ПРЕДЧЕК АДМИН № …»: крупный шрифт читается лучше в своём масштабе */
  const hw=locWords.filter(w=>GP.has(w.text,'предчек',3)||GP.has(w.text,'админ',2)).sort((a,b)=>b.conf-a.conf)[0];
  if(hw){try{P({phase:'header',label:'Проход по заголовку (номер чека)'});const hh=Math.max(8,hw.y1-hw.y0),bw=locBox.x1-locBox.x0;let band=IMG.crop(g,locBox.x0-.3*bw,hw.y0-1.1*hh,locBox.x1+.3*bw,hw.y1+1.1*hh);
   if(skew.n>=2&&Math.abs(skew.deg)>.4)band=IMG.rotate(band,-skew.deg);const k=Math.max(.5,Math.min(2,TARGET_H/hh));band=IMG.stretch(IMG.resize(band,band.w*k,band.h*k));
   const t0=Date.now(),res=await o.recognize(band,{psm:6,tag:'header'},p=>P({phase:'header',pct:p,label:'Проход по заголовку (номер чека)'})),n=GP.numberFrom(res.text);log.push({id:'header',ms:Date.now()-t0,no:n,text:res.text,scale:k});if(n)hdrVotes.push({v:n,w:2})}catch(e){log.push({id:'header',error:String(e)})}}}
 const base=wordH>0?TARGET_H/wordH:1.5,s0=Math.max(1,Math.min(2.2,base*(o.scaleMul||1))),runs=[];
 for(let i=0;i<Math.min(maxRuns,VARIANTS.length);i++){if(cancelled())break;const V=VARIANTS[i];P({phase:'variant',run:i+1,runs:maxRuns,label:V.label,id:V.id});
  const t0=Date.now(),img=V.prep(crop,s0),res=await o.recognize(img,{psm:V.psm,tag:V.id},p=>P({phase:'variant',run:i+1,runs:maxRuns,label:V.label,id:V.id,pct:p})),pr=parseRun(res),parsed=pr.parsed;parsed.items.forEach(x=>{if(x.y!=null)x.ny=x.y/img.h});
  runs.push({id:V.id,label:V.label,psm:V.psm,ms:Date.now()-t0,size:[img.w,img.h],nwords:(res.words||[]).length,text:res.text,geoText:pr.gl&&pr.gl.text,src:pr.src,parsed,score:parsed.score,_img:img,_gl:pr.gl});
  const good=runs.filter(r=>r.parsed.quality==='good'),nv=vote(runs,'no');if(runs.length>=2&&good.length>=1&&nv&&nv.votes>=3&&good.length>=1)break} // ≥2 прохода, один даёт сошедшуюся сумму, номер подтверждён
 if(!runs.length)return{cancelled:true,runs,log,locate};
 /* если ни один проход не сошёлся с итогом — отдельный проход по таблице блюд (полоса между заголовком и итогами, без шапки и рекламы) */
 if(!cancelled()&&!runs.some(r=>r.parsed.quality==='good')&&o.tablePass!==false){const c0=[...runs].sort((a,b)=>b.score-a.score).find(r=>tableBounds(r._gl));
  if(c0){try{P({phase:'table',label:'Проход по таблице блюд'});const tb=tableBounds(c0._gl),k=c0._img.h/crop.h;let strip=IMG.crop(crop,0,Math.max(0,tb.y0/k),crop.w,Math.min(crop.h,tb.y1/k));
   if(strip&&strip.h>20){strip=IMG.stretch(IMG.resize(strip,strip.w*s0*1.15,strip.h*s0*1.15));const t0=Date.now(),res=await o.recognize(strip,{psm:6,tag:'table'},p=>P({phase:'table',pct:p,label:'Проход по таблице блюд'})),gl=res.words&&res.words.length>5?GP.linesFromWords(res.words):null,pT=GP.parseTable(res.text),pG=gl&&gl.text?GP.parseTable(gl.text):null,useG=pG&&better(pG,pT)>0,parsed=useG?pG:pT;
    parsed.tableOnly=true;if(!parsed.check&&runs.length){const rd=[...new Set(runs.flatMap(r=>(r.parsed.check&&r.parsed.check.readings)||[]))];if(rd.length&&parsed.items.length){const sum=parsed.items.reduce((a,x)=>a+(x.sum||0),0),ok=rd.some(v=>Math.abs(sum-v)<=.02);parsed.check={sum:+sum.toFixed(2),total:ok?+sum.toFixed(2):rd[0],readings:rd,ok};if(!ok)parsed.warn.push(`Сумма позиций ${sum.toFixed(2)} не сходится с итогом чека (прочитано: ${rd.map(v=>v.toFixed(2)).join(', ')}). Возможно, потеряна строка или неверно прочитана цифра. Сверьте с фото.`)}}
    parsed.no=parsed.no||'';parsed.tableFound=true;const dish=parsed.items.some(x=>x.kind==='dish');parsed.quality=dish&&parsed.check&&parsed.check.ok?'good':'ok';parsed.score=parsed.items.length*10+(parsed.check?(parsed.check.ok?50:-20):0)+20-parsed.skipped.length*3;
    runs.push({id:'table',label:'Проход по таблице',psm:6,ms:Date.now()-t0,size:[strip.w,strip.h],text:res.text,geoText:gl&&gl.text,src:useG?'geo':'text',parsed,score:parsed.score,tableOnly:true});log.push({id:'table',ms:Date.now()-t0,lines:tb.lines})}}catch(e){log.push({id:'table',error:String(e)})}}}
 const ranked=[...runs].sort((a,b)=>(b.parsed.quality==='good')-(a.parsed.quality==='good')||b.score-a.score),best=ranked[0];
 /* номер, ID, комментарий берём из полноформатных проходов, даже если лучшей оказалась только полоса таблицы */
 const full=runs.filter(r=>!r.tableOnly).sort((a,b)=>b.score-a.score)[0],parsed0=JSON.parse(JSON.stringify(best.parsed));if(best.tableOnly&&full){for(const f of['no','ex','notes'])if(!parsed0[f])parsed0[f]=full.parsed[f];parsed0.items.unshift(...full.parsed.items.filter(x=>x.kind==='cutlery').map(x=>({...x})));parsed0.warn=[...new Set([...full.parsed.warn.filter(w=>!w.startsWith('Сумма позиций')),...parsed0.warn])]}
 const cons=consensus(runs.map(r=>({...r,parsed:r===best?{...r.parsed,items:parsed0.items}:r.parsed})),{...best,parsed:parsed0},{match:o.match}),parsed=parsed0;
 const vn=votesOf(runs,'no',hdrVotes),ve=votesOf(runs,'ex');
 for(const[f,v]of[['no',vn],['ex',ve]]){if(!v)continue;const lab=f==='no'?'Номер предчека':'Дополнительный ID';
  if(parsed[f]!==v.value){parsed[f]=v.value}
  if(!v.unanimous)parsed.warn.push(`${lab} прочитан по-разному в проходах OCR (${Object.keys(v.all).join(', ')}): выбран ${v.value}. Проверьте по фото.`)}
 parsed.confidence={no:vn?(vn.unanimous&&runs.length>1?'подтверждён':'не подтверждён'):'нет',runs:runs.length};
 if(!vn)parsed.warn.push('Номер предчека не найден ни в одном проходе: введите вручную по фото.');
 return{best:{id:best.id,label:best.label,text:best.text},parsed,runs:runs.map(({parsed,_img,_gl,...r})=>({...r,no:parsed.no,ex:parsed.ex,quality:parsed.quality,items:parsed.items.length,skipped:parsed.skipped.length})),merge:cons,locate,log,totalMs:Date.now()-T0,scale:s0}}
function diagnostics(res,meta){const L=['GONER PACK 011: диагностика распознавания',`Время: ${new Date().toISOString()}`,meta?`Устройство: ${meta}`:'',`Общее время: ${Math.round((res.totalMs||0)/1000)} с; область: ${JSON.stringify(res.locate||{})}`,`Выбран проход: ${res.best&&res.best.label}`,''];
 (res.runs||[]).forEach(r=>{L.push(`--- проход «${r.label}» (${r.id}, PSM ${r.psm}, ${Math.round(r.ms/1000)} с, ${r.size&&r.size.join('×')}): номер=${r.no||'—'} ID=${r.ex||'—'} позиций=${r.items} качество=${r.quality} слов с рамками=${r.nwords==null?'?':r.nwords} разбор=${r.src||'?'}`);L.push(r.text||'')});return L.filter(x=>x!==null).join('\n')}
return{recognizeReceipt,diagnostics,vote,VARIANTS,TARGET_H,consensus,parseRun,tableBounds}});
