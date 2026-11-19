/* GONER PACK 013 (на базе 012): конвейер распознавания чека. Не зависит от DOM и от конкретного OCR-движка:
   движок передаётся функцией recognize(img,{psm,tag},onPct) → {text,words:[{text,conf,x0,y0,x1,y1,line}]}.
   В браузере это Tesseract.js (ocr.js), в тестах — нативный Tesseract (tests/node-recognizer.js). */
(function(r,f){const nd=typeof require==='function'&&typeof module==='object',m=f(nd?require('./imgproc.js'):r.IMG,nd?require('./parser.js'):r.GP,nd?require('./matcher.js'):r.GPM,nd?require('./ctc.js'):r.GPCTC);if(typeof module==='object'&&module.exports)module.exports=m;else r.PIPE=m})(typeof self!=='undefined'?self:this,function(IMG,GP,GPM,CTC){
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
/* Объединение проходов (012).
   1) Строки всех проходов выравниваются по ПОРЯДКУ в таблице (как выравнивание последовательностей) с учётом сходства названия,
      совпадения со справочником, суммы и вертикальной позиции. Две строки, которые справочник уверенно относит к РАЗНЫМ блюдам
      (краб ≠ креветка), никогда не считаются одной строкой.
   2) Название выбирается только из реально прочитанных вариантов: подтверждённое справочником → строка лучшего прохода → медоид.
   3) Количество и сумма — голосованием проходов; неуверенно прочитанное количество («‚0», «10») весит меньше.
   4) Итог чека только ПРОВЕРЯЕТ: при расхождении можно выбрать между суммами, реально прочитанными в разных проходах,
      и включить строку, найденную в одном проходе. Новые блюда и цифры не придумываются.
   5) Строка из одного прохода без подтверждения (справочник или итог) не становится позицией, а показывается в «строках для проверки». */
const nameOk=n=>GP.nameish(n)&&!GP.hdrish(n),sk=x=>x.sum!=null?x.sum.toFixed(2):null;
const simName=(a,b)=>GPM.compare(GPM.tokens(a),GPM.tokens(b)).score;
const FN_END=/(?:^|\s)(?:с|со|из|на|по|и|в|без|для|от)$/i;
function consensus(runs,best,opt){const m=opt&&opt.match,P=best.parsed,info={clusters:0,renamed:0,added:0,qtyConflicts:0,sumConflicts:0,sumByTotal:0,rejected:0,byGeometry:0,fillingConflicts:0};
 const mc=new Map(),dm=n=>{if(!m)return{st:'u'};if(!mc.has(n)){const r=m(n);mc.set(n,r&&r.st?r:{st:'u'})}return mc.get(n)};
 const order=[best,...runs.filter(r=>r.id!==best.id).sort((a,b)=>(b.score||0)-(a.score||0))];
 const rowsOf=r=>r.parsed.items.filter(x=>x.kind==='dish').map(x=>({x,run:r.id,name:x.name,qty:x.qty,qg:!!x.qg,sum:x.sum!=null?x.sum:null,raw:x.sumRaw||'',ny:x.ny,w:r.id===best.id?1.5:1,ok:nameOk(x.name),d:dm(x.name)}));
 const pairSim=(a,b)=>{if(a.d.st==='o'&&b.d.st==='o')return a.d.name===b.d.name?1:0;
  const ns=a.ok&&b.ok?simName(a.name,b.name):.3*simName(a.name,b.name),se=a.sum!=null&&b.sum!=null&&Math.abs(a.sum-b.sum)<.005,
   sp=!se&&(a.sum!=null&&b.raw&&a.sum.toFixed(2).startsWith(b.raw)||b.sum!=null&&a.raw&&b.sum.toFixed(2).startsWith(a.raw));
  let sc=Math.max(ns,se?.65+.35*ns:sp?.5+.4*ns:0);if(a.ny!=null&&b.ny!=null&&Math.abs(a.ny-b.ny)>.05)sc*=.6;return sc};
 const cl=[];
 for(const r of order){const R=rowsOf(r);if(!cl.length){R.forEach(x=>cl.push({m:[x]}));continue}
  const n=cl.length,k=R.length,S=(i,j)=>Math.max(...cl[i].m.map(y=>pairSim(R[j],y))),D=Array.from({length:n+1},()=>new Float64Array(k+1)),B=Array.from({length:n+1},()=>new Int8Array(k+1));
  const sc=Array.from({length:n},(_,i)=>Array.from({length:k},(_,j)=>S(i,j)));
  for(let i=1;i<=n;i++)for(let j=1;j<=k;j++){let v=D[i-1][j],b=1;if(D[i][j-1]>v){v=D[i][j-1];b=2}const s2=sc[i-1][j-1];if(s2>=.55&&D[i-1][j-1]+s2>v){v=D[i-1][j-1]+s2;b=3}D[i][j]=v;B[i][j]=b}
  const pairs=[];let i=n,j=k;while(i>0&&j>0){const b=B[i][j];if(b===3){pairs.push([i-1,j-1]);i--;j--}else if(b===1)i--;else j--}
  const at=new Map(pairs.map(([i,j])=>[j,i]));const ins=[];let last=-1;
  for(let j=0;j<k;j++){if(at.has(j)){const ci=at.get(j);const x=R[j],y=cl[ci].m[0];if(x.sum!=null&&y.sum!=null&&Math.abs(x.sum-y.sum)>.005&&x.ny!=null&&y.ny!=null&&Math.abs(x.ny-y.ny)<=.02)info.byGeometry++;cl[ci].m.push(x);last=ci}else ins.push({after:last,x:R[j]})}
  for(let q=ins.length-1;q>=0;q--)cl.splice(ins[q].after+1,0,{m:[ins[q].x],nw:true});}
 info.clusters=cl.length;
 /* выбор значений в каждой группе */
 const out=[];for(const c of cl){const M=c.m,runsIn=new Set(M.map(z=>z.run)),good=M.filter(z=>z.ok),x={kind:'dish',doubt:[],support:runsIn.size};
  // название
  const byD={};good.forEach(z=>{if(z.d.st==='o'){const e=byD[z.d.name]=byD[z.d.name]||{w:0,z:null};e.w+=z.w;if(!e.z||z.d.score>e.z.d.score)e.z=z}});
  const de=Object.entries(byD).sort((a,b)=>b[1].w-a[1].w);let pick=null;
  if(de.length){pick=de[0][1].z;if(de.length>1){info.fillingConflicts++;x.doubt.push('проходы OCR прочитали название по-разному: '+de.map(e=>e[0]).join(' / '));if(de[0][1].w===de[1][1].w){const bz=good.find(z=>z.run===best.id&&z.d.st==='o');if(bz)pick=bz}}}
  else{const bz=good.find(z=>z.run===best.id),others={};good.forEach(z=>{if(z.run!==best.id){const k=GP.norm(z.name);(others[k]=others[k]||{n:0,z}).n++}});
   const top=Object.values(others).sort((a,b)=>b.n-a.n)[0];
   if(bz&&!(top&&top.n>=2&&GP.norm(top.z.name)!==GP.norm(bz.name)&&simName(top.z.name,bz.name)>=.75))pick=bz;
   else if(good.length){let bd=1e9;for(const a of good){let d=0;for(const o of good)d+=o.w*GP.lev(GP.norm(a.name),GP.norm(o.name));d-=.01*a.w;if(d<bd){bd=d;pick=a}}}
   if(pick&&FN_END.test(pick.name)){const ext=good.filter(z=>z.name.length>pick.name.length&&GP.norm(z.name).startsWith(GP.norm(pick.name).slice(0,Math.max(4,GP.norm(pick.name).length-3))));if(ext.length)pick=ext.sort((a,b)=>b.w-a.w)[0]}}
  x.name=pick?pick.name:M[0].name;if(!pick)x.doubt.push('название похоже на мусор распознавания: проверьте по фото');
  const alts=[...new Map(good.filter(z=>GP.norm(z.name)!==GP.norm(x.name)&&simName(z.name,x.name)>=.75&&!(z.d.st==='o'&&pick&&pick.d.st==='o'&&z.d.name===pick.d.name)).map(z=>[GP.norm(z.name),z.name])).values()];
  if(alts.length&&!de.length){x.alts=alts.slice(0,2);if(M.length>1)x.doubt.push('проходы OCR прочитали название по-разному')}
  // количество
  const qv={};M.forEach(z=>{qv[z.qty]=(qv[z.qty]||0)+(z.qg?.35:1)*z.w});const qs=Object.entries(qv).sort((a,b)=>b[1]-a[1]);x.qty=+qs[0][0];
  if(qs.length>1&&qs[1][1]>=qs[0][1]*.6){info.qtyConflicts++;x.doubt.push('количество в проходах OCR разное: '+qs.map(q=>q[0]).join(' / '))}
  else if(M.every(z=>z.qg))x.doubt.push('количество прочитано неуверенно');
  // сумма
  const sv={};M.forEach(z=>{if(z.sum!=null)sv[z.sum.toFixed(2)]=(sv[z.sum.toFixed(2)]||0)+z.w});M.forEach(z=>{if(z.sum==null&&z.raw)for(const k of Object.keys(sv))if(k.startsWith(z.raw))sv[k]+=.5*z.w});
  const ss=Object.entries(sv).sort((a,b)=>b[1]-a[1]);x.sum=ss.length?+ss[0][0]:null;x.sumAlts=ss.slice(1).map(q=>+q[0]);
  if(ss.length>1&&ss[1][1]>=ss[0][1]*.6){info.sumConflicts++;x.sumDoubt='сумма в проходах OCR разная: '+ss.map(q=>q[0]).join(' / ')}
  if(x.sum==null)x.doubt.push('сумма строки не прочитана ни в одном проходе'+(M.find(z=>z.raw)?` (видно «${M.find(z=>z.raw).raw}»)`:''));
  const bd=M.find(z=>z.run===best.id);if(bd){if(bd.x.src)x.src=bd.x.src;if(bd.x.line!=null)x.line=bd.x.line;if(bd.x.qg)x.qg=true;if(bd.x.dup)x.dup=bd.x.dup}if(bd&&bd.x.ny!=null)x.ny=bd.x.ny;else{const z=M.find(z=>z.ny!=null);if(z)x.ny=z.ny}
  if(bd&&bd.x.doubt)bd.x.doubt.filter(d=>/цифры|лишний текст|начало строки|перенос/.test(d)).forEach(d=>{if(!x.doubt.includes(d))x.doubt.push(d)});
  if(x.name!==(bd&&bd.name))info.renamed++;
  x.keep=runs.length===1||runsIn.size>=2||!!(pick&&pick.d.st==='o'&&x.sum!=null);if(!x.keep&&(!c.m.some(z=>z.ok)||x.sum==null&&!c.m.some(z=>z.d.st==='o'||z.d.st==='s')))x.junk=true;
  if(runsIn.size===1&&runs.length>1&&x.keep)x.doubt.push('строка найдена только в одном проходе OCR: сверьте с фото');
  out.push(x)}
 /* итог: самое частое прочтение по всем проходам */
 const tv={};runs.forEach(r=>{const c=r.parsed.check;if(c&&c.readings)[...new Set(c.readings.map(v=>v.toFixed(2)))].forEach(v=>tv[v]=(tv[v]||0)+(r.id===best.id?1.5:1))});
 const total=Object.keys(tv).length?+Object.entries(tv).sort((a,b)=>b[1]-a[1])[0][0]:null,readings=Object.keys(tv).map(Number);
 const sumOf=L=>+L.reduce((a,z)=>a+(z.sum||0),0).toFixed(2);let keep=out.filter(z=>z.keep);
 if(total!=null&&Math.abs(sumOf(keep)-total)>.02){
  // а) другая сумма из реально прочитанных в проходах; б) строка, найденная в одном проходе. Минимум изменений; при неоднозначности — ничего не меняем.
  const opts=[];keep.forEach(z=>z.sumAlts.forEach(v=>opts.push({t:'alt',z,v,dv:v-(z.sum||0)})));out.filter(z=>!z.keep&&!z.junk&&z.sum!=null).forEach(z=>opts.push({t:'add',z,dv:z.sum}));
  const need=+(total-sumOf(keep)).toFixed(2),found=[];
  for(let a=0;a<opts.length&&found.length<3;a++){if(Math.abs(opts[a].dv-need)<=.02)found.push([opts[a]])}
  if(!found.length)for(let a=0;a<opts.length;a++)for(let b=a+1;b<opts.length;b++){if(opts[a].z===opts[b].z)continue;if(Math.abs(opts[a].dv+opts[b].dv-need)<=.02)found.push([opts[a],opts[b]])}
  if(found.length===1){for(const o of found[0]){if(o.t==='alt'){o.z.doubt.push(`сумма ${o.v.toFixed(2)} выбрана из прочтений OCR (было ${o.z.sum!=null?o.z.sum.toFixed(2):'—'}), потому что с ней сходится итог чека`);o.z.sumAlts=[o.z.sum,...o.z.sumAlts.filter(v=>v!==o.v)].filter(v=>v!=null);o.z.sum=o.v;delete o.z.sumDoubt;info.sumByTotal++}
    else{o.z.keep=true;o.z.added=true;o.z.doubt=o.z.doubt.filter(d=>!/одном проходе/.test(d));o.z.doubt.push('строка найдена только в одном проходе OCR; после её добавления сумма чека сошлась');info.added++}}
   keep=out.filter(z=>z.keep)}}
 const okTot=total!=null&&keep.length>0&&keep.every(z=>z.sum!=null)&&Math.abs(sumOf(keep)-total)<=.02;
 keep.forEach(z=>{if(z.sumDoubt&&!okTot)z.doubt.push(z.sumDoubt)});   // расхождение сумм, разрешённое сошедшимся итогом, подтверждения не требует
 /* приборы: объединение по названию, количество — голосование */
 const cv={};runs.forEach(r=>r.parsed.items.filter(x=>x.kind==='cutlery').forEach(x=>{const e=cv[x.name]=cv[x.name]||{runs:new Set(),q:{},doubt:[]};e.runs.add(r.id);e.q[x.qty]=(e.q[x.qty]||0)+(x.qg?.3:1)*(r.id===best.id?1.5:1)}));
 const cut=[];for(const[n,e]of Object.entries(cv)){if(e.runs.size<2&&runs.length>2)continue;const q=Object.entries(e.q).sort((a,b)=>b[1]-a[1]),it={name:n,qty:+q[0][0],kind:'cutlery',doubt:[]};
  if(q.length>1&&q[0][1]-q[1][1]<1.5)it.doubt.push('количество прибора в проходах OCR разное');if(q[0][1]<.9)it.doubt.push('количество прибора прочитано неуверенно');cut.push(it)}
 const CO=['Палочки','Ложка','Вилка','Нож и вилка','Нож','Приборы'];cut.sort((a,b)=>CO.indexOf(a.name)-CO.indexOf(b.name));
 P.items=[...keep.map(({keep,junk,support,sumAlts,sumDoubt,...z})=>z),...cut];
 P.skipped=[...out.filter(z=>!z.keep&&!z.junk).map(z=>({line:z.name+(z.sum!=null?' '+z.sum.toFixed(2):''),why:'строка найдена только в одном проходе OCR и не подтверждена: проверьте по фото'})),...(P.skipped||[]).filter(s=>GP.nameish(s.line))].slice(0,12);
 info.rejected=out.filter(z=>!z.keep).length;
 if(total!=null){const s=sumOf(keep);P.check={sum:s,total,readings,ok:okTot};P.warn=(P.warn||[]).filter(w=>!w.startsWith('Сумма позиций'));
  if(!okTot)P.warn.push(keep.some(z=>z.sum==null)?`Сумма прочитанных строк ${s.toFixed(2)}, итог чека ${total.toFixed(2)}: у части строк сумма не прочитана. Сверьте с фото.`:`Сумма позиций ${s.toFixed(2)} не сходится с итогом чека ${total.toFixed(2)}. Возможно, потеряна строка или неверно прочитана цифра. Сверьте с фото.`)}
 if(okTot&&P.no&&keep.length)P.quality='good';else if(keep.length)P.quality=P.quality==='bad'?'ok':P.quality==='good'&&!okTot?'ok':P.quality;
 P.merge=info;return info}
/* Надёжность прохода для голосования номера и ID: доля его сумм, совпавших с итоговыми (цифры одной и той же печати). */
function reliability(runs,P){const fin=new Set(P.items.filter(x=>x.kind==='dish'&&x.sum!=null).map(x=>x.sum.toFixed(2))),R={};
 runs.forEach(r=>{const s=r.parsed.items.filter(x=>x.kind==='dish'&&x.sum!=null);R[r.id]=s.length?s.filter(x=>fin.has(x.sum.toFixed(2))).length/s.length:.5});return R}
/* голосование номера / доп. ID: вес = надёжность прохода × позиция строки (ID — строка прямо над приборами и ниже номера);
   прочтения другой длины (у ID — длины номера предчека, иначе большинства) весят втрое меньше: OCR чаще теряет цифру, чем добавляет */
function weightedVotes(runs,f,rel,extra,prefLen){const L=runs.filter(r=>r.parsed[f]).map(r=>{let w=.4+1.2*(rel[r.id]==null?.5:rel[r.id]);const p=r.parsed.exPos;if(f==='ex'&&p){if(p.aboveCut===1)w*=1.2;if(p.afterNo!=null&&p.afterNo>6)w*=.7}return{v:r.parsed[f],w}});
 const all=[...L,...(extra||[])],lc={};all.forEach(z=>{if(/^\d{4,10}$/.test(z.v||''))lc[z.v.length]=(lc[z.v.length]||0)+z.w});const ml=prefLen&&lc[prefLen]!=null?prefLen:+(Object.entries(lc).sort((a,b)=>b[1]-a[1])[0]||[0])[0];
 return vote(all.map(z=>({v:z.v,w:z.v&&z.v.length!==ml?z.w*.3:z.w})))}
/* Голосование: кандидаты — строки цифр; выбираем «медоид» (минимальная взвешенная сумма расстояний Левенштейна до остальных).
   Независимые одиночные ошибки OCR в разных проходах так взаимно гасятся, в отличие от голосования по точному совпадению. */
function vote(items){const c={};let tot=0;for(const{v,w}of items){if(!/^\d{4,10}$/.test(v||''))continue;c[v]=(c[v]||0)+w;tot+=w}const keys=Object.keys(c);if(!keys.length)return null;
 let best=null,bd=1e18;for(const k of keys){let d=0;for(const j of keys)d+=c[j]*GP.lev(k,j);d-=.01*c[k];if(d<bd){bd=d;best=k}}return{value:best,votes:c[best],total:tot,all:c,unanimous:keys.length===1}}
const votesOf=(runs,f,extra)=>vote([...runs.map(r=>({v:r.parsed[f],w:1})),...(extra||[])]);
/* Всё, что происходит после OCR: выбор опорного прохода, объединение, голосование номера/ID. Отдельно — для тестов на реальных текстах. */
function combine(runs,o){o=o||{};const ranked=[...runs].sort((a,b)=>(b.parsed.quality==='good')-(a.parsed.quality==='good')||b.score-a.score),full=runs.filter(r=>!r.tableOnly).sort((a,b)=>b.score-a.score)[0],best=full||ranked[0];
 const parsed=JSON.parse(JSON.stringify(best.parsed));
 const cons=consensus(runs.map(r=>r.id===best.id?{...r,parsed}:r),{...best,parsed},{match:o.match});
 const rel=reliability(runs,parsed),vn=weightedVotes(runs.filter(r=>!r.tableOnly),'no',rel,o.hdrVotes),ve=weightedVotes(runs.filter(r=>!r.tableOnly),'ex',rel,null,vn&&vn.value?vn.value.length:0);
 for(const[f,v]of[['no',vn],['ex',ve]]){if(!v)continue;const lab=f==='no'?'Номер предчека':'Дополнительный ID';parsed[f]=v.value;
  if(!v.unanimous){parsed.warn.push(`${lab} прочитан по-разному в проходах OCR (${Object.keys(v.all).join(', ')}): выбран ${v.value}. Проверьте по фото.`);parsed[f+'Doubt']=true}}
 parsed.confidence={no:vn?(vn.unanimous&&runs.length>1?'подтверждён':'не подтверждён'):'нет',runs:runs.length,reliability:rel};
 if(!vn)parsed.warn.push('Номер предчека не найден ни в одном проходе: введите вручную по фото.');
 if(!parsed.ex)for(const r of runs)if(r.parsed.ex){parsed.ex=r.parsed.ex;break}
 return{best,parsed,merge:cons}}
/* 013: результат Neural OCR → формат конвейера. Нейросеть только читает строки; позиции собирает тот же разбор 012 + справочник + проверка итога. */
function fromNeural013(nr,o){o=o||{};const p=GP.parse(nr.text),run={id:'neural',label:'Нейросеть PP-OCRv5',psm:0,ms:nr.ms.total,size:nr.size,nwords:nr.words.length,text:nr.text,src:'neural',parsed:p,score:(p.score||0)+1e6};
 const C=combine([run],{match:o.match}),slim=({parsed,...r})=>({...r,no:parsed.no,ex:parsed.ex,quality:parsed.quality,items:parsed.items.length,skipped:parsed.skipped.length});
 return{best:{id:'neural',label:run.label,text:nr.text},parsed:C.parsed,runs:[slim(run)],runsRaw:[run],merge:C.merge,locate:{mode:'neural',rot:nr.rot,boxes:nr.boxes,region:nr.region},log:[{id:'neural',ms:nr.ms,boxes:nr.boxes,calls:nr.calls}],totalMs:nr.ms.total,engine:'neural',
  neural:{ms:nr.ms,rot:nr.rot,lines:nr.lines.map(l=>({t:l.text,c:+l.conf.toFixed(3),b:[l.x0,l.y0,l.x1,l.y1].map(Math.round),q:l.qcol?l.qcol.q+'/'+l.qcol.post.toFixed(2):undefined}))}}}
/* ---------- 017: позиции по выходу нейросети ---------- */
const NUMTAIL=/(?:^|\s)[{(\[‚,'`"«‘’„|\\]*\d[\d.,:;\s]*$/;
const xAt=(p,t)=>p.fx0+(t+.5)*p.fk;
/* фрагменты названия позиции: части исходных строк левее колонки количества (и левее хвоста из чисел) */
function nameParts(nr,src){const out=[];for(const li of src||[]){const l=nr.lines[li];if(!l)continue;const H=l.y1-l.y0,cut=l.qcol?l.qcol.x0-.1*H:null;
  for(const p of[...l.parts].sort((a,b)=>a.x0-b.x0)){if(!p.m||!/[а-яёa-z]/i.test(p.text))continue;if(cut!=null&&p.rx0!=null&&p.rx0>=cut)continue;
   let xc=cut!=null?cut:Infinity;const mm=p.text.match(NUMTAIL);if(mm&&mm.index>0){const k=mm.index+mm[0].search(/\S/);if(p.cf[k]!=null)xc=Math.min(xc,xAt(p,p.cf[k]-1))}
   out.push({p,xc,box:{x0:p.x0,y0:p.y0,x1:Math.min(p.x1,xc+.3*H),y1:p.y1,ang:p.ang,wide:p.wide,rx0:p.rx0,rx1:p.rx1}})}
  /* 017: строки-переносы, присоединённые к этой строке (neural.js joinWraps) */
  for(const p of l.contParts||[])if(p.m&&/[а-яёa-z]/i.test(p.text))out.push({p,xc:Infinity,box:{x0:p.x0,y0:p.y0,x1:p.x1,y1:p.y1,ang:p.ang,wide:p.wide,rx0:p.rx0,rx1:p.rx1}})}return out}
const cutM=(r,xc)=>{if(!r||!r.m)return null;if(!isFinite(xc))return r.m;const t1=Math.floor((xc-r.fx0)/r.fk-.5)+1;return CTC.slice(r.m,0,t1)};
const segOf=parts=>CTC.concat(parts.map(z=>cutM(z.p,z.xc)).filter(Boolean));
/* индекс справочника для CTC строится один раз на справочник */
const IDX=new WeakMap();const ctcIndex=dict=>{if(!dict)return null;let x=IDX.get(dict);if(!x){x=CTC.index(dict);IDX.set(dict,x)}return x};
/* перекрёстная проверка с прежним сопоставлением по тексту: если текст уверенно указывает на ДРУГОЕ блюдо — только предложение */
function neuralDecide(x,r,o){const nn=CTC.decide(r,o.cfg);nn.text=x.name;
 if(nn.dec==='auto'&&o.match){const m=o.match(x.name);if(m&&m.st==='o'&&m.name!==nn.name&&['exact','alias','order','spacing'].includes(m.how)){nn.dec='suggest';nn.note='текст строки совпадает с другим блюдом справочника'}}
 return nn}
function applyNeural(res,nr,o){o=o||{};const P=res.parsed,idx=o.ctcIdx||ctcIndex(o.dict),segs=[];res.neuralSegs=segs;const t0=Date.now();
 for(const x of P.items){if(x.kind!=='dish')continue;
  /* количество из своей колонки (017); без заголовка таблицы — прежний разбор 012 */
  const l=x.line!=null?nr.lines[x.line]:null,qc=l&&l.qcol;
  if(qc){x.qconf=+qc.post.toFixed(3);x.qcol=qc.q;const unsure=x.qg||(x.doubt||[]).some(d=>/количество прочитано неуверенно|количество в проходах|без «\.0»|количество ≥ 10/.test(d));
   if(qc.q!==x.qty&&(qc.post>=.9||unsure&&qc.post>=.6)){x.qtyText=x.qty;x.qty=qc.q;x.doubt=(x.doubt||[]).filter(d=>!/количество/.test(d));if(qc.post<.9)x.doubt.push(`количество прочитано по колонке «Кол-в»: ${qc.q} (неуверенно), в строке «${x.qtyText}»`);else x.qfix=true}
   else if(qc.q===x.qty&&qc.post>=.9){x.doubt=(x.doubt||[]).filter(d=>!/количество прочитано неуверенно|без «\.0»|количество ≥ 10/.test(d));delete x.qg}
   else if(qc.q!==x.qty)x.doubt.push(`количество: в строке ${x.qty}, в колонке «Кол-в» ${qc.q} — проверьте по фото`)}
  if(l&&l.scol&&x.sum==null){x.sum=+l.scol;x.doubt=(x.doubt||[]).filter(d=>!/сумма строки не прочитана|сумма не прочитана/.test(d));x.sumFix=true}
  if(!idx||!idx.forms.length)continue;
  const parts=nameParts(nr,x.src||(x.line!=null?[x.line]:[]));if(!parts.length)continue;const m=segOf(parts);if(!m||m.T<3)continue;
  const r=CTC.rank(m,idx),nn=neuralDecide(x,r,o);x.nn=nn;segs.push({x,parts,r,conf:Math.min(...(x.src||[x.line]).map(i=>nr.lines[i]?nr.lines[i].conf:1))})}
 recheckTotal(P);res.ctcMs=Date.now()-t0;return res}
/* сверка итога после дочитанных сумм */
function recheckTotal(P){const c=P.check;if(!c||!c.readings||!c.readings.length)return;const keep=P.items.filter(x=>x.kind==='dish');const s=+keep.reduce((a,z)=>a+(z.sum||0),0).toFixed(2),ok=keep.length>0&&keep.every(z=>z.sum!=null)&&c.readings.some(v=>Math.abs(v-s)<=.02);
 if(ok&&!c.ok){P.check={...c,sum:s,total:s,ok:true};P.warn=(P.warn||[]).filter(w=>!/^Сумма (позиций|прочитанных строк)/.test(w));if(P.no)P.quality='good'}else P.check={...c,sum:s}}
/* 017: повторное чтение трудных строк другим вырезом; оценки блюд по вариантам усредняются. Ограничено по времени. */
async function refineNeural(res,nr,o){o=o||{};if(!nr||!nr.reread||!res.neuralSegs)return res;const T0=Date.now(),budget=o.budgetMs==null?2000:o.budgetMs,idx=o.ctcIdx||ctcIndex(o.dict),V=o.variants||['pad','contrast','shift'];let n=0;
 const hard=res.neuralSegs.filter(z=>z.x.nn&&(z.x.nn.dec==='suggest'||z.x.nn.dec==='none'&&z.x.nn.gapFree>=-20&&z.conf<.95)).sort((a,b)=>(a.x.nn.dec==='suggest'?0:1)-(b.x.nn.dec==='suggest'?0:1)).slice(0,o.maxLines||8);
 for(const z of hard){if(Date.now()-T0>budget)break;const rs=[z.r];
  for(const v of V){if(Date.now()-T0>budget)break;const rr=await nr.reread(z.parts.map(q=>q.box),v);const parts=z.parts.map((q,k)=>({p:rr[k],xc:q.xc})).filter(q=>q.p&&q.p.m);if(!parts.length)continue;const m=segOf(parts);if(m&&m.T>=3)rs.push(CTC.rank(m,idx))}
  if(rs.length>1){const mr=CTC.mergeRanks(rs),nn=neuralDecide(z.x,mr,o);nn.rereads=rs.length-1;nn.before=z.x.nn.dec;z.x.nn=nn;n++}}
 /* количество: неуверенная ячейка — ещё раз с запасом по высоте и контрастом */
 for(const x of res.parsed.items){if(Date.now()-T0>budget)break;const l=x.kind==='dish'&&x.line!=null?nr.lines[x.line]:null;if(!l||!l.qcol||l.qcol.post>=.85)continue;
  const sc=[];for(const v of['pad','contrast']){const rr=await nr.reread([l.qcol.box],v);if(rr[0]&&rr[0].m)sc.push(CTC.qtyScores(rr[0].m))}const pk=CTC.qtyPick([...sc]);
  if(pk&&pk.post>=.9&&pk.q===l.qcol.q){x.qconf=+Math.max(x.qconf||0,pk.post).toFixed(3);x.doubt=(x.doubt||[]).filter(d=>!/по колонке «Кол-в»: \d+ \(неуверенно\)/.test(d))}}
 res.refineMs=Date.now()-T0;res.reread=n;return res}
/* 013→017: результат Neural OCR → формат конвейера. Строки собирает разбор 012; 017 добавляет количество из колонки и выбор блюда по CTC. */
function fromNeural(nr,o){o=o||{};const res=fromNeural013(nr,o);if(nr.lines&&nr.lines.some(l=>l.parts&&l.parts.some(p=>p.m)))applyNeural(res,nr,o);res.neural.table=nr.table;res.neural.turn=nr.turn;return res}

/* нейросеть + резервный Tesseract: строки нейросети — опорный проход, проходы Tesseract голосуют в объединении 012 */
function mergeEngines(nres,tres,o){o=o||{};const runs=[{...nres.runsRaw[0],score:1e6},...(tres.runsRaw||[])],C=combine(runs,{match:o.match});
 return{best:{...nres.best,label:'Нейросеть + резервный Tesseract'},parsed:C.parsed,runs:[...nres.runs,...tres.runs],runsRaw:runs,merge:C.merge,locate:nres.locate,log:[...nres.log,...(tres.log||[])],totalMs:nres.totalMs+tres.totalMs,engine:'neural+tesseract',neural:nres.neural}}
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
  const good=runs.filter(r=>r.parsed.quality==='good'),nv=votesOf(runs,'no');if(runs.length>=2&&good.length>=1&&nv&&nv.votes>=2&&nv.unanimous)break} // ≥2 прохода, один даёт сошедшуюся сумму, номер подтверждён
 if(!runs.length)return{cancelled:true,runs,log,locate};
 /* если ни один проход не сошёлся с итогом — отдельный проход по таблице блюд (полоса между заголовком и итогами, без шапки и рекламы) */
 if(!cancelled()&&!runs.some(r=>r.parsed.quality==='good')&&o.tablePass!==false){const c0=[...runs].sort((a,b)=>b.score-a.score).find(r=>tableBounds(r._gl));
  if(c0){try{P({phase:'table',label:'Проход по таблице блюд'});const tb=tableBounds(c0._gl),k=c0._img.h/crop.h;let strip=IMG.crop(crop,0,Math.max(0,tb.y0/k),crop.w,Math.min(crop.h,tb.y1/k));
   if(strip&&strip.h>20){strip=IMG.stretch(IMG.resize(strip,strip.w*s0*1.15,strip.h*s0*1.15));const t0=Date.now(),res=await o.recognize(strip,{psm:6,tag:'table'},p=>P({phase:'table',pct:p,label:'Проход по таблице блюд'})),gl=res.words&&res.words.length>5?GP.linesFromWords(res.words):null,pT=GP.parseTable(res.text),pG=gl&&gl.text?GP.parseTable(gl.text):null,useG=pG&&better(pG,pT)>0,parsed=useG?pG:pT;
    parsed.tableOnly=true;if(!parsed.check&&runs.length){const rd=[...new Set(runs.flatMap(r=>(r.parsed.check&&r.parsed.check.readings)||[]))];if(rd.length&&parsed.items.length){const sum=parsed.items.reduce((a,x)=>a+(x.sum||0),0),ok=rd.some(v=>Math.abs(sum-v)<=.02);parsed.check={sum:+sum.toFixed(2),total:ok?+sum.toFixed(2):rd[0],readings:rd,ok};if(!ok)parsed.warn.push(`Сумма позиций ${sum.toFixed(2)} не сходится с итогом чека (прочитано: ${rd.map(v=>v.toFixed(2)).join(', ')}). Возможно, потеряна строка или неверно прочитана цифра. Сверьте с фото.`)}}
    parsed.no=parsed.no||'';parsed.tableFound=true;const dish=parsed.items.some(x=>x.kind==='dish');parsed.quality=dish&&parsed.check&&parsed.check.ok?'good':'ok';parsed.score=parsed.items.length*10+(parsed.check?(parsed.check.ok?50:-20):0)+20-parsed.skipped.length*3;
    runs.push({id:'table',label:'Проход по таблице',psm:6,ms:Date.now()-t0,size:[strip.w,strip.h],text:res.text,geoText:gl&&gl.text,src:useG?'geo':'text',parsed,score:parsed.score,tableOnly:true});log.push({id:'table',ms:Date.now()-t0,lines:tb.lines})}}catch(e){log.push({id:'table',error:String(e)})}}}
 const C=combine(runs,{match:o.match,hdrVotes}),best=C.best,parsed=C.parsed,cons=C.merge;
 return{best:{id:best.id,label:best.label,text:best.text},parsed,runsRaw:runs.map(({_img,_gl,...r})=>r),runs:runs.map(({parsed,_img,_gl,...r})=>({...r,no:parsed.no,ex:parsed.ex,quality:parsed.quality,items:parsed.items.length,skipped:parsed.skipped.length})),merge:cons,locate,log,totalMs:Date.now()-T0,scale:s0}}
function diagnostics(res,meta){const L=['GONER PACK 017: диагностика распознавания',`Время: ${new Date().toISOString()}`,meta?`Устройство: ${meta}`:'',`Общее время: ${Math.round((res.totalMs||0)/1000)} с; область: ${JSON.stringify(res.locate||{})}`,`Выбран проход: ${res.best&&res.best.label}`,''];
 (res.runs||[]).forEach(r=>{L.push(`--- проход «${r.label}» (${r.id}, PSM ${r.psm}, ${Math.round(r.ms/1000)} с, ${r.size&&r.size.join('×')}): номер=${r.no||'—'} ID=${r.ex||'—'} позиций=${r.items} качество=${r.quality} слов с рамками=${r.nwords==null?'?':r.nwords} разбор=${r.src||'?'}`);L.push(r.text||'')});
 if(res.neural){const n=res.neural;L.push('',`--- нейросеть: поиск строк ${Math.round(n.ms.det)} мс, чтение ${Math.round(n.ms.rec)} мс, наклон ${n.rot}°; строки (уверенность, рамка x0,y0,x1,y1):`);n.lines.forEach(l=>L.push(`${l.c.toFixed(2)} [${l.b.join(',')}] ${l.t}${l.q?'  [кол-в '+l.q+']':''}`));if(n.table)L.push(`колонка количества: ${n.table.found?(n.table.header?'заголовок найден':'')+(n.table.calibrated?', границы по строкам':'')+`, ячеек ${n.table.rows}`:'заголовок таблицы не найден — количество по разбору 012'}${n.turn?`; фото развёрнуто на ${n.turn}°`:''}`);
  const it=(res.parsed&&res.parsed.items||[]).filter(x=>x.nn);if(it.length){L.push('','--- выбор блюда по нейросети (CTC): решение; отрыв от свободного прочтения; отрыв от второго; варианты');it.forEach(x=>L.push(`«${x.nn.text}» → ${x.nn.dec}${x.nn.dec!=='none'?' «'+x.nn.name+'»':''}; ${x.nn.gapFree}; ${x.nn.gap2}${x.nn.fill?' (начинка)':''}; ${x.nn.cands.map(c=>c.n+' '+c.s).join(' | ')}${x.nn.rereads?'; повторных чтений '+x.nn.rereads:''}${x.qconf!=null?'; кол-во '+x.qty+' ('+x.qconf+')':''}`))}}
 return L.filter(x=>x!==null).join('\n')}
return{recognizeReceipt,fromNeural,fromNeural013,applyNeural,refineNeural,nameParts,ctcIndex,recheckTotal,mergeEngines,combine,diagnostics,vote,weightedVotes,VARIANTS,TARGET_H,consensus,parseRun,tableBounds}});
