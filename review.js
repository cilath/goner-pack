/* GONER PACK 017: статусы позиций на экране проверки чека (без DOM; тот же код работает в app.js и в замерах tools/bench017.js).
   Порядок для каждой позиции (если сборщик не исправил её вручную):
   1) подтверждённое сборщиком исправление из обученного словаря 014 (точное совпадение исходного прочтения);
   2) решение по нейросети (017, ctc.js): auto — блюдо подставляется само («по нейросети»), suggest — до 3 вариантов одним нажатием,
      none — блюда нет в справочнике: текст OCR не подменяется (правило 010);
   3) прежнее сопоставление по тексту (matcher.js), если нейросетевого решения нет (Tesseract, вставленный текст, скриншот);
   4) цены (017): известная цена за единицу × количество сверяется с суммой строки. Расхождение, объяснимое другим целым количеством, —
      предложение исправить количество (подставляется само, только если нейросеть в своём прочтении количества не уверена, и всегда с пометкой);
      сумма строки помогает выбрать между похожими блюдами. Итог чека по-прежнему только проверяет.
   Статусы: o — в справочнике (подтверждать не нужно), s — похоже, нужен один тап, u — нет в справочнике. Исходный текст OCR хранится в x.ocr. */
(function(r,f){const nd=typeof require==='function'&&typeof module==='object',m=f(nd?require('./matcher.js'):r.GPM,nd?require('./learning.js'):r.GPL);if(nd&&module.exports)module.exports=m;else r.GPR=m})(typeof self!=='undefined'?self:this,function(GPM,GPL){
'use strict';
const SAFE=['exact','alias','order','spacing'];
const money=v=>(+v).toFixed(2);
const dateRu=t=>{try{return new Date(t).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}catch(e){return''}};
/* цена за единицу для записи справочника: самая свежая */
function priceMap(prices){const M=new Map();(prices||[]).forEach(p=>{if(!p||!p.k||!(p.unit>0))return;const e=M.get(p.k);if(!e||(p.t||0)>=(e.t||0))M.set(p.k,p)});return M}
const near=(a,b)=>Math.abs(a-b)<=Math.max(.02,.0015*Math.abs(b));
function entryOf(name,ctx){if(!name)return null;const m=GPM.match(name,ctx.idx);return m.st==='o'&&SAFE.includes(m.how)?m.d:null}
function reviewItem(x,ctx,P){
 if(x.kind==='cutlery'){x.st='o';return x}
 if(x.ocr===undefined)x.ocr=x.name;
 if(x._rd){x.doubt=(x.doubt||[]).filter(d=>!x._rd.includes(d))}x._rd=[];const addD=d=>{x._rd.push(d);(x.doubt=x.doubt||[]).push(d)};
 if(x.qtyRead===undefined)x.qtyRead=x.qty;
 if(!x.userEdited){x.name=x.ocr;x.fixed=undefined;x.learned=false}
 if(!x.qtyUser&&x.qtyByPrice){x.qty=x.qtyRead;x.qtyByPrice=false}
 let m=GPM.match(x.name,ctx.idx),dk=null;
 // Если оператор вводит своё название, похожее блюдо нельзя подставлять без подтверждения.
 if(x.userEdited&&m.st==='o'&&!SAFE.includes(m.how)&&m.name!==x.name)m={...m,st:'s',how:'manual-similar'};
 // 1) подтверждённое ранее правило; ручную правку не перезаписываем
 const rule=!x.userEdited&&GPL.key(x.name)===GPL.key(x.ocr)?GPL.resolve(x.ocr,ctx.rules,ctx.dict):null;
 const nn=!x.userEdited&&!rule&&x.nn&&ctx.dict&&ctx.dict.some(d=>d.n===x.nn.name)?x.nn:null;
 let cand=null;
 if(rule){m={st:'o',name:rule.target.n,how:'learned',alts:[],d:rule.target}}
 else if(nn&&nn.dec==='auto'){const d=ctx.dict.find(e=>e.n===nn.name);m={st:'o',name:nn.name,how:'neural',d,alts:[]}}
 else if(nn&&nn.dec==='suggest'){cand=nn.cands.map(c=>c.n).filter(n=>ctx.dict.some(d=>d.n===n)).slice(0,3);
  if(m.st==='o'&&SAFE.includes(m.how)&&m.name===cand[0]){/* текст строки точно совпал с лидером нейросети */}
  else m={st:'s',name:cand[0],how:'neural-suggest',alts:[]}}
 else if(nn&&nn.dec==='none'){ /* нейросеть: свободное прочтение лучше всех блюд — блюда нет в справочнике. Точное/переставленное совпадение текста оставляем, нечёткое — только предложение. */
  if(m.st==='o'&&!SAFE.includes(m.how))m={...m,st:'s',how:'similar'}}
 x.st=m.st;x.how=m.how;if(m.st==='o')dk=(m.d&&m.d.k)||null;
 x.gb=GPM.garbled(x.ocr||x.name);
 x.cand=m.st==='o'?[]:(cand&&cand.length?cand:GPL.alternatives(x.name,ctx.idx,GPM,3));
 x.sug=m.st==='s'?(m.name||''):'';
 if(m.st==='o'&&m.name!==x.name){x.fixed=x.ocr;x.name=m.name}
 /* 4) цены */
 x.price=null;x.qtySug=null;x.priceOk=false;const PM=ctx._pm;
 if(PM&&PM.size&&x.sum!=null){
  /* выбор между похожими блюдами по сумме строки */
  if(x.st==='s'&&!x.userEdited&&x.cand&&x.cand.length){const ents=x.cand.map(n=>({n,d:ctx.dict.find(e=>e.n===n)})).filter(z=>z.d),known=ents.filter(z=>PM.has(z.d.k)),hit=known.filter(z=>near(PM.get(z.d.k).unit*x.qty,x.sum));
   if(hit.length===1&&(known.length===ents.length||hit[0].n===x.cand[0])&&(!nn||nn.dec==='suggest')){x.fixed=x.ocr;x.name=hit[0].n;x.st='o';x.how=nn?'neural+price':'price';dk=hit[0].d.k;x.cand=[]}}
  const p=dk&&PM.get(dk);
  if(p){x.price={unit:p.unit,t:p.t};const exp=p.unit*x.qty;
   if(near(exp,x.sum)){x.priceOk=true;/* цена подтверждает количество */const before=(x.doubt||[]).length;x.doubt=(x.doubt||[]).filter(d=>!/количество прочитано неуверенно|без «\.0»|по колонке «Кол-в»: \d+ \(неуверенно\)/.test(d));if(before!==x.doubt.length)x.qByPrice=true}
   else{const q2=Math.round(x.sum/p.unit);
    if(q2>=1&&q2<=99&&q2!==x.qty&&near(p.unit*q2,x.sum)){x.qtySug=q2;
     if(!x.qtyUser&&!(x.qconf>=.9)){addD(`количество ${q2} подставлено по известной цене ${money(p.unit)} (от ${dateRu(p.t)}): ${money(p.unit)} × ${q2} = ${money(x.sum)}; прочитано ${x.qty} — проверьте по фото`);x.qty=q2;x.qtyByPrice=true}
     else if(!x.qtyUser)addD(`по известной цене ${money(p.unit)} (от ${dateRu(p.t)}) количество должно быть ${q2}, прочитано ${x.qty} — проверьте по фото`)}
    else if(!x.userEdited&&x.st==='o'&&!['exact','alias','learned'].includes(x.how))addD(`сумма строки ${money(x.sum)} не сходится с известной ценой «${x.name}» ${money(p.unit)} × ${x.qty}: возможно, другое блюдо или цена изменилась`)}}}
 x.dk=dk;return x}
/* d — черновик чека или результат разбора ({items}); ctx: {idx, dict, rules, prices} */
function review(d,ctx){ctx={...ctx};ctx._pm=priceMap(ctx.prices);(d.items||[]).forEach(x=>reviewItem(x,ctx,d));return d}
/* цены из подтверждённого заказа: только блюда справочника с прочитанной суммой и целым количеством */
function pricesFrom(items,dict,idx,t){const out=new Map();for(const x of items||[]){if(x.kind==='cutlery'||x.sum==null||!(x.qty>=1)||!(x.sum>0))continue;
  const d=(x.dk&&dict.find(e=>e.k===x.dk))||entryOf(x.name,{idx});if(!d)continue;if((x.dup||1)>1)continue;out.set(d.k,{k:d.k,name:d.n,unit:+(x.sum/x.qty).toFixed(2),t:t==null?Date.now():t})}
 return[...out.values()]}
return{review,reviewItem,priceMap,pricesFrom,near}});
