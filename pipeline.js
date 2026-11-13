/* GONER PACK 009: конвейер распознавания чека. Не зависит от DOM и от конкретного OCR-движка:
   движок передаётся функцией recognize(img,{psm,tag},onPct) → {text,words:[{text,conf,x0,y0,x1,y1,line}]}.
   В браузере это Tesseract.js (ocr.js), в тестах — нативный Tesseract (tests/node-recognizer.js). */
(function(r,f){const m=f(typeof require==='function'&&typeof module==='object'?require('./imgproc.js'):r.IMG,typeof require==='function'&&typeof module==='object'?require('./parser.js'):r.GP);if(typeof module==='object'&&module.exports)module.exports=m;else r.PIPE=m})(typeof self!=='undefined'?self:this,function(IMG,GP){
const TARGET_H=34;                       // целевая высота букв (px) для OCR: при меньшей Tesseract ошибается чаще
const VARIANTS=[                         // порядок: сначала самые вероятные; дальше работают только если первый не дал надёжного чека
 {id:'contrast',label:'Контраст, увеличение',psm:4,prep:(c,s)=>IMG.stretch(IMG.resize(c,c.w*s,c.h*s))},
 {id:'binary',label:'Адаптивная бинаризация',psm:4,prep:(c,s)=>{const b=IMG.resize(c,c.w*s*1.3,c.h*s*1.3);return IMG.sauvola(IMG.stretch(b),Math.max(12,Math.round(b.w/40)))}},
 {id:'flat',label:'Выравнивание света',psm:6,prep:(c,s)=>{const b=IMG.resize(c,c.w*s,c.h*s);return IMG.stretch(IMG.flatten(b,Math.max(25,Math.round(b.w/8))))}},
 {id:'plain',label:'Серое без обработки',psm:6,prep:(c,s)=>IMG.resize(c,c.w*s*.8,c.h*s*.8)}];
const idOf=(w,k)=>w&&w[k];
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
  const t0=Date.now(),img=V.prep(crop,s0),res=await o.recognize(img,{psm:V.psm,tag:V.id},p=>P({phase:'variant',run:i+1,runs:maxRuns,label:V.label,id:V.id,pct:p})),parsed=GP.parse(res.text);
  runs.push({id:V.id,label:V.label,psm:V.psm,ms:Date.now()-t0,size:[img.w,img.h],text:res.text,parsed,score:parsed.score});
  const good=runs.filter(r=>r.parsed.quality==='good'),nv=vote(runs,'no');if(runs.length>=2&&good.length>=1&&nv&&nv.votes>=3&&good.length>=1)break} // ≥2 прохода, один даёт сошедшуюся сумму, номер подтверждён
 if(!runs.length)return{cancelled:true,runs,log,locate};
 const ranked=[...runs].sort((a,b)=>(b.parsed.quality==='good')-(a.parsed.quality==='good')||b.score-a.score),best=ranked[0],parsed=JSON.parse(JSON.stringify(best.parsed));
 const vn=votesOf(runs,'no',hdrVotes),ve=votesOf(runs,'ex');
 for(const[f,v]of[['no',vn],['ex',ve]]){if(!v)continue;const lab=f==='no'?'Номер предчека':'Дополнительный ID';
  if(parsed[f]!==v.value){parsed[f]=v.value}
  if(!v.unanimous)parsed.warn.push(`${lab} прочитан по-разному в проходах OCR (${Object.keys(v.all).join(', ')}): выбран ${v.value}. Проверьте по фото.`)}
 parsed.confidence={no:vn?(vn.unanimous&&runs.length>1?'подтверждён':'не подтверждён'):'нет',runs:runs.length};
 if(!vn)parsed.warn.push('Номер предчека не найден ни в одном проходе: введите вручную по фото.');
 return{best:{id:best.id,label:best.label,text:best.text},parsed,runs:runs.map(({parsed,...r})=>({...r,no:parsed.no,ex:parsed.ex,quality:parsed.quality,items:parsed.items.length,skipped:parsed.skipped.length})),locate,log,totalMs:Date.now()-T0,scale:s0}}
function diagnostics(res,meta){const L=['GONER PACK 009: диагностика распознавания',`Время: ${new Date().toISOString()}`,meta?`Устройство: ${meta}`:'',`Общее время: ${Math.round((res.totalMs||0)/1000)} с; область: ${JSON.stringify(res.locate||{})}`,`Выбран проход: ${res.best&&res.best.label}`,''];
 (res.runs||[]).forEach(r=>{L.push(`--- проход «${r.label}» (${r.id}, PSM ${r.psm}, ${Math.round(r.ms/1000)} с, ${r.size&&r.size.join('×')}): номер=${r.no||'—'} ID=${r.ex||'—'} позиций=${r.items} качество=${r.quality}`);L.push(r.text||'')});return L.filter(x=>x!==null).join('\n')}
return{recognizeReceipt,diagnostics,vote,VARIANTS,TARGET_H}});
