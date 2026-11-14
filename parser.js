/* GONER PACK 010 (на базе 009): разбор текста чека по блокам (шапка / приборы / «повару» / таблица / итоги / реклама).
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
const cutName=l=>{const w=words(l);for(const[k,n]of[['палочки','Палочки'],['палочка','Палочки'],['ложки','Ложки'],['ложка','Ложки'],['вилки','Вилки'],['вилка','Вилки'],['ножи','Ножи'],['приборы','Приборы'],['прибор','Приборы']])if(w.some(x=>Math.abs(x.length-k.length)<=2&&lev(x,k)<=(k.length>5?2:1)))return n;return''};
const sentence=s=>{const t=s.trim();if(!t)return t;const odd=t.split(' ').some(w=>/[а-яёa-z]/.test(w.slice(1))&&/[А-ЯЁA-Z]/.test(w.slice(1))),allUp=t===t.toUpperCase()&&/[А-ЯЁ]{3}/.test(t),mix=/[а-яё]/.test(t)&&t.split(' ').some(w=>/^[А-ЯЁ]{3,}$/.test(w));return odd||allUp||mix?t.charAt(0).toUpperCase()+t.slice(1).toLowerCase():t};
const glyph=s=>s.replace(/(^|\s)\((?=[а-яё]{2})/gi,(m,a)=>a+'С');
const lead=s=>{const t=s.split(' ');let k=0;while(k<t.length-1&&k<5&&(letters(t[k])<2||letters(t[k])<3&&/[^а-яёa-z]/i.test(t[k]))&&t.slice(k+1).some(x=>letters(x)>=3))k++;return{name:t.slice(k).join(' '),cut:k>0}};
const clean=s=>s.replace(/^[^а-яёa-z0-9«"(]+|[^а-яёa-z0-9»")]+$/gi,'').replace(/\s+/g,' ').trim();
const money=l=>{const m=[...l.matchAll(/(\d{1,6}[.,]\d{2})(?!\d)/g)];return m.length?parseFloat(m[m.length-1][1].replace(',','.')):null};
const pickNo=l=>{const m=[...l.matchAll(/(?<![\d.:,])\d{4,10}(?![\d]|[.:,]\d)/g)].map(x=>x[0]);if(m.length)return m.sort((a,b)=>b.length-a.length)[0];const s=l.match(/(\d[\d ]{3,12}\d)(?![.:]\d)/);return s&&!/[.:]/.test(l)?s[1].replace(/ /g,''):''};
/* Строка таблицы: якорь — ближайшая к правому краю пара «количество + сумма с 2 знаками» (или «количество, цена, сумма»).
   Всё правее якоря считается шумом OCR (рамка, фон), всё левее — названием. */
function rowOf(l){const t=l.split(' ').filter(Boolean),F=t.map(x=>fixTok(x.replace(/[;:,]+$/,'')));
 const isSum=x=>x!==null&&/^\d{1,6}\.\d{2}$/.test(x);
 for(let i=t.length-2;i>=0;i--){
  if(F[i]===null||!isSum(F[i+1]))continue;
  let qty,sum,start,d=[];
  if(i>=1&&F[i-1]!==null&&qtyLike(F[i-1])&&isSum(F[i])&&near(+F[i-1]*+F[i],+F[i+1])){qty=+F[i-1];sum=+F[i+1];start=i-1}            // «кол-во цена сумма», цена × кол-во = сумма
  else if(qtyStrict(F[i])){qty=+F[i];sum=+F[i+1];start=i}                                                                                // «кол-во сумма» (формат с чека Евразии: «1.0 271.89»)
  else if(i>=1&&F[i-1]!==null&&qtyLike(F[i-1])&&isSum(F[i])){qty=+F[i-1];sum=+F[i+1];start=i-1;d.push('сумма не сходится с ценой × количеством')}
  else continue;
  const used=start===i-1?3:2;
  const tail=t.slice(start+used).filter(x=>/[а-яёa-z0-9]{2,}/i.test(x));
  if(tail.length)d.push('справа от суммы есть лишний текст (шум OCR): '+tail.join(' ').slice(0,30));
  if(qty>=10)d.push('количество ≥ 10: проверьте (возможно потерялась точка в «1.0»)');
  const raw=t.slice(start,start+used).join(' ');if(/[A-Za-zА-Яа-я|!]/.test(raw))d.push('цифры исправлены после OCR');
  const ln=lead(clean(t.slice(0,start).join(' ')));if(ln.cut)d.push('начало строки очищено от шума OCR');if(/\d{2,}/.test(ln.name))d.push('в названии есть цифры: возможно, слились две строки чека');const gn=glyph(ln.name);if(gn!==ln.name){ln.name=gn;d.push('символ «(» заменён на «С»: проверьте название')}
  return{kind:'row',name:sentence(ln.name),qty,sum,d,dot:/[.,]/.test(t[start])}}
 /* запасной вариант: строка заканчивается числами, но без двух знаков в сумме */
 let k=0;while(k<3&&k<t.length&&F[t.length-1-k]!==null)k++;
 if(!k)return{kind:'text'};return{kind:k===1?'one':'bad'}}
function parse(text){
 const L=String(text).split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean),U=new Set(),out={no:'',ex:'',notes:'',items:[],skipped:[],dropped:[],warn:[],check:null,quality:'bad',score:0,tableFound:false};
 /* 1. номер: допускаем ошибки OCR в «ПРЕДЧЕК АДМИН №» */
 let ni=L.findIndex(l=>has(l,'предчек',2)||(has(l,'админ',1)&&/\d/.test(l)));if(ni<0)ni=L.findIndex(l=>has(l,'предчек',3)||has(l,'админ',2));
 if(ni>=0){out.no=pickNo(L[ni])||(/время/.test(cyr(L[ni+1]||''))?'':pickNo(L[ni+1]||''));U.add(ni)}
 if(!out.no)for(let i=0;i<Math.min(15,L.length);i++){if(/время|дата/.test(cyr(L[i])))continue;if(L.slice(i+1,i+4).some(x=>cutName(x)))continue;const n=pickNo(L[i]);if(/^\d{6,8}$/.test(n)){out.no=n;U.add(i);out.warn.push('Номер предчека найден без заголовка «ПРЕДЧЕК АДМИН №»: проверьте его по фото');break}}
 /* 2. границы блоков */
 const th=L.findIndex(isTH);let te=L.length;if(th>=0){out.tableFound=true;U.add(th);for(let i=th+1;i<L.length;i++)if(isTot(L[i])||isPay(L[i])){te=i;break}}
 const inT=i=>th>=0&&i>th&&i<te;
 /* 3. приборы + доп. ID над ними */
 const cuts=[];L.forEach((l,i)=>{if(inT(i)||U.has(i))return;const n=cutName(l);if(!n)return;cuts.push(i);U.add(i);const w=l.split(' ').map(x=>fixTok(x.replace(/[;:,]+$/,''))).find(x=>x&&qtyLike(x));if(w)out.items.push({name:n,qty:+w,kind:'cutlery',doubt:[]})});
 const exRe=/^(?:\S{1,4}\s+){0,2}\D{0,2}(\d{4,10})\s*[:;.]?\s*$/;
 if(cuts.length){for(let j=cuts[0]-1;j>=Math.max(0,cuts[0]-3);j--){const m=L[j].match(exRe);if(m){out.ex=m[1];U.add(j);break}}}
 if(!out.ex)for(let i=0;i<(th>=0?th:L.length);i++){const m=L[i].match(/^(\d{5,10})\s*:\s*$/);if(m&&!U.has(i)){out.ex=m[1];U.add(i);break}}
 /* 4. комментарий повару */
 const ck=L.findIndex(l=>has(l,'повару',2));
 if(ck>=0){U.add(ck);const nt=[],r=L[ck].replace(/^[^:]*:/,'').trim();if(r&&wordlike(r))nt.push(r);
  for(let i=ck+1;i<L.length&&!isPay(L[i])&&!isTH(L[i])&&!isTot(L[i])&&!(th>=0&&i>=th);i++){if(U.has(i))break;if(!wordlike(L[i])){if(nt.length){U.add(i);break}continue}nt.push(L[i]);U.add(i)}
  out.notes=nt.join(' ')}
 /* 5. таблица позиций */
 const rows=[];let pend='',prev=null;const flush=()=>{if(pend){out.skipped.push({line:pend,why:'строка без количества'});pend=''}};
 const lo=th>=0?th+1:0,hi=th>=0?te:L.length;
 for(let i=lo;i<hi;i++){if(U.has(i))continue;const l=L[i];
  if(th<0&&(isTot(l)||isPay(l)||/\d{2}\.\d{2}\.\d{2,4}|\d{1,2}:\d{2}/.test(l)))continue;
  if(!wordlike(l))continue;const r=rowOf(l);U.add(i);
  if(r.kind==='text'){if(prev&&/^[а-яёa-z]/.test(l)&&!pend&&!/\d.*\d/.test(l)&&l.split(' ').length<=6){prev.name+=' '+clean(l);if(!prev.doubt.includes('перенос названия'))prev.doubt.push('перенос названия')}else if(words(l).some(x=>x.length>=4)&&/[а-яё]{3}/i.test(l)){flush();pend=lead(clean(l)).name}continue}
  if(r.kind!=='row'||letters(r.name)<3&&!pend){flush();out.skipped.push({line:clean(l),why:'не удалось определить количество и сумму'});prev=null;continue}
  const nm=[pend,r.name].filter(Boolean).join(' '),d=[...r.d];if(pend)d.push('перенос названия');pend='';
  if(th<0)d.push('таблица позиций не найдена: проверьте строку');
  prev={name:nm,qty:r.qty,kind:CUT.test(nm)?'cutlery':'dish',doubt:d,sum:r.sum,dot:r.dot};rows.push(prev)}
 flush();
 const dots=rows.filter(r=>r.dot).length;if(dots&&dots>=rows.length/2)rows.forEach(r=>{if(!r.dot)r.doubt.push('количество без «.0»: возможна ошибка OCR')});
 out.items.push(...rows.map(({dot,...r})=>r));
 /* 6. сверка итога. Итог напечатан несколько раз («к оплате» сверху, «Сумма счёта», «Итог», «к оплате» снизу):
    собираем все прочтения; если сумма позиций совпала хотя бы с одним — позиции согласованы с чеком. */
 const cand=[];L.forEach((l,i)=>{if(i<te&&!(isPay(l)&&(th<0||i<th)))return;if(isPay(l)||has(l,'итог',1)||has(l,'итого',1)||(has(l,'сумма',2)&&(has(l,'счета',2)||has(l,'скидки',2)))){const m=money(l);if(m!==null&&m>0)cand.push(m)}});
 const votes={};cand.forEach(v=>{const k=v.toFixed(2);votes[k]=(votes[k]||0)+1});
 const sum=rows.reduce((a,r)=>a+(r.sum||0),0),best=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];
 if(th>=0&&cand.length&&rows.length){const ok=cand.some(v=>near(sum,v,.02));out.check={sum:+sum.toFixed(2),total:ok?+sum.toFixed(2):+best[0],readings:cand,ok};
  if(!ok)out.warn.push(`Сумма позиций ${sum.toFixed(2)} не сходится с итогом чека (прочитано: ${[...new Set(cand.map(v=>v.toFixed(2)))].join(', ')}). Возможно, потеряна строка или неверно прочитана цифра. Сверьте с фото.`)}
 /* 7. объединение повторов */
 const mg=[];out.items.forEach(x=>{const key=x.kind+norm(x.name),y=mg.find(z=>z.key===key);if(y){y.qty+=x.qty;y.sum=+((y.sum||0)+(x.sum||0)).toFixed(2);x.doubt.forEach(d=>y.doubt.includes(d)||y.doubt.push(d))}else mg.push({...x,key})});
 out.items=mg.map(({key,...r})=>r).sort((a,b)=>(a.kind==='cutlery')-(b.kind==='cutlery'));
 out.dropped=L.filter((l,i)=>!U.has(i));
 const dish=out.items.some(x=>x.kind==='dish');
 out.quality=out.no&&out.tableFound&&dish&&out.check&&out.check.ok?'good':out.no&&out.items.length?'ok':'bad';
 out.score=(out.no?40:0)+(out.tableFound?20:0)+out.items.length*10+(out.check?(out.check.ok?50:-20):0)+(out.ex?10:0)-out.skipped.length*3;
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
const SOFT=/^(перенос названия|начало строки очищено|проходы OCR прочитали название по-разному|цифры исправлены|символ «\(» заменён|справа от суммы есть лишний текст)/;
const hard=x=>(x.doubt||[]).filter(d=>!(x.st==='o'&&SOFT.test(d)));
const needsOk=(x,on)=>!!(hard(x).length||(on&&x.kind!=='cutlery'&&x.st!=='o'));
function validate(d,on){const er=[];if(!/^\d+$/.test(String(d.no||'').trim()))er.push('Укажите номер предчека (только цифры)');
 if(String(d.ex||'').trim()&&!/^\d+$/.test(String(d.ex).trim()))er.push('Дополнительный ID: только цифры');
 if(!d.items.length)er.push('Добавьте хотя бы одну позицию');
 d.items.forEach((x,i)=>{if(!String(x.name).trim())er.push(`Позиция ${i+1}: нет названия`);if(!Number.isInteger(x.qty)||x.qty<1||x.qty>99)er.push(`Позиция ${i+1}: количество должно быть целым числом от 1 до 99`)});
 const u=d.items.filter(x=>needsOk(x,on)&&!x.cf).length;if(u)er.push(`Подтвердите сомнительные позиции: ${u}`);
 if((d.skipped||[]).length)er.push(`Разберите строки таблицы, не вошедшие в позиции: ${d.skipped.length}`);
 if((d.warn||[]).length&&!d.warnOk)er.push('Прочитайте предупреждения и подтвердите, что сверили чек с фото');return er}
/* номер предчека из короткого текста (полоса заголовка): строка со словом «предчек/админ», иначе единственное длинное число */
function numberFrom(text){const L=String(text).split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),i=L.findIndex(l=>has(l,'предчек',3)||has(l,'админ',2));if(i>=0){const n=pickNo(L[i]);if(n)return n}
 const c=L.filter(l=>!/время|дата|\d{2}\.\d{2}\.\d{2,4}/i.test(l)).map(pickNo).filter(n=>/^\d{6,8}$/.test(n));return c.length===1?c[0]:''}
return{hard,parse,parseTable,linesFromWords,isTH,isTot,isPay,validate,needsOk,norm,intQty,lev,numberFrom,has,cyr}});
