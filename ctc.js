/* GONER PACK 017: выбор блюда прямо по выходу нейросети (CTC).
   Нейросеть распознавания (PP-OCRv5) для каждой строки выдаёт матрицу вероятностей T×C: в каждом шаге (столбце 8 px картинки) — вероятность
   каждой буквы и «пустого» символа. Версия 016 брала из каждого шага одну самую вероятную букву и дальше работала только со строкой текста.
   Здесь матрица сохраняется (в сжатом алфавите) и по ней считается CTC-правдоподобие log P(«Суп Кимчи» | картинка) для названий справочника.
   Это честная оценка «насколько картинка похожа на это название», а не похожесть уже испорченной строки.

   Сжатый алфавит: пустой символ, пробел, цифры, «.», «-», «(», «)», «"», «+», «/», 31 строчная русская буква (ё = е, й = и, регистр не важен),
   латинские буквы, не похожие на русские. Вероятности сливаемых символов складываются (А+а+латинская A → «а»). Так матрица строки ~60 столбцов
   вместо 519 и занимает ~50 КБ.
   Пробелы, кавычки, скобки, точки, дефисы и «+» в названии справочника необязательны: модель не всегда видит пробел в моноширинном шрифте чека.
   Многострочное название: матрицы строк склеиваются через «шов» (пустой символ или пробел), поэтому «картофеле» + «м айдахо» = «картофелем айдахо». */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.GPCTC=m})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CYR='абвгдежзиклмнопрстуфхцчшщъыьэюя',LATX='dfgijlqsvz',PUN=' 0123456789.-()"+/';
const ALPHA=['',...PUN,...CYR,...LATX],R=ALPHA.length,COL=new Map();ALPHA.forEach((c,i)=>{if(i)COL.set(c,i)});
const LOOK={a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у',n:'п',u:'и',w:'ш',r:'г'};   // n/u/w/r: так модель путает строчные «п», «и», «ш», «г» моноширинного шрифта чека (new → «пеш», ШТ → «WT»)
const EXTRA={'ё':'е','й':'и',',':'.',':':'.',';':'.','«':'"','»':'"','“':'"','”':'"','„':'"','–':'-','—':'-','‐':'-'};
/* символ → столбец сжатого алфавита (−1 — символ не учитывается) */
function colOf(ch){if(ch==null||ch==='')return-1;let c=String(ch).toLowerCase();c=EXTRA[c]||LOOK[c]||c;const k=COL.get(c);return k==null?-1:k}
const OPT=new Set([' ','"','-','(',')','+','/','.'].map(c=>COL.get(c)));
const DIG=[...'0123456789'].map(c=>COL.get(c)),DOT=COL.get('.'),SP=COL.get(' ');
/* таблица «класс модели → столбец»: класс 0 — пустой символ CTC, класс k — keys[k−1] */
const MAPS=new WeakMap();
/* латинская n в шрифте чека бывает и «п», и «н»: её вероятность добавляется в оба столбца */
const SECOND={n:'н'};
function colMap(keys){let m=MAPS.get(keys);if(m)return m;m=new Int16Array(keys.length+2).fill(-1);m[0]=0;const m2=new Int16Array(keys.length+2).fill(-1);keys.forEach((k,i)=>{m[i+1]=colOf(k);const s2=SECOND[String(k).toLowerCase()];if(s2&&/[a-z]/i.test(k))m2[i+1]=COL.get(s2)});m[keys.length+1]=COL.get(' ');m.second=m2;MAPS.set(keys,m);return m}
const FLOOR=-18;
/* вероятности одного изображения (T×C, после softmax) → лог-вероятности T×R сжатого алфавита */
function reduce(out,base,T,C,map){const lp=new Float32Array(T*R),acc=new Float64Array(R);
 const m2=map.second,sec=[];if(m2)for(let c=0;c<C;c++)if(m2[c]>=0)sec.push(c);
 for(let t=0;t<T;t++){acc.fill(0);const o=base+t*C;for(let c=0;c<C;c++){const k=map[c];if(k>=0)acc[k]+=out[o+c]}for(const c of sec)acc[m2[c]]+=out[o+c];const q=t*R;for(let k=0;k<R;k++){const v=acc[k];lp[q+k]=v>1.5e-8?Math.log(v):FLOOR}}
 return lp}
/* ---------- цель (название справочника) ---------- */
const CC=new Map();
function compile(name){const key=String(name);let c=CC.get(key);if(c)return c;const labs=[],opt=[];
 for(const ch of key){const k=colOf(ch);if(k<0)continue;if(OPT.has(k)){if(labs.length&&opt[opt.length-1])continue;/* разделители подряд — один необязательный разделитель */labs.push(k);opt.push(1)}else{labs.push(k);opt.push(0)}}
 while(labs.length&&opt[0]){labs.shift();opt.shift()}while(labs.length&&opt[opt.length-1]){labs.pop();opt.pop()}
 c={name:key,labs:Int16Array.from(labs),opt:Uint8Array.from(opt),core:labs.filter((k,i)=>!opt[i]).length,txt:labs.filter((k,i)=>!opt[i]).map(k=>ALPHA[k]).join('')};c.g=graph(c.labs,c.opt);if(CC.size>4000)CC.clear();CC.set(key,c);return c}
/* граф состояний CTC с необязательными метками: B_k — пустой символ после k-й метки, L_k — сама метка */
function graph(labs,opt){const n=labs.length,S=2*n+1,pred=Array.from({length:S},()=>[]),L=k=>2*k-1,B=k=>2*k,add=(a,b)=>{if(!pred[b].includes(a))pred[b].push(a)};
 for(let s=0;s<S;s++)add(s,s);
 /* пропуск необязательной метки — только переходом сразу к следующей метке (без «пустых» состояний между ними, иначе пути считались бы дважды) */
 for(let k=0;k<=n;k++)for(let j=k+1;j<=n;j++){add(B(k),L(j));if(!opt[j-1])break}
 for(let k=1;k<=n;k++){add(L(k),B(k));for(let j=k+1;j<=n;j++){if(labs[j-1]!==labs[k-1])add(L(k),L(j));if(!opt[j-1])break}}
 const start=[0];for(let j=1;j<=n;j++){start.push(L(j));if(!opt[j-1])break}
 const end=[B(n)];if(n)end.push(L(n));for(let k=n-1;k>=0&&opt[k];k--){end.push(B(k));if(k)end.push(L(k))}
 /* необязательная метка — любой разделитель (пробел, дефис, точка, кавычка, скобка): «Сан-Себастьян» = «Сан Себастьян» */
 const col=new Int16Array(S);for(let s=0;s<S;s++)col[s]=s%2?(opt[(s-1)/2]?-2:labs[(s-1)/2]):0;
 return{S,pred:pred.map(p=>Int32Array.from(p)),start,end,col}}
const SEPC=[' ','-','.','"','(',')','+','/'].map(c=>COL.get(c));
function sepOf(m){if(m.sep)return m.sep;const T=m.T,o=new Float32Array(T);for(let t=0;t<T;t++){let z=0;for(const k of SEPC)z+=Math.exp(m.lp[t*R+k]);o[t]=z>1.5e-8?Math.log(z):FLOOR}m.sep=o;return o}
const lse=(a,b)=>a===-Infinity?b:b===-Infinity?a:a>b?a+Math.log1p(Math.exp(b-a)):b+Math.log1p(Math.exp(a-b));
/* log P(цель | матрица): сумма по всем выравниваниям (прямой проход CTC) */
function forward(m,c){const lp=m.lp,T=m.T,g=c.g||c,S=g.S;if(!T||c.labs&&c.core>T)return-Infinity;const sep=g.col.includes(-2)?sepOf(m):null;let a=new Float64Array(S).fill(-Infinity),b=new Float64Array(S);
 const em=(t,s)=>{const k=g.col[s];return k===-2?sep[t]:lp[t*R+k]};
 for(const s of g.start)a[s]=em(0,s);
 for(let t=1;t<T;t++){for(let s=0;s<S;s++){const P=g.pred[s];let v=-Infinity;for(let i=0;i<P.length;i++)v=lse(v,a[P[i]]);b[s]=v===-Infinity?v:v+em(t,s)}const x=a;a=b;b=x}
 let v=-Infinity;for(const s of g.end)v=lse(v,a[s]);return v}
/* склейка нескольких фрагментов (части строки, строки многострочного названия) через «шов»: пустой символ или пробел */
function concat(segs){segs=segs.filter(s=>s&&s.T>0);if(segs.length===1)return segs[0];const T=segs.reduce((a,s)=>a+s.T,0)+Math.max(0,segs.length-1),lp=new Float32Array(T*R).fill(FLOOR);let t=0;
 segs.forEach((s,i)=>{if(i){lp[t*R]=Math.log(.5);lp[t*R+SP]=Math.log(.5);t++}lp.set(s.lp.subarray(0,s.T*R),t*R);t+=s.T});return{lp,T}}
/* часть матрицы: кадры [t0, t1) */
const slice=(m,t0,t1)=>{t0=Math.max(0,t0|0);t1=Math.min(m.T,t1|0);return t1>t0?{lp:m.lp.subarray(t0*R,t1*R),T:t1-t0}:null};
/* «свободное» прочтение: самый вероятный символ в каждом кадре, повторы и пустые символы убраны */
function greedy(m){const labs=[];let last=0;for(let t=0;t<m.T;t++){const q=t*R;let bi=0,bv=-Infinity;for(let k=0;k<R;k++){const v=m.lp[q+k];if(v>bv){bv=v;bi=k}}if(bi&&bi!==last)labs.push(bi);last=bi}
 return{labs,text:labs.map(k=>ALPHA[k]).join('')}}
function freeScore(m){const g=greedy(m),c={labs:Int16Array.from(g.labs),opt:new Uint8Array(g.labs.length),core:g.labs.length};c.g=graph(c.labs,c.opt);return{text:g.text,score:forward(m,c)}}
/* ---------- количество: только цифры и точка (маска алфавита), шаблон «N.0» ---------- */
const QC=new Map();
function qtyScores(m,maxN){maxN=maxN||99;if(!m||!m.T)return[];const T=m.T,lp=new Float32Array(T*R).fill(-1e4),mask=[0,...DIG,DOT];
 for(let t=0;t<T;t++){const q=t*R;let z=-Infinity;for(const k of mask)z=lse(z,m.lp[q+k]);for(const k of mask)lp[q+k]=m.lp[q+k]-z}
 const mm={lp,T},out=[];for(let n=1;n<=maxN;n++){let c=QC.get(n);if(!c){const labs=[...String(n)].map(d=>DIG[+d]).concat([DOT,DIG[0]]);c={labs:Int16Array.from(labs),opt:new Uint8Array(labs.length),core:labs.length};c.g=graph(c.labs,c.opt);QC.set(n,c)}
  out.push({q:n,s:forward(mm,c)})}
 return out.sort((a,b)=>b.s-a.s)}
/* итог по количеству: лучший вариант и его доля (апостериорная вероятность среди N.0, N=1…99) */
function qtyPick(list){const L=list.filter(x=>x&&x.length);if(!L.length)return null;const acc=new Map();
 L.forEach(sc=>sc.forEach(x=>acc.set(x.q,(acc.get(x.q)||0)+x.s/L.length)));const arr=[...acc].map(([q,s])=>({q,s})).sort((a,b)=>b.s-a.s);let z=-Infinity;arr.forEach(x=>z=lse(z,x.s));
 return{q:arr[0].q,post:Math.exp(arr[0].s-z),alt:arr[1]?arr[1].q:null,altPost:arr[1]?Math.exp(arr[1].s-z):0,s:arr[0].s}}
/* ---------- справочник ---------- */
const nrm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/й/g,'и');
const big=s=>{const x=compile(s).txt,o=new Set();for(let i=0;i<x.length-1;i++)o.add(x.slice(i,i+2));return o};
/* индекс: все формы (название + алиасы) каждой записи справочника */
function index(dict){const forms=[];(dict||[]).forEach(d=>{const ns=[d.n,...(d.a||[])],seen=new Set();for(const n of ns){const c=compile(n);if(c.core<2||seen.has(c.txt))continue;seen.add(c.txt);forms.push({d,n,c,bg:big(n)})}});return{forms,size:(dict||[]).length}}
const dice=(a,b)=>{if(!a.size||!b.size)return 0;let k=0;for(const x of a)if(b.has(x))k++;return 2*k/(a.size+b.size)};
/* оценки блюд для строки. m — матрица названия (склеенные фрагменты). Возвращает свободное прочтение и блюда по убыванию оценки. */
function rank(m,idx,o){o=o||{};const fr=freeScore(m),gb=big(fr.text),K=o.k||24,L=fr.text.length;
 const pre=idx.forms.filter(f=>f.c.core<=m.T).map(f=>({f,p:dice(gb,f.bg)-.02*Math.abs(f.c.txt.length-L)/Math.max(4,L)})).sort((a,b)=>b.p-a.p);
 const take=pre.filter((x,i)=>i<K||x.p>=.45),best=new Map();
 for(const{f}of take){const s=forward(m,f.c);const e=best.get(f.d);if(!e||s>e.s)best.set(f.d,{d:f.d,n:f.d.n,form:f.n,s,len:f.c.core})}
 const list=[...best.values()].sort((a,b)=>b.s-a.s);return{free:fr.score,freeText:fr.text,list,T:m.T}}
/* Решение по отрыву (натуральные логарифмы правдоподобия):
   gapFree = лучший − свободное прочтение (≈0, если картинка и есть это название; сильно меньше 0 — на картинке другой текст);
   gap2 = лучший − второй.
   auto — блюдо подставляется само («по нейросети»); suggest — до 3 вариантов одним нажатием; none — блюда нет в справочнике (текст не трогаем). */
const CFG={autoFree:-4,autoGap:6,autoGapFill:9,sugFree:-14,sugGap:1.5};
/* «начинки»: два названия отличаются одним-двумя значимыми словами (краб/креветка, «с угрём»/«с тунцом») — для автоподстановки нужен больший отрыв */
const words=n=>nrm(n).replace(/[^а-яa-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=3);
function siblings(a,b){const A=words(a),B=words(b),sa=new Set(A),sb=new Set(B),da=A.filter(w=>!sb.has(w)),db=B.filter(w=>!sa.has(w));return da.length+db.length>0&&da.length<=2&&db.length<=2&&A.length-da.length>=1}
function decide(r,cfg){cfg={...CFG,...(cfg||{})};const b=r.list[0],s=r.list[1];if(!b)return{dec:'none',gapFree:-Infinity,gap2:0,cands:[]};
 const gapFree=b.s-r.free,gap2=s?b.s-s.s:99,fill=s&&siblings(b.n,s.n),need=fill?cfg.autoGapFill:cfg.autoGap;
 const cands=r.list.filter(x=>x.s-r.free>=cfg.sugFree&&b.s-x.s<=8).slice(0,3);
 let dec='none';if(gapFree>=cfg.autoFree&&gap2>=need)dec='auto';else if(gapFree>=cfg.sugFree&&cands.length)dec='suggest';
 return{dec,name:b.n,d:b.d,gapFree:+gapFree.toFixed(2),gap2:+Math.min(gap2,99).toFixed(2),fill:!!fill,cands:cands.map(x=>({n:x.n,s:+(x.s-r.free).toFixed(2)})),free:r.freeText}}
/* несколько прочтений одной строки (разные вырезы): оценки блюд усредняются относительно свободного прочтения каждого варианта */
function mergeRanks(rs){rs=rs.filter(Boolean);if(rs.length===1)return rs[0];const acc=new Map();
 rs.forEach(r=>{r.list.forEach(x=>{const e=acc.get(x.d)||{d:x.d,n:x.n,form:x.form,len:x.len,v:[]};e.v.push(x.s-r.free);acc.set(x.d,e)})});
 const n=rs.length,list=[...acc.values()].map(e=>{const miss=n-e.v.length;return{d:e.d,n:e.n,form:e.form,len:e.len,s:(e.v.reduce((a,b)=>a+b,0)+miss*-40)/n}}).sort((a,b)=>b.s-a.s);
 return{free:0,freeText:rs[0].freeText,list,T:rs[0].T,variants:n}}
return{ALPHA,R,colOf,colMap,reduce,compile,graph,forward,concat,slice,greedy,freeScore,qtyScores,qtyPick,index,rank,decide,mergeRanks,siblings,CFG,FLOOR}});
