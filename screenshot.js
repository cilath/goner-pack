/* GONER PACK 016 — кассовые скриншоты официантов, 2 интерфейса.
 * Таблица: «Гость 1 / КУРС 1 / ПЦ / Сумма», строки <название> <количество> <стоимость>.
 * Карточки: название + числовой степпер справа; «+ навынос» — модификатор, не блюдо.
 * Суммы НЕ используются для определения количества, а номера столов НЕ становятся номерами заказов.
 * Любые сомнения требуют подтверждения сборщика, заказ никогда не создаётся автоматически.
 */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.GPS=m})(typeof self!=='undefined'?self:this,function(){
'use strict';
const clean=s=>String(s==null?'':s).replace(/[\u00a0\u200b\u200e\u200f]/g,' ').replace(/\s+/g,' ').trim();
const KEY=s=>clean(s).toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[.,;:!?'"«»()\[\]{}\-–—]+/g,' ').replace(/\s+/g,' ').trim();
const money=/^\d{2,7}(?:[.,]\d{2})?\s*(?:₽|р\.?|руб(?:лей|ля)?\.?)?$/i;
const PRICE='(?:\\d{1,3}(?:[ ,.\\u00a0]\\d{3})+|\\d{1,6})(?:[.,]\\d{1,2})?|[.,]\\d{2}';
const header=/^(?:гость\s*\d+|кур(?:с)?\s*\d+|стол\s*(?:№|#)?\s*\d+|на кухню|добавить блюдо|избранные позиции|пц|сумма|пц\s*сумма|наименовани[ея]|кол-?во|количество|официант|сотрудник|курсы|к оплате|оплачено|итого|всего|заказано|состав заказа|позиции заказа|блюда|цена|телефон|адрес|сегодня|вчера|сообщени[ея]|отправлено|получено|написать|переслать|ответить|отмена|закрыть|готово|скриншот|номер заказа|заказ №|чек|заказчик|прочитано|сканирование|навынос по скриншоту|выбранные блюда)(?:\b|\s|:|№|$)/i;
const footer=/^(?:на кухню|добавить блюдо|избранные позиции|итого|всего|к оплате|сумма заказа|оплачено|переслать)(?:\b|\s|:|$)/i;
const modifier=/^\+\s*(?:на\s*вынос|навынос|с собой)(?:\s*[×xх✕])?$/i;
const menuPhrase=/\b(?:ролл|суп|пицц\w*|салат|маки|лапш\w*|бургер|соус|морожен\w*|суши|кревет\w*|филадельф\w*|запеч[её]н\w*|горяч\w*|удон|рамен|гарнир|пакет|стейк|тар\s*тар|капучино|эспрессо|чукка|сырник)\b/i;
function extractNo(text){const m=String(text||'').match(/(?:заказ\s*(?:№|#|номер)?|номер\s+заказа\s*[:№#]?|предчек\s*(?:админ\s*)?№)\s*[:#№-]?\s*(\d{3,10})/i);return m?m[1]:''}
function metadata(lines){const tx=lines.map(l=>typeof l==='string'?l:l.text).join('\n'),t=tx.match(/(?:^|\s)стол\s*(?:№|#)?\s*(\d{1,4})(?=\s|$)/im),g=tx.match(/(?:^|\s)гость\s*(\d{1,3})(?=\s|$)/im);return{table:t?t[1]:'',guest:g?g[1]:''}}
function isNoise(line){const s=clean(line);return!s||/^\d{1,2}[:.]\d{2}(?::\d{2})?$/.test(s)||/^(?:\d{2}[./-]){2}\d{2,4}$/.test(s)||/^[+⋮:…\u2022\u00d7\u2715\s]+$/.test(s)||/^\d+\s*(?:₽|руб)/i.test(s)||money.test(s)||header.test(s)||modifier.test(s)||/^\d\s*в\s*1\s+стаканчик\s+льда$/i.test(s)}
function getMatch(l,matcher,idx){return matcher&&matcher.match?matcher.match(l,idx||[]):null}
/* Возвращает одну позицию. table/card используются лишь когда тип скриншота подтверждён заголовком или компоновкой. */
function parseLine(raw,matcher,idx,mode){
 const original=String(raw==null?'':raw);
 let l=clean(original).replace(/^[•●▪▫◦·\-–—]+\s*/,'');if(isNoise(l))return null;
 let qty=null,explicit=false,price=false,mt;
 // 1. Безопасные текстовые форматы.
 if((mt=l.match(/^(\d{1,2})\s*[×xх*]\s+(.+)$/i))){qty=+mt[1];l=mt[2];explicit=true}
 else if((mt=l.match(/^(.+?)\s+[×xх*]\s*(\d{1,2})(?:\s|$)/i))){qty=+mt[2];l=mt[1];explicit=true}
 else if((mt=l.match(/^(.+?)\s+[-–—:]?\s*(\d{1,2})\s*(?:шт\.?|штук|порц(?:ии|ия|ий|\.)?)(?:\s|$)/i))){qty=+mt[2];l=mt[1];explicit=true}
 else if((mt=l.match(/^(\d{1,2})\s*(?:шт\.?|штук|порц(?:ии|ия|ий|\.)?)\s+(.+)$/i))){qty=+mt[1];l=mt[2];explicit=true}
 // 2. Столбцы «название  2   1,530» или «название 6 .06».
 else if((mt=l.match(new RegExp('^(.+?)\\s+(\\d{1,2})\\s+('+PRICE+')(?:\\s*(?:₽|р\\.|руб))?$','i')))){qty=+mt[2];l=mt[1];explicit=true;price=true}
 // 3. Карточка с кнопкой: «Горячий ролл ...   1 +  ⋮».
 else if(mode==='card'&&(mt=l.match(/^(.+?)\s+(\d{1,2})\s*(?:\+|＋)(?:\s*[⋮:…]*)?$/))){qty=+mt[2];l=mt[1];explicit=true}
 // 4. Нет цены в табличной строке: число справа трактуем как количество только в режиме таблицы.
 else if(mode==='table'&&(mt=l.match(/^(.+?)\s+(\d{1,2})$/))){qty=+mt[2];l=mt[1];explicit=true}
 // 5. Старые универсальные форматы: отдельное число допускается лишь с точным совпадением со справочником.
 else if((mt=l.match(/^(\d{1,2})\s+(.+)$/))){const q=getMatch(mt[2],matcher,idx);if(q&&q.st==='o'){qty=+mt[1];l=mt[2];explicit=true}}
 else if((mt=l.match(/^(.+?)\s+(\d{1,2})$/))){const q=getMatch(mt[1],matcher,idx);if(q&&q.st==='o'){qty=+mt[2];l=mt[1];explicit=true}}
 l=clean(l.replace(/^[•●▪▫◦·\-–—]+\s*/,''));
 if(!l||isNoise(l)||qty!==null&&(qty<1||qty>99)||l.length>120||l.split(/\s+/).length>17)return null;
 if(!/[а-яёa-z]{3}/i.test(l))return null;
 // Числа в названиях напитков «0.4 Фест Хаус» разрешены; отдельно стоящие цифры — нет.
 if(/^\d/.test(l)&&!/^\d+[.,]\d+\s+\S+/i.test(l))return null;
 const m=getMatch(l,matcher,idx),known=!!(m&&m.st==='o'),near=!!(m&&m.st==='s');
 // В явной кассовой таблице/карточке с количеством незнакомая позиция не теряется.
 // В случайном тексте вне кассы — только известное блюдо либо обоснованный кандидат.
 if(!known&&!near&&!explicit&&!menuPhrase.test(l))return null;
 return{name:l,qty:qty||1,explicit,known,near,match:m,price};
}
/* На вход могут прийти геометрические строки PP-OCRv5 (parts, x0..x1), либо слова Tesseract.
 * Разделяем известные столбцы по координатам, если OCR слил/разбил пробелы. */
function rowsFromLayout(layout,width,mode){
 if(!Array.isArray(layout)||!layout.length)return null;
 const W=Number(width)||Math.max(...layout.map(l=>Number(l.x1)||0),0);if(W<=0)return null;
 const out=[];for(const line of layout){
  const raw=clean(line.text||'');const parts=(line.parts||line.w||[]).map(z=>({s:clean(z.text),x0:Number(z.x0),x1:Number(z.x1)})).filter(p=>p.s&&Number.isFinite(p.x0)&&Number.isFinite(p.x1));
  if(isNoise(raw)||!parts.length){out.push(raw);continue}
  // name <~73% image; quantity ~73-84%; total at right. Some OCR splits long names on border,
  // so reconstruct only if quantity segment consists solely of digits and symbol +.
  const names=parts.filter(p=>(p.x0+p.x1)/2<W*.735),qtys=parts.filter(p=>(p.x0+p.x1)/2>=W*.735&&(p.x0+p.x1)/2<W*(mode==='card'?.9:.835)),prices=parts.filter(p=>(p.x0+p.x1)/2>=W*.835);
  const name=clean(names.map(p=>p.s).join(' ')),qty=clean(qtys.map(p=>p.s).join(' ')),price=clean(prices.map(p=>p.s).join(' '));
  // Leave untouched if geometry is ambiguous (e.g. whole line is one recognized box).
  if(name&&/^\d{1,2}(?:\s*[+＋])?$/.test(qty)&&!isNoise(name)){
   if(mode==='table'&&/^\d[\d\s,.]*$/.test(price))out.push(name+' '+qty.replace(/[+＋]/g,'').trim()+' '+price.replace(/\s/g,''));
   else if(mode==='card')out.push(name+' '+qty.replace(/\s/g,''));
   else out.push(raw);
  }else out.push(raw);
 }
 return out;
}
const isHeader=l=>/(?:^|\s)пц(?=\s|$)/i.test(l)&&/сумм/i.test(l)||/^(?:наименование|кол-?во\s+сумма)/i.test(l);
function detectMode(lines){if(lines.some(isHeader))return'table';if(lines.some(l=>/^(?:\+\s*навынос|\+\s*на\s*вынос|добавить блюдо)/i.test(l)))return'card';
 const priceLines=lines.filter(l=>/^.+?\s+\d{1,2}\s+(?:\d{2,6}|\d{1,3}(?:[.,]\d{3})+|[.,]\d{2})(?:\s*₽)?$/.test(l));
 if(priceLines.length>=2&&lines.some(l=>/^(?:стол|гость|курс)/i.test(l)))return'table';return'generic';}
function mergeDuplicates(items){const groups=[],keys=new Map();
 for(const x of items){const k=KEY(x.name),i=keys.get(k);
  if(i!==undefined&&groups[i].qty+x.qty<=99){const prev=groups[i];prev.qty+=x.qty;prev.occurrences=(prev.occurrences||1)+1;
   prev.takeaway=prev.takeaway||x.takeaway;prev.doubt=[...new Set([...(prev.doubt||[]),...(x.doubt||[])])];
  }else{keys.set(k,groups.length);groups.push({...x,occurrences:1})}}
 return groups;}
function parse(text,{matcher,idx,layout,width}={}){
 const original=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);let mode=detectMode(original);
 let lines=rowsFromLayout(layout,width,mode)||original;
 // Layout reconstruction may improve the row count, but it must not strip the header from the raw text.
 if(lines.length<original.length/2)lines=original;
 if(mode==='generic')mode=detectMode(lines);
 const meta=metadata(original),no=extractNo(text),items=[],skipped=[],notes=[];
 let started=mode!=='table',lastDish=-9;
 const firstTableHeader=mode==='table'?lines.findIndex(isHeader):-1;
 const firstDish=mode==='card'?lines.findIndex(l=>/^(?:гость\s*\d+|\d+\s*[×xх*]\s+)/i.test(l)):-1;
 for(let n=0;n<lines.length;n++){
  let l=clean(lines[n]);if(!l)continue;
  if(mode==='table'&&firstTableHeader>=0&&n<=firstTableHeader)continue;
  if(mode==='table'&&footer.test(l))break;
  if(mode==='card'&&footer.test(l))break;
  if(modifier.test(l)){if(items.length&&n===lastDish+1)items[items.length-1].takeaway=true;continue;}
  if(/^\d\s*в\s*1\s+стаканчик\s+льда$/i.test(l)){notes.push(l);continue;}
  if(isNoise(l))continue;
  if(mode==='card'&&firstDish>=0&&n<firstDish)continue;
  const it=parseLine(l,matcher,idx,mode);
  if(!it){
   if((mode==='table'||mode==='card')&&/[а-яё]{3}/i.test(l)&&l.length<=120&&l.split(/\s+/).length<=15&&skipped.length<30)
    skipped.push({line:l,why:'Не удалось безопасно отделить название и количество — проверьте по скриншоту'});
   continue;
  }
  const doubt=[];
  if(!it.explicit)doubt.push('Количество на скриншоте не выделено отдельно: временно указана 1 шт.');
  if(!it.known)doubt.push('Блюдо не подтверждено справочником: сравните название со скриншотом');
  items.push({kind:'dish',name:it.name,qty:it.qty,ocr:it.name,doubt,cf:false,screenshot:true,st:'u',takeaway:false});lastDish=n;
 }
 return{no,table:meta.table,guest:meta.guest,mode,items:mergeDuplicates(items),skipped,lines:lines.length,quality:'',warn:['Сверьте позиции, количества и пометки с исходным скриншотом перед сборкой.'],notes:notes.join('; '),ex:''};
}
return{clean,extractNo,metadata,parseLine,rowsFromLayout,detectMode,mergeDuplicates,parse};
});
