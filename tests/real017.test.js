/* GONER PACK 017: регрессия на РЕАЛЬНЫХ фото предчеков (tests/fixtures/real017, 20 фото от 18.11.2026) через настоящую нейросеть
   (onnxruntime-web 1.20.1 в Node, те же модели). По умолчанию — 6 разных фото (изогнутый чек, повёрнутый на 90°, 13 позиций с начинками,
   слипшиеся строки, переносы названий); все 20: GP_FULL=1 node --test tests/real017.test.js. Нужны devDependencies (npm i). */
const test=require('node:test'),assert=require('node:assert');
let B=null;try{require.resolve('onnxruntime-web');require.resolve('sharp');B=require('../tools/bench017.js')}catch(e){}
const IDS=process.env.GP_FULL?null:'1044947a,1045050,1044917,1044978,1044880,1044897';
test('реальные фото: верные блюда и количества, ни одной неверной автоподстановки, итог чека сходится',{skip:!B&&'нет onnxruntime-web/sharp (npm i)',timeout:600000},async()=>{
 const r=await B.run({ver:'017',dict:'cur',quiet:1,...(IDS?{only:IDS}:{})});const s=r.sum;
 for(const x of r.rows){assert.strictEqual(x.wrongAuto,0,x.id+': неверная автоподстановка\n'+x.det.join('\n'));assert.strictEqual(x.qtyBad,0,x.id+': ошибка количества\n'+x.det.join('\n'));assert.ok(x.total,x.id+': итог не сошёлся');assert.ok(x.no&&x.ex,x.id+': номер/ID')}
 assert.ok(s.ok>=s.want-1,`верных блюд ${s.ok} из ${s.want}`);assert.ok(s.edits<=1,`правок ${s.edits}`)});
test('реальные фото без цен и со справочником 016 (новых названий нет): неизвестные блюда не переименованы',{skip:!B&&'нет onnxruntime-web/sharp',timeout:600000},async()=>{
 const r=await B.run({ver:'017',dict:'016',quiet:1,only:'1044917,1044947a'});for(const x of r.rows)assert.strictEqual(x.wrongAuto,0,x.det.join('\n'))});
