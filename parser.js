/* GONER PACK 012 (на базе 011): разбор текста чека по блокам (шапка / приборы / «повару» / таблица / итоги / реклама).
   Работает в браузере (window.GP) и в Node (тесты). Позиции берутся ТОЛЬКО из таблицы между
   заголовком «Наименование / Кол-во / Сумма» и первой строкой итогов; всё остальное не может стать блюдом. */
(function(root,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else root.GP=m})(typeof self!=='undefined'?self:this,function(){
const LK={a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у'};
const cyr=s=>String(s).toLowerCase().replace(/ё/g,'е').replace(/[a-z]/g,c=>LK[c]||c);
const norm=s=>cyr(s).replace(/[^а-я0-9]/g,'');
function lev(a,b){const m=a.length,n=b.length;let p=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
const words=l=>cyr(l).split(/[^а-я0-9]+/).filter(Boolean);
const has=(l,w,d)=>words(l).some(x=>Math.abs(x.length-w.length)<=d&&lev(x,w)<=d);
const letters=l=>(l.match(/[а-яёa-z]/gi)||[]).length;
const wordlike=l=>{const c=l.replace(/\s/g,'').length,a=(l.match(/[а-яёa-z0-9]/gi)||[]).length;return c>0&&a/c>=.6&&letters(l)>=2};
const fixTok=t=>{if(!/\d/.test(t))return null;const s=t.replace(/[OoОо]/g,'0').replace(/[lIІ|!]/g,'1').replace(',','.');return/^\d+(\.\d+)?$/.test(s)?s:null};
const qtyStrict=s=>/^\d{1,2}(\.0)?$/.test(s)&&+s>=1;
const qtyLike=s=>/^\d{1,2}(\.0+)?$/.test(s)&&+s>=1&&+s<=99,moneyLike=s=>/^\d{1,6}(\.\d{1,2})?$/.test(s),near=(a,b,e=.015)=>Math.abs(a-b)<=e;
const intQty=s=>{const m=String(s).match(/^(\d{1,3})(?:[.,]0+)?$/);return m?+m[1]:null};
const CUT=/^(?:палочк|ложк|нож|вилк|прибор)/i;
const isTH=l=>has(l,'наименование',3)||(has(l,'сумма',2)&&(has(l,'кол',1)||has(l,'колв',2)||has(l,'количество',3)));
const isPay=l=>has(l,'оплате',2);
const isTot=l=>has(l,'итог',1)||has(l,'итого',1)||(has(l,'сумма',2)&&(has(l,'счета',2)||has(l,'скидки',2)))||has(l,'скидки',2)||has(l,'счета',1)||has(l,'экономия',2);
const cutName=l=>{const w=words(l);if(has(l,'нож',1)&&has(l,'вилка',2))return'Нож и вилка';for(const[k,n]of[['палочки','Палочки'],['палочка','Палочки'],['ложки','Ложка'],['ложка','Ложка'],['вилки','Вилка'],['вилка','Вилка'],['ножи','Нож'],['нож','Нож'],['приборы','Приборы'],['прибор','Приборы']])if(w.some(x=>Math.abs(x.length-k.length)<=2&&lev(x,k)<=(k.length>5?2:k.length>=5?1:0)))return n;return''};
const sentence=s=>{const t=s.trim();if(!t)return t;const odd=t.split(' ').some(w=>/[а-яёa-z]/.test(w.slice(1))&&/[А-ЯЁA-Z]/.test(w.slice(1))),allUp=t===t.toUpperCase()&&/[А-ЯЁ]{3}/.test(t),mix=/[а-яё]/.test(t)&&t.split(' ').some(w=>/^[А-ЯЁ]{3,}$/.test(w));return odd||allUp||mix?t.charAt(0).toUpperCase()+t.slice(1).toLowerCase():t};
const glyph=s=>s.replace(/(^|\s)\((?=[а-яё]{2})/gi,(m,a)=>a+'С');
const lead=s=>{const t=s.split(' ');let k=0;while(k<t.length-1&&k<5&&(letters(t[k])<2||letters(t[k])<3&&/[^а-яёa-z]/i.test(t[k]))&&t.slice(k+1).some(x=>letters(x)>=3))k++;return{name:t.slice(k).join(' '),cut:k>0}};
const clean=s=>s.replace(/^[^а-яёa-z0-9«"(]+|[^а-яёa-z0-9»")]+$/gi,'').replace(/\s+/g,' ').trim();
/* «похоже на название блюда»: не мусор OCR (длинные слитные цепочки, ряды гласных/согласных) */
function nameish(l){if(String(l).split(/\s+/).some(x=>x.length>=8&&(x.match(/[а-яё][А-ЯЁ]/g)||[]).length>=2))return false;const w=cyr(l).split(/[^а-я]+/).filter(Boolean),L=w.join('').length;if(!L)return false;let good=0,big=0;
 for(const x of w){if(x.length>16)continue;if(x.length>=3){const v=(x.match(/[аеёиоуыэюя]/g)||[]).length;if(v===0||v/x.length<.2||v/x.length>.75||/[аеёиоуыэюя]{5,}/.test(x)||/[^аеёиоуыэюяйьъ]{6,}/.test(x))continue;if(x.length>=4)big++}good+=x.length}
 return big>0&&good/L>=.6}
/* слова шапки/рекламы: название ресторана, «онлайн-касса», «японская & европейская кухня» — не могут быть частью названия блюда */
const hdrish=l=>has(l,'кухня',1)||has(l,'европейская',3)||has(l,'касса',1)||has(l,'онлайн',2)||has(l,'евразия',2)||/&/.test(l);
const money=l=>{const m=[...l.matchAll(/(\d{1,6}[.,]\d{2})(?!\d)/g)];return m.length?parseFloat(m[m.length-1][1].replace(',','.')):null};
/* 013: нейросеть иногда ставит в номере похожую букву вместо цифры («104З362», «1О4З362»): в токенах, где ≥4 цифр, буквы-двойники заменяются цифрами */
const DIG={'О':'0','о':'0','O':'0','o':'0','З':'3','з':'3','б':'6','Б':'6','I':'1','l':'1','|':'1','В':'8','B':'8','S':'5','Ч':'4'};
const digFix=l=>String(l).replace(/[0-9ОоOoЗзбБIl|ВBSЧ]{6,12}/g,t=>(t.match(/\d/g)||[]).length>=4?t.replace(/[^0-9]/g,c=>DIG[c]||c):t);
const pickNo=l=>{l=digFix(l);const m=[...l.matchAll(/(?<![\d.:,])\d{4,10}(?![\d]|[.:,]\d)/g)].map(x=>x[0]);if(m.length)return m.sort((a,b)=>b.length-a.length)[0];const s=l.match(/(\d[\d ]{3,12}\d)(?![.:]\d)/);return s&&!/[.:]/.test(l)?s[1].replace(/ /g,''):''};
/* Строка таблицы: якорь — ближайшая к правому краю пара «количество + сумма с 2 знаками» (или «количество, цена, сумма»).
   Всё правее якоря считается шумом OCR (рамка, фон), всё левее — названием. */
const PFX=/^[{(\[‚,'`"«‘’„|\\]+/;
function qtyTok(x){const r=x.replace(PFX,'');let m;
 if((m=r.match(/^(\d{1,2})[.,]0$/)))return{q:+m[1],g:false};
 if((m=r.match(/^([1-9])[4]?0$/))&&r!=='40')return{q:+m[1],g:true};                    // «10», «140» — это «1.0»
 if(PFX.test(x)&&/^[.,]?0$/.test(r))return{q:1,g:true};                                     // «‚0», «{0» — потеряна единица
 if(/^[.,]0$/.test(r))return{q:1,g:true};return null}
function sumTok(x){const r=x.replace(PFX,'').replace(/[OoОо]/g,'0');let m;
 if((m=r.match(/^(\d{1,5})[.,](\d{2})[^\d]{0,2}$/)))return{v:+(m[1]+'.'+m[2]),raw:m[1]+'.'+m[2]};
 if((m=r.match(/^(\d{1,5})[.,:;](\d?)\S{0,2}$/)))return{v:null,raw:m[1]+'.'+m[2]};
 return null}
function tolerantRow(t){for(let i=t.length-1;i>=1;i--){const st=sumTok(t[i]);
  if(st){const q=qtyTok(t[i-1]);if(q)return{qty:q.q,qg:q.g,sum:st.v,sumRaw:st.v==null?st.raw:'',start:i-1};
   const g=t[i-1].match(/^[{(\[‚,'`"]?1?[.,]?0(\d{2,4}[.,]\d{2})$/);if(g)return{qty:1,qg:true,sum:+g[1].replace(',','.'),sumRaw:'',start:i-1}}   // «‚070,59»
  const g=t[i].match(/^[{(\[‚,'`"]1?[.,]?0(\d{2,4}[.,]\d{2})\D{0,2}$/);if(g&&i>=1)return{qty:1,qg:true,sum:+g[1].replace(',','.'),sumRaw:'',start:i}}
 return null}
function rowOf(l){const t=l.split(' ').filter(Boolean),F=t.map(x=>fixTok(x.replace(/[;:,]+$/,'')));
 const isSum=x=>x!==null&&/^\d{1,6}\.\d{2}$/.test(x);
 for(let i=t.length-2;i>=0;i--){
  if(F[i]===null||!isSum(F[i+1]))continue;
  let qty,sum,start,d=[];
  if(i>=1&&F[i-1]!==null&&qtyLike(F[i-1])&&isSum(F[i])&&near(+F[i-1]*+F[i],+F[i+1])){qty=+F[i-1];sum=+F[i+1];start=i-1}            // «кол-во цена сумма», цена × кол-во = сумма
  else if(qtyStrict(F[i])){qty=+F[i];sum=+F[i+1];start=i;if(/^[1-9]0$/.test(F[i])&&!/[.,]/.test(t[i])){qty=+F[i][0];d.qg=true}}   // 012: «10» без точки на чеке «Евразии» — почти всегда «1.0» с потерянной точкой                                                                                // «кол-во сумма» (формат с чека Евразии: «1.0 271.89»)
  else if(i>=1&&F[i-1]!==null&&qtyLike(F[i-1])&&isSum(F[i])){qty=+F[i-1];sum=+F[i+1];start=i-1;d.push('сумма не сходится с ценой × количеством')}
  else continue;
  const used=start===i-1?3:2;
  const tail=t.slice(start+used).filter(x=>/[а-яёa-z0-9]{2,}/i.test(x));
  if(tail.length)d.push('справа от суммы есть лишний текст (шум OCR): '+tail.join(' ').slice(0,30));
  if(qty>=10)d.push('количество ≥ 10: проверьте (возможно потерялась точка в «1.0»)');if(d.qg)d.push('количество прочитано неуверенно');
  const raw=t.slice(start,start+used).join(' ');if(/[A-Za-zА-Яа-я|!]/.test(raw))d.push('цифры исправлены после OCR');
  const ln=lead(clean(t.slice(0,start).join(' ')));if(ln.cut)d.push('начало строки очищено от шума OCR');if(/\d{2,}/.test(ln.name))d.push('в названии есть цифры: возможно, слились две строки чека');const gn=glyph(ln.name);if(gn!==ln.name){ln.name=gn;d.push('символ «(» заменён на «С»: проверьте название')}
  return{kind:'row',name:sentence(ln.name),qty,sum,d,qg:!!d.qg,dot:/[.,]/.test(t[start])}}
 /* 012: терпимый вариант для телефона. На чеках «Евразии» количество всегда вида «N.0», а Tesseract.js теряет/искажает его:
    «‚0», «{0», «{1,0», «10», «140» (запятая прочитана как 4), «‚070,59» (количество слиплось с суммой).
    Сумма может быть прочитана частично: «118.0», «21.%», «169:». Строка НЕ теряется: количество помечается как угаданное,
    нечитаемая сумма — как отсутствующая (sum=null, sumRaw), а окончательное значение решается сравнением проходов. */
 const tq=tolerantRow(t);if(tq){const d=[];const ln=lead(clean(t.slice(0,tq.start).join(' ')));if(ln.cut)d.push('начало строки очищено от шума OCR');
  if(tq.qg)d.push('количество прочитано неуверенно');if(tq.sum==null)d.push('сумма не прочитана'+(tq.sumRaw?` (видно «${tq.sumRaw}»)`:''));
  const gn=glyph(ln.name);if(gn!==ln.name){ln.name=gn}if(letters(ln.name)>=3)return{kind:'row',name:sentence(ln.name),qty:tq.qty,sum:tq.sum,sumRaw:tq.sumRaw,qg:tq.qg,d,dot:true}}
 /* запасной вариант: строка заканчивается числами, но без двух знаков в сумме */
 let k=0;while(k<3&&k<t.length&&F[t.length-1-k]!==null)k++;
 if(!k)return{kind:'text'};return{kind:k===1?'one':'bad'}}
function parse(text,meta){
 const RL=String(text).split(/\r?\n/).filter(s=>s.trim()).map(digFix),L=RL.map(s=>s.replace(/\s+/g,' ').trim()),U=new Set(),out={no:'',ex:'',notes:'',items:[],skipped:[],dropped:[],warn:[],check:null,quality:'bad',score:0,tableFound:false};
 /* 1. номер: допускаем ошибки OCR в «ПРЕДЧЕК АДМИН №» */
 let ni=L.findIndex(l=>has(l,'предчек',2)||(has(l,'админ',1)&&/\d/.test(l)));if(ni<0)ni=L.findIndex(l=>has(l,'предчек',3)||has(l,'админ',2));
 if(ni>=0){out.no=pickNo(L[ni])||(/время/.test(cyr(L[ni+1]||''))?'':pickNo(L[ni+1]||''));U.add(ni)}
 if(!out.no)for(let i=0;i<Math.min(15,L.length);i++){if(/время|дата/.test(cyr(L[i])))continue;if(L.slice(i+1,i+4).some(x=>cutName(x)))continue;const n=pickNo(L[i]);if(/^\d{6,8}$/.test(n)){out.no=n;U.add(i);out.warn.push('Номер предчека найден без заголовка «ПРЕДЧЕК АДМИН №»: проверьте его по фото');break}}
 /* 2. границы блоков */
 const th=L.findIndex(isTH);let te=L.length;if(th>=0){out.tableFound=true;U.add(th);for(let i=th+1;i<L.length;i++)if(isTot(L[i])||isPay(L[i])){te=i;break}}
 const inT=i=>th>=0&&i>th&&i<te;
 /* 3. приборы + доп. ID над ними */
 const cuts=[];L.forEach((l,i)=>{if(inT(i)||U.has(i))return;const n=cutName(l);if(!n)return;cuts.push(i);U.add(i);const w=l.split(' ').map(x=>fixTok(x.replace(/^[{(\[‚,'`]+/,'').replace(/[;:,.]+$/,''))).find(x=>x&&qtyLike(x));if(w)out.items.push({name:n,qty:+w,kind:'cutlery',doubt:[]});else if(/[:;]/.test(l))out.items.push({name:n,qty:1,kind:'cutlery',doubt:['количество прибора не прочитано'],qg:true})});
 const exRe=/^(?:\S{1,4}\s+){0,2}\D{0,2}(\d{4,10})\s*[:;.]?\s*$/;
 if(cuts.length){for(let j=cuts[0]-1;j>=Math.max(0,cuts[0]-3);j--){const m=L[j].match(exRe);if(m){out.ex=m[1];U.add(j);out.exPos={line:j,aboveCut:cuts[0]-j,afterNo:ni>=0?j-ni:null};break}}}
 if(!out.ex&&cuts.length)for(let j=cuts[0]-1;j>=Math.max(0,cuts[0]-3);j--){if(U.has(j))continue;const m=L[j].match(/(?<![\d.,])(\d{5,10})\s*[:;](?![\d])/);if(m){out.ex=m[1];U.add(j);out.exPos={line:j,aboveCut:cuts[0]-j,afterNo:ni>=0?j-ni:null};break}}
 if(!out.ex)for(let i=0;i<(th>=0?th:L.length);i++){const m=L[i].match(/^(\d{5,10})\s*:\s*$/);if(m&&!U.has(i)){out.ex=m[1];U.add(i);break}}
 /* 4. комментарий повару */
 const ck=L.findIndex(l=>has(l,'повару',2));
 if(ck>=0){U.add(ck);const nt=[],r=L[ck].replace(/^[^:]*:/,'').trim();if(r&&wordlike(r))nt.push(r);
  for(let i=ck+1;i<L.length&&!isPay(L[i])&&!isTH(L[i])&&!isTot(L[i])&&!(th>=0&&i>=th);i++){if(U.has(i))break;if(!wordlike(L[i])){if(nt.length){U.add(i);break}continue}nt.push(L[i]);U.add(i)}
  out.notes=nt.join(' ')}
 /* 5. таблица позиций */
 const rows=[];let pend='',pendL=-1,prev=null;const flush=()=>{if(pend){out.skipped.push({line:pend,why:'строка без количества'});pend=''}};
 const lo=th>=0?th+1:0,hi=th>=0?te:L.length;
 const FN_END=/(?:^|\s)(?:с|со|из|на|по|и|в|без|для|от)$/i;
 /* шум слева: «Же | горячий…», «ий      ТОРИ пицца маки», «нь     Киото маки» — короткий обрывок, отделённый «|» или большим пробелом */
 function tclean(raw){let x=String(raw).trim();const bar=x.match(/^(.{0,8}?)\|\s*(.+)$/);if(bar&&letters(bar[1])<=3)x=bar[2];
  const seg=x.split(/\s{3,}/);if(seg.length>1&&letters(seg[0])<=3&&!/\d[.,]\d/.test(seg[0])&&letters(seg.slice(1).join(' '))>=4)x=seg.slice(1).join('   ');return x.replace(/\s+/g,' ').trim()}
 /* продолжение названия на следующей строке: «СЫРНОМ СОУСЕ», «в сырном соусе», «(5 шт)». Без чисел, не мусор, не шапка. */
 function contOf(raw,pn){const ps=String(raw).match(/\(\s*(\d{1,2})\s*(?:шт|ШТ|Шт|[ТтTШшWw]{1,2})\.?\s*\)?/);if(ps&&letters(String(raw).replace(ps[0],''))<=4)return`(${ps[1]} шт)`;
  const segs=String(raw).split(/\s{3,}/).map(z=>z.trim()).filter(Boolean);let seg=segs.find(z=>nameish(z.replace(/^\S{1,3}\s+(?=\S{3})/,'')));if(!seg)return'';
  let w=seg.split(/\s+/);const PRE=/^(в|во|с|со|на|из|и|без)$/i;
  while(w.length&&!PRE.test(w[0])&&(letters(w[0])<3||/[^а-яёa-z.,]/i.test(w[0].replace(/[.,]$/,''))))w.shift();
  const bad=w.findIndex(z=>/[^а-яёa-z]/i.test(z.replace(/[^а-яёa-z]+$/i,'')));if(bad>=0)w=w.slice(0,bad);
  w=w.map(z=>z.replace(/[^а-яёa-z]+$/i,'')).filter(Boolean);if(!w.length||w.length>5)return'';const tx=w.join(' ');
  if(!nameish(tx)||hdrish(tx)||isTot(tx)||isPay(tx)||isTH(tx)||cutName(tx))return'';
  const ok=FN_END.test(pn)||PRE.test(w[0])||/^[а-яё]/.test(tx);if(!ok)return'';return tx.toLowerCase()}
 for(let i=lo;i<hi;i++){if(U.has(i))continue;const l=th>=0?tclean(RL[i]):L[i];if(!l)continue;
  const ct=prev&&!pend&&th>=0&&!/\d\s*[.,:;]\s*\d/.test(RL[i])&&rowOf(l).kind!=='row'?contOf(RL[i],prev.name):'';if(ct){U.add(i);prev.name=(prev.name+' '+ct).replace(/\s+/g,' ');if(!prev.doubt.includes('перенос названия'))prev.doubt.push('перенос названия');prev.cont=(prev.cont||0)+1;(prev.src=prev.src||[prev.line]).push(i);continue}
  if(th<0&&(isTot(l)||isPay(l)||/\d{2}\.\d{2}\.\d{2,4}|\d{1,2}:\d{2}/.test(l)))continue;
  if(!wordlike(l))continue;const r=rowOf(l);
  if(r.kind==='text'){ /* строка без чисел: часть названия только внутри таблицы, не мусор и не шапка/реклама; без найденного заголовка таблицы фрагменты не склеиваются вообще */
   const okTxt=th>=0&&nameish(l)&&!hdrish(l);if(!okTxt)continue;U.add(i);
   if(prev&&/^[а-яёa-z]/.test(l)&&!pend&&!/\d.*\d/.test(l)&&l.split(' ').length<=6){prev.name+=' '+clean(l);(prev.src=prev.src||[prev.line]).push(i);if(!prev.doubt.includes('перенос названия'))prev.doubt.push('перенос названия')}else if(words(l).some(x=>x.length>=4)&&/[а-яё]{3}/i.test(l)){flush();pend=lead(clean(l)).name;pendL=i}continue}
  if(th<0&&(r.kind!=='row'))continue;                                                  // вне таблицы строка без «количество + сумма» — не позиция и не «пропущенная строка»
  U.add(i);
  if(r.kind!=='row'||letters(r.name)<3&&!pend){flush();out.skipped.push({line:clean(l),why:'не удалось определить количество и сумму'});prev=null;continue}
  if(hdrish(r.name)&&!pend){out.skipped.push({line:clean(l),why:'похоже на шапку или рекламу'});prev=null;continue}
  let nm=r.name;const d=[...r.d];let src=[i];
  if(pend){const glue=/^[а-яё]/.test(r.name)||FN_END.test(pend);if(glue&&!hdrish(pend)){nm=pend+' '+r.name;d.push('перенос названия');src=[pendL,i]}else out.skipped.push({line:pend,why:'начало названия без количества'});pend=''}
  if(th<0)d.push('таблица позиций не найдена: проверьте строку');
  prev={name:nm,qty:r.qty,kind:CUT.test(nm)?'cutlery':'dish',doubt:d,sum:r.sum,dot:r.dot};if(r.sumRaw)prev.sumRaw=r.sumRaw;if(r.qg)prev.qg=true;prev.line=i;prev.src=src;if(meta&&meta.lineY&&meta.lineY[i]!=null)prev.y=meta.lineY[i];rows.push(prev)}
 flush();
 const dots=rows.filter(r=>r.dot).length;if(dots&&dots>=rows.length/2)rows.forEach(r=>{if(!r.dot)r.doubt.push('количество без «.0»: возможна ошибка OCR')});
 out.items.push(...rows.map(({dot,...r})=>r));
 /* 6. сверка итога. Итог напечатан несколько раз («к оплате» сверху, «Сумма счёта», «Итог», «к оплате» снизу):
    собираем все прочтения; если сумма позиций совпала хотя бы с одним — позиции согласованы с чеком. */
 const cand=[];L.forEach((l,i)=>{if(i<te&&!(isPay(l)&&(th<0||i<th)))return;if(isPay(l)||has(l,'итог',1)||has(l,'итого',1)||(has(l,'сумма',2)&&(has(l,'счета',2)||has(l,'скидки',2)))){const m=money(l);if(m!==null&&m>0)cand.push(m)}});
 const votes={};cand.forEach(v=>{const k=v.toFixed(2);votes[k]=(votes[k]||0)+1});
 const sum=rows.reduce((a,r)=>a+(r.sum||0),0),best=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];
 if(cand.length&&rows.length){const ok=cand.some(v=>near(sum,v,.02));out.check={sum:+sum.toFixed(2),total:ok?+sum.toFixed(2):+best[0],readings:cand,ok};
  if(ok&&th<0)out.items.forEach(r=>{r.doubt=r.doubt.filter(x=>!x.startsWith('таблица позиций не найдена'))});
  if(!ok)out.warn.push(`Сумма позиций ${sum.toFixed(2)} не сходится с итогом чека (прочитано: ${[...new Set(cand.map(v=>v.toFixed(2)))].join(', ')}). Возможно, потеряна строка или неверно прочитана цифра. Сверьте с фото.`)}
 /* 7. объединение повторов */
 const mg=[];out.items.forEach(x=>{const key=x.kind+norm(x.name),y=mg.find(z=>z.key===key);if(y){y.qty+=x.qty;y.sum=+((y.sum||0)+(x.sum||0)).toFixed(2);y.dup=(y.dup||1)+1;x.doubt.forEach(d=>y.doubt.includes(d)||y.doubt.push(d))}else mg.push({...x,key})});
 out.items=mg.map(({key,...r})=>r).sort((a,b)=>(a.kind==='cutlery')-(b.kind==='cutlery'));
 out.dropped=L.filter((l,i)=>!U.has(i));
 const dish=out.items.some(x=>x.kind==='dish');
 out.quality=out.no&&out.tableFound&&dish&&out.check&&out.check.ok?'good':out.no&&out.items.length?'ok':'bad';
 const dsh=out.items.filter(x=>x.kind==='dish'),okN=dsh.filter(x=>nameish(x.name)&&!hdrish(x.name)),clr=okN.filter(x=>!x.doubt.length).length;
 out.score=(out.no?30:0)+(out.tableFound?30:0)+(out.check?(out.check.ok?70:-25):0)+(out.ex?8:0)+clr*6+(okN.length-clr)*3-(dsh.length-okN.length)*15-out.skipped.length*8;
 return out}
/* Пересборка строк по геометрии слов: слова одной визуальной строки (близкий y) склеиваются слева направо,
   даже если OCR разнёс их по разным строкам/блоками (так теряются количество и сумма рядом с названием). */
function linesFromWords(words){const W=(words||[]).filter(w=>w&&String(w.text).trim()&&w.y1>w.y0&&w.x1>w.x0);if(!W.length)return{text:'',lines:[],H:0};
 const hs=W.map(w=>w.y1-w.y0).sort((a,b)=>a-b),H=hs[hs.length>>1]||10,lines=[];
 for(const w of[...W].sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1))){const yc=(w.y0+w.y1)/2,big=w.y1-w.y0>=.6*H,L=lines[lines.length-1];
  if(L&&Math.abs(yc-L.yc)<=.62*H){L.w.push(w);if(big){L.n++;L.yc+=(yc-L.yc)/L.n}}else lines.push({w:[w],yc,n:big?1:0.5})}
 lines.forEach(L=>{L.w.sort((a,b)=>a.x0-b.x0);L.x0=L.w[0].x0;L.x1=Math.max(...L.w.map(x=>x.x1));L.y0=Math.min(...L.w.map(x=>x.y0));L.y1=Math.max(...L.w.map(x=>x.y1));L.text=L.w.map(x=>String(x.text).trim()).join(' ')});
 return{text:lines.map(l=>l.text).join('\n'),lines,H}}
/* разбор текста одной таблицы (проход по полосе между заголовком и итогами): добавляем служебные строки, чтобы действовали все правила таблицы */
const parseTable=text=>parse('Наименование Кол-во Сумма\n'+String(text||'').trim()+'\nИтого');
/* «мягкие» пометки (перенос названия, очистка начала строки, разные прочтения названия) не требуют подтверждения, если название найдено в справочнике */
const SOFT=/^(перенос названия|начало строки очищено|проходы OCR прочитали название по-разному|цифры исправлены|символ «\(» заменён|справа от суммы есть лишний текст|сумма \d+\.\d+ выбрана из прочтений)/;
const hard=x=>(x.doubt||[]).filter(d=>!(x.st==='o'&&SOFT.test(d)));
const needsOk=(x,on)=>!!(hard(x).length||(on&&x.kind!=='cutlery'&&x.st!=='o'));
/* 018: заказ по чеку определяется ТОЛЬКО ID заказа (доп. ID — число с двоеточием над приборами). Номер предчека необязателен.
   Навынос по скриншоту — по-прежнему номер заказа. */
function validate(d,on){const er=[],shot=d.origin==='screenshot',no=String(d.no||'').trim(),ex=String(d.ex||'').trim();
 if(shot){if(!/^\d+$/.test(no))er.push('Укажите номер заказа (только цифры)')}
 else{if(!/^\d+$/.test(ex))er.push('Укажите ID заказа (только цифры) — число с двоеточием над приборами');if(no&&!/^\d+$/.test(no))er.push('Номер предчека: только цифры (можно оставить пустым)')}
 if(!d.items.length)er.push('Добавьте хотя бы одну позицию');
 d.items.forEach((x,i)=>{if(!String(x.name).trim())er.push(`Позиция ${i+1}: нет названия`);if(!Number.isInteger(x.qty)||x.qty<1||x.qty>99)er.push(`Позиция ${i+1}: количество должно быть целым числом от 1 до 99`)});
 const u=d.items.filter(x=>needsOk(x,on)&&!x.cf).length;if(u)er.push(`Подтвердите сомнительные позиции: ${u}`);
 if((d.skipped||[]).length)er.push(`Разберите строки таблицы, не вошедшие в позиции: ${d.skipped.length}`);
 if((d.warn||[]).length&&!d.warnOk)er.push('Прочитайте предупреждения и подтвердите, что сверили чек с фото');return er}
/* номер предчека из короткого текста (полоса заголовка): строка со словом «предчек/админ», иначе единственное длинное число */
function numberFrom(text){const L=String(text).split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),i=L.findIndex(l=>has(l,'предчек',3)||has(l,'админ',2));if(i>=0){const n=pickNo(L[i]);if(n)return n}
 const c=L.filter(l=>!/время|дата|\d{2}\.\d{2}\.\d{2,4}/i.test(l)).map(pickNo).filter(n=>/^\d{6,8}$/.test(n));return c.length===1?c[0]:''}
return{digFix,cutName,nameish,hdrish,hard,parse,parseTable,linesFromWords,isTH,isTot,isPay,validate,needsOk,norm,intQty,lev,numberFrom,has,cyr}});
