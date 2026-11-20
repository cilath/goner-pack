/* GONER PACK 017: экран проверки (review.js) — решения нейросети, обученный словарь 014, цены. Без нейросети: решения x.nn заданы вручную. */
const test=require('node:test'),assert=require('node:assert');
const GPR=require('../review.js'),GPM=require('../matcher.js'),GPD=require('../dict.js'),GPL=require('../learning.js'),SEED=require('../dict-seed.js');
const dict=GPD.build(SEED.items,[]),idx=GPM.index(dict),k=n=>dict.find(d=>d.n===n).k;
const ctx=o=>({idx,dict,rules:[],prices:[],...o});
const nn=(dec,name,cands)=>({dec,name,gapFree:dec==='auto'?0:-8,gap2:dec==='auto'?20:1,cands:(cands||[name]).map(n=>({n,s:-1})),free:''});
test('нейросеть auto: блюдо подставляется «по нейросети», исходный текст сохраняется',()=>{
 const d={items:[{name:'Сп Кимчи',qty:1,sum:63.37,kind:'dish',doubt:[],nn:nn('auto','Суп Кимчи')}]};GPR.review(d,ctx());const x=d.items[0];
 assert.strictEqual(x.name,'Суп Кимчи');assert.strictEqual(x.st,'o');assert.strictEqual(x.how,'neural');assert.strictEqual(x.ocr,'Сп Кимчи')});
test('нейросеть suggest: до 3 вариантов, текст не подменяется',()=>{
 const d={items:[{name:'Суши запеч с кр',qty:1,sum:1,kind:'dish',doubt:[],nn:nn('suggest','Суши запечённые с крабом',['Суши запечённые с крабом','Суши запечённые с креветкой'])}]};GPR.review(d,ctx());const x=d.items[0];
 assert.strictEqual(x.st,'s');assert.strictEqual(x.name,'Суши запеч с кр');assert.deepStrictEqual(x.cand,['Суши запечённые с крабом','Суши запечённые с креветкой'])});
test('нейросеть none: неизвестное блюдо не переименовывается даже при нечётком сходстве текста',()=>{
 const d={items:[{name:'Суши запеченные с угрем и сыром',qty:1,sum:1,kind:'dish',doubt:[],nn:nn('none','x')}]};GPR.review(d,ctx());
 assert.notStrictEqual(d.items[0].st,'o');assert.strictEqual(d.items[0].name,'Суши запеченные с угрем и сыром')});
test('обученный словарь 014 важнее нейросети; ручная правка важнее всего',()=>{
 const rule=GPL.makeRule('Сп Кимчи','Киото маки',dict,1);const d={items:[{name:'Сп Кимчи',qty:1,kind:'dish',doubt:[],nn:nn('auto','Суп Кимчи')}]};
 GPR.review(d,ctx({rules:[rule]}));assert.strictEqual(d.items[0].name,'Киото маки');assert.strictEqual(d.items[0].how,'learned');
 d.items[0].name='Тори маки';d.items[0].userEdited=true;GPR.review(d,ctx({rules:[rule]}));assert.strictEqual(d.items[0].name,'Тори маки')});
const P=(n,unit)=>({k:k(n),name:n,unit,t:Date.parse('2026-11-18')});
test('цена подтверждает количество и снимает «количество прочитано неуверенно»',()=>{
 const d={items:[{name:'Имбирь на вынос шт',qty:3,sum:35.31,kind:'dish',doubt:['количество прочитано неуверенно']}]};GPR.review(d,ctx({prices:[P('Имбирь на вынос шт',11.77)]}));
 assert.ok(d.items[0].priceOk);assert.deepStrictEqual(d.items[0].doubt,[])});
test('цена × другое целое = сумма: неуверенное количество исправляется с пометкой, уверенное — только предложение',()=>{
 const pr=[P('Соевый соус на вынос шт',9.95)];
 const a={items:[{name:'Соевый соус на вынос шт',qty:1,sum:29.85,kind:'dish',doubt:[],qconf:.5}]};GPR.review(a,ctx({prices:pr}));
 assert.strictEqual(a.items[0].qty,3);assert.ok(a.items[0].doubt.some(d=>/подставлено по известной цене/.test(d)));
 const b={items:[{name:'Соевый соус на вынос шт',qty:1,sum:29.85,kind:'dish',doubt:[],qconf:.99}]};GPR.review(b,ctx({prices:pr}));
 assert.strictEqual(b.items[0].qty,1);assert.strictEqual(b.items[0].qtySug,3);assert.ok(GPR.review&&b.items[0].doubt.some(d=>/должно быть 3/.test(d)));
 /* повторный пересчёт не накапливает пометки */
 GPR.review(b,ctx({prices:pr}));assert.strictEqual(b.items[0].doubt.filter(d=>/должно быть 3/.test(d)).length,1);
 /* сборщик выбрал количество сам — цена его не трогает */
 b.items[0].qty=1;b.items[0].qtyUser=true;GPR.review(b,ctx({prices:pr}));assert.strictEqual(b.items[0].qty,1);assert.ok(!b.items[0].doubt.some(d=>/цен/.test(d)))});
test('сумма строки выбирает между похожими блюдами (все кандидаты с известной ценой)',()=>{
 const pr=[P('Суши запечённые с крабом',23.64),P('Суши запечённые с креветкой',52.78)];
 const d={items:[{name:'Суши запеч с кр',qty:1,sum:52.78,kind:'dish',doubt:[],nn:nn('suggest','Суши запечённые с крабом',['Суши запечённые с крабом','Суши запечённые с креветкой'])}]};
 GPR.review(d,ctx({prices:pr}));assert.strictEqual(d.items[0].name,'Суши запечённые с креветкой');assert.strictEqual(d.items[0].st,'o');assert.strictEqual(d.items[0].how,'neural+price')});
test('сумма не сходится с ценой подставленного блюда — нужна проверка',()=>{
 const d={items:[{name:'Тори маки',qty:1,sum:242.19,kind:'dish',doubt:[],nn:nn('auto','Тори маки')}]};GPR.review(d,ctx({prices:[P('Тори маки',181.79)]}));
 assert.ok(d.items[0].doubt.some(d=>/не сходится с известной ценой/.test(d)))});
test('цены из подтверждённого заказа: только блюда справочника с суммой; объединённые повторы пропускаются',()=>{
 const items=[{name:'Соевый соус на вынос шт',qty:3,sum:29.85,kind:'dish'},{name:'Неизвестное блюдо',qty:1,sum:10,kind:'dish'},{name:'Палочки',qty:2,kind:'cutlery'},{name:'Кацудон',qty:2,sum:561.08,kind:'dish',dup:2}];
 const L=GPR.pricesFrom(items,dict,idx,5);assert.deepStrictEqual(L.map(p=>[p.name,p.unit]),[['Соевый соус на вынос шт',9.95]])});
test('CSV справочника: колонка цены экспортируется и читается обратно',()=>{
 const csv=GPD.toCSV(dict.slice(0,3),new Map([[dict[1].k,{unit:12.5,t:Date.parse('2026-11-18')}]]));const back=GPD.rowsToItems(GPD.parseCSV(csv)).items;
 assert.strictEqual(back[1].p,12.5);assert.strictEqual(back[0].p,undefined)});
test('IndexedDB: миграция схемы 3 → 4 сохраняет заказы, справочник и словарь 014, добавляет хранилище цен',async()=>{
 require('fake-indexeddb/auto');const DB=require('../db.js');
 await new Promise((ok,no)=>{const q=indexedDB.open('gp-mig',3);q.onupgradeneeded=()=>{const db=q.result;db.createObjectStore('orders',{keyPath:'id'});db.createObjectStore('dict',{keyPath:'k'});db.createObjectStore('photos',{keyPath:'key'});db.createObjectStore('learn',{keyPath:'k'});
  const t=q.transaction;t.objectStore('orders').put({id:1,no:'1044917',items:[],t:Date.now()});t.objectStore('learn').put({k:'сп кимчи',raw:'Сп Кимчи',target:'x'});t.objectStore('dict').put({k:'x',n:'Икс',a:[]})};q.onsuccess=()=>{q.result.close();ok()};q.onerror=no});
 const db=await DB.open('gp-mig');assert.strictEqual(db.raw.version,4);assert.strictEqual((await db.orders()).length,1);assert.strictEqual((await db.learn()).length,1);assert.strictEqual((await db.dict()).length,1);
 assert.ok(await db.putPrices([{k:'x',name:'Икс',unit:9.95,t:1}]));assert.deepStrictEqual((await db.prices()).map(p=>p.unit),[9.95]);assert.ok(await db.delPrice('x'));assert.strictEqual((await db.prices()).length,0);db.close()});
test('018: заказ по чеку требует только ID заказа; номер предчека необязателен; навынос — номер заказа',()=>{const GP=require('../parser.js');
 const it=[{name:'Кацудон',qty:1,kind:'dish',doubt:[],st:'o'}];
 assert.deepStrictEqual(GP.validate({no:'',ex:'4837199',items:it},true),[]);
 assert.ok(GP.validate({no:'1045046',ex:'',items:it},true).some(e=>/ID заказа/.test(e)));
 assert.ok(GP.validate({no:'12',ex:'',items:it,origin:'screenshot'},true).length===0)});
