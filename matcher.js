/* GONER PACK 010: сопоставление названий блюд из OCR со справочником.
   Методы: (1) нормализация (регистр, ё/й, латиница/цифры/значки, похожие на буквы, пробелы и знаки);
   (2) взвешенное расстояние Левенштейна: типичные OCR-путаницы (у/ч, и/н, е/с, @/е ...) стоят дёшево;
   (3) токен-сходство без учёта порядка слов, с учётом слитых/разорванных слов; (4) алиасы.
   ГЛАВНОЕ ПРАВИЛО: неизвестное блюдо нельзя превращать в похожее известное. Поэтому автоматическая замена («высокая уверенность»)
   допустима только если каждое значимое слово названия нашло пару, числа совпали, а ближайший кандидат заметно лучше остальных.
   Всё остальное — предложение (нужно подтверждение) или «нет в справочнике» (остаётся исходный текст OCR). */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.GPM=m})(typeof self!=='undefined'?self:this,function(){
const LAT={a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у',i:'и',u:'и',n:'п',r:'г',l:'1',d:'д',z:'з',s:'с',w:'ш',v:'в',g:'д',f:'ф',q:'д',j:'й'};
const FN=new Set(['с','со','по','из','на','и','в','во','без','для','от','к','у','а','о']);               // служебные слова: вес мал
/* цена замены символов, которые OCR путает визуально (симметрично). 1 — обычная ошибка. */
const PAIRS=[['у','ч',.35],['и','н',.4],['и','п',.4],['н','п',.4],['ш','щ',.35],['ш','и',.6],['ь','ы',.4],['ь','ъ',.3],['е','с',.5],['о','с',.5],['о','а',.5],['а','я',.6],['в','б',.5],['г','т',.45],['л','д',.5],['л','п',.5],['ц','щ',.4],['ц','и',.6],['э','е',.4],['э','з',.4],['е','ё',.05],['и','й',.1],['т','п',.5],['ч','г',.6],['ч','к',.7],['к','х',.6],['р','г',.6],['о','э',.5],['н','ч',.7],['у','у',0],['з','в',.5],['б','о',.6],['д','а',.6],['ы','ь',.4],['ю','о',.5]];
const SUB=new Map();PAIRS.forEach(([a,b,c])=>{SUB.set(a+b,c);SUB.set(b+a,c)});
const isSym=c=>{const k=c.charCodeAt(0);return!(k>=1072&&k<=1103||k===1105||k>=48&&k<=57||k>=97&&k<=122)};
function subCost(a,b){if(a===b)return 0;const p=SUB.get(a+b);if(p!==undefined)return p;
 if(isSym(a)||isSym(b)){const o=isSym(a)?b:a;return/[аеоисз]/.test(o)?.35:.8}   // значок вроде @ © $ ≈ «какая-то буква»
 if(/\d/.test(a)||/\d/.test(b))return 1;return 1}
const insCost=c=>isSym(c)?.3:1;
function wlev(a,b){const m=a.length,n=b.length;if(!m)return b.split('').reduce((s,c)=>s+insCost(c),0);if(!n)return a.split('').reduce((s,c)=>s+insCost(c),0);
 let p=new Array(n+1);p[0]=0;for(let j=1;j<=n;j++)p[j]=p[j-1]+insCost(b[j-1]);
 for(let i=1;i<=m;i++){const c=new Array(n+1);c[0]=p[0]+insCost(a[i-1]);for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+insCost(a[i-1]),c[j-1]+insCost(b[j-1]),p[j-1]+subCost(a[i-1],b[j-1]));p=c}return p[n]}
const SC=new Map();
const sim=(a,b)=>{if(a===b)return 1;const k=a+'\u0001'+b;let v=SC.get(k);if(v!==undefined)return v;const L=Math.max(a.length,b.length);v=L?Math.max(0,1-wlev(a,b)/L):1;if(SC.size>40000)SC.clear();SC.set(k,v);return v};
/* ---- нормализация ---- */
function tokens(s){let t=String(s==null?'':s).toLowerCase().replace(/ё/g,'е').replace(/й/g,'и').replace(/[©®]/g,'с').replace(/\bbl/g,'ы').replace(/(?<=[а-я])bl/g,'ы');
 t=t.replace(/(\d)[.,](\d)/g,'$1_$2');                                                          // «0,3» не разрываем
 return t.split(/[\s.,;:!?"'«»()\[\]\-–—_\/\\|<>+=]+/).filter(Boolean).map(w=>{const cyr=(w.match(/[а-я]/g)||[]).length,lat=(w.match(/[a-z]/g)||[]).length;
  if(/^\d+_?\d*$/.test(w))return w.replace('_','');
  let x=w.replace(/_/g,'');if(cyr+lat>=2){x=x.replace(/[a-z]/g,c=>LAT[c]||c);if(cyr>=1||lat>=2)x=x.replace(/0/g,'о').replace(/3/g,'з').replace(/6/g,'б').replace(/4/g,'ч')}
  return x}).filter(Boolean)}
const joined=ts=>ts.join('');
const isNum=t=>/^\d+$/.test(t),content=t=>t.length>=4&&!isNum(t)&&!FN.has(t),weight=t=>FN.has(t)?.3:isNum(t)?2:Math.max(2,t.length);
/* ---- сходство двух наборов слов ---- */
function tokenScore(q,e){ // q, e — массивы слов. Жадное парное сопоставление по убыванию сходства + пробуем склеить соседние слова
 const pairs=[];q.forEach((a,i)=>e.forEach((b,j)=>pairs.push([sim(a,b),i,j])));pairs.sort((x,y)=>y[0]-x[0]);
 const uq=new Set(),ue=new Set(),match=[];for(let[s,i,j]of pairs){if(uq.has(i)||ue.has(j))continue;let pre=false;const a=q[i],b=e[j];if(a.length>=4&&b.length>a.length&&b.startsWith(a)&&!isNum(a)){const ps=.6+.3*a.length/b.length;if(ps>s){s=ps;pre=true}}if(s<.5)continue;uq.add(i);ue.add(j);match.push({i,j,s,pre})}
 let num=0,den=0;match.forEach(m=>{const w=Math.max(weight(q[m.i]),weight(e[m.j]));num+=m.s*w;den+=w});
 const lq=q.map((t,i)=>uq.has(i)?0:weight(t)),le=e.map((t,j)=>ue.has(j)?0:weight(t));den+=lq.reduce((a,b)=>a+b,0)+le.reduce((a,b)=>a+b,0);
 const missQ=q.filter((t,i)=>!uq.has(i)&&content(t)),missE=e.filter((t,j)=>!ue.has(j)&&content(t));
 const weak=match.filter(m=>content(q[m.i])&&(m.s<.7||m.pre)).length;                                   // значимое слово нашло «пару», но плохую
 const qn=q.filter(isNum),en=e.filter(isNum),numBad=qn.length!==en.length||qn.some(t=>!en.includes(t)),numClash=qn.length>0&&en.length>0&&numBad;
 return{score:den?num/den:0,missQ,missE,weak,numBad,numClash,perm:match.length>1&&match.length===q.length&&match.length===e.length&&match.every(m=>m.s>=.999)&&match.some(m=>m.i!==m.j)}}
function compare(qt,et){const a=tokenScore(qt,et),qs=joined(qt),es=joined(et),cs=sim(qs,es),d=wlev(qs,es);
 // схема: если слова не совпали пословно, но совпали «слитно» (потерян/лишний пробел) — доверяем символьному сходству
 const useChar=cs>a.score&&!a.missQ.length&&!a.missE.length&&!a.weak||cs>a.score&&cs>=.9&&!a.numBad;
 return{score:Math.max(a.score,useChar?cs:0),tok:a,char:cs,dist:d,len:Math.max(qs.length,es.length),spaced:useChar&&cs>a.score&&qt.length!==et.length}}
/* ---- справочник ---- */
function index(dict){return dict.map((d,i)=>{const names=[d.n,...(d.a||[])],forms=names.map(n=>({n,t:tokens(n)})).filter(x=>x.t.length);return{i,d,forms}}).filter(x=>x.forms.length)}
const exactKey=ts=>joined(ts);
/* match(raw, idx): → {st:'o'|'s'|'u', name, d, score, how, alts:[{n,score}], note}
   o — в справочнике (точно или с высокой уверенностью), можно показывать исправленное название без подтверждения;
   s — похоже на запись справочника, но уверенности недостаточно: исходный текст остаётся, нужен один тап;
   u — в справочнике нет (или текст слишком искажён): остаётся исходный текст OCR. */
function match(raw,idx){const qt=tokens(raw),R={st:'u',score:0,alts:[],how:'',raw:String(raw||'')};if(!qt.length||!idx||!idx.length)return R;
 const qk=exactKey(qt),res=[];
 for(const e of idx){let best=null;for(const f of e.forms){const ek=exactKey(f.t);let c;
   if(ek===qk)c={score:1,exact:true,tok:{missQ:[],missE:[],weak:0,numBad:false,numClash:false,perm:false},dist:0,len:ek.length,form:f};
   else{c=compare(qt,f.t);c.form=f}
   if(!best||c.score>best.score)best=c}
  res.push({e,c:best})}
 res.sort((a,b)=>b.c.score-a.c.score);
 R.alts=res.slice(0,4).filter(x=>x.c.score>=.5).map(x=>({n:x.e.d.n,score:+x.c.score.toFixed(3)}));
 const top=res[0],second=res[1],c=top.c,margin=c.score-(second?second.c.score:0);R.score=+c.score.toFixed(3);R.margin=+margin.toFixed(3);R.d=top.e.d;
 if(c.exact){R.st='o';R.name=top.e.d.n;R.how=c.form.n===top.e.d.n?'exact':'alias';
  // два РАЗНЫХ блюда с одинаковым ключом — неоднозначно
  if(res.filter(x=>x.c.exact&&x.e.d!==top.e.d).length){R.st='s';R.how='ambiguous'}return R}
 const t=c.tok,tol=.18*c.len+.3;
 const strict=!t.missQ.length&&!t.missE.length&&!t.weak&&!t.numBad;                          // каждое значимое слово получило пару, числа совпали
 const dishyNear=strict&&(c.perm||t.perm?true:c.dist<=tol);
 if(dishyNear&&c.score>=.88&&margin>=.08){R.st='o';R.name=top.e.d.n;R.how=t.perm?'order':c.spaced?'spacing':'fuzzy';return R}
 const sugMin=!t.missQ.length&&t.missE.length?.65:.72;
 if(c.score>=sugMin&&!t.numClash&&(t.weak===0||c.score>=.85||t.weak<=1&&!t.missQ.length)){R.st='s';R.name=top.e.d.n;R.how=t.missQ.length||t.missE.length?'partial':'similar';
  if(margin<.05)R.note='несколько похожих записей: выберите из списка';return R}
 R.how='none';return R}
/* подозрение, что текст — мусор OCR, а не название: значки, смесь регистров, цифры внутри слов, одиночные буквы */
function garbled(raw){const s=String(raw||'');const w=s.split(/\s+/).filter(Boolean);let bad=0;
 w.forEach(x=>{if(/[@©®$#%^&*<>|\\~`=_]/.test(x))bad++;else if(/[а-яё]/i.test(x)&&/\d/.test(x)&&!/^\d/.test(x))bad++;else if(/[а-яё][А-ЯЁ]/.test(x)&&/[а-яё]/.test(x.slice(1))&&!/^[А-ЯЁ]{2,}$/.test(x))bad++;else if(/[a-z]/i.test(x)&&/[а-яё]/i.test(x))bad++});
 return bad>0?bad:0}
/* поиск по справочнику для ручного исправления: подстрока, затем нечёткое сходство слов */
function search(q,idx,limit){limit=limit||8;const qt=tokens(q);if(!qt.length)return[];const qs=joined(qt),out=[];
 for(const e of idx){let best=0;for(const f of e.forms){const es=joined(f.t);let s=0;
   if(es.includes(qs))s=.95+Math.min(.05,qs.length/es.length*.05);
   else{const c=compare(qt,f.t);s=c.score;let num=0,den=0;for(const t of qt){const w=weight(t);den+=w;num+=w*Math.max(...f.t.map(x=>Math.max(sim(t,x),x.length>t.length&&x.startsWith(t)?.9:0,x.length>t.length?sim(x.slice(0,t.length),t)*.9:0)))}
    s=Math.max(s,den?num/den*.92:0)}
   if(s>best)best=s}
  if(best>=.5)out.push({n:e.d.n,c:e.d.c,score:best,d:e.d})}
 return out.sort((a,b)=>b.score-a.score||a.n.localeCompare(b.n,'ru')).slice(0,limit)}
return{tokens,wlev,sim,index,match,search,garbled,compare}});
