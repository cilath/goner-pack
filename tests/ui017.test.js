/* GONER PACK 017: сквозной сценарий в настоящем браузере (Chromium, Playwright): само приложение (index.html), neural-web.js,
   onnxruntime-web 1.20.1 (файлы библиотеки подаются из node_modules вместо CDN — в песочнице нет интернета), модели из models/.
   Фото реального чека → распознавание → экран проверки → «Создать заказ» → цены в IndexedDB → второй чек сверяется по ценам.
   Это НЕ телефон: desktop Chromium, экран 360×780. */
const test=require('node:test'),assert=require('node:assert'),http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'),FIX=path.join(ROOT,'tests/fixtures/real017');
let PW=null;try{PW=require('playwright');require.resolve('onnxruntime-web')}catch(e){}
const TYPES={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.onnx':'application/octet-stream','.txt':'text/plain','.png':'image/png','.webmanifest':'application/manifest+json'};
function serve(){return new Promise(ok=>{const s=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(new URL(q.url,'http://x').pathname));if(!f.startsWith(ROOT)){r.writeHead(403);return r.end()}if(f.endsWith(path.sep))f+='index.html';
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(b)})}).listen(0,'127.0.0.1',()=>ok(s))})}
test('браузер: чек → проверка → заказ → цены → второй чек сверяется по ценам',{skip:!PW&&'нет playwright/onnxruntime-web',timeout:600000},async()=>{
 const srv=await serve(),url=`http://127.0.0.1:${srv.address().port}/index.html`,b=await PW.chromium.launch(),ctx=await b.newContext({viewport:{width:360,height:780},permissions:['clipboard-read','clipboard-write']});
 await ctx.route('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/**',rt=>{const f=path.join(ROOT,'node_modules/onnxruntime-web/dist',path.basename(new URL(rt.request().url()).pathname));rt.fulfill({path:f,contentType:TYPES[path.extname(f)]||'application/octet-stream'})});
 const page=await ctx.newPage(),errs=[];page.on('pageerror',e=>errs.push(String(e)));
 try{
  await page.goto(url);await page.waitForFunction(()=>typeof S!=='undefined'&&S.ready);
  assert.match(await page.textContent('body'),/Версия 018/);
  const scan=async file=>{await page.evaluate(()=>{S.d=null});await page.setInputFiles('#fi',path.join(FIX,file));await page.waitForFunction(()=>S.d&&S.d.ocrRes&&!S.ocr.busy,null,{timeout:240000});return page.evaluate(()=>({items:S.d.items.map(x=>({name:x.name,qty:x.qty,sum:x.sum,st:x.st,how:x.how,priceOk:x.priceOk,price:x.price&&x.price.unit})),sec:S.d.ocrRes.sec,no:S.d.no,ex:S.d.ex}))};
  /* 1) чек 1044874: 4 блюда (2 известных и 2, добавленных в справочник 017) */
  const r1=await scan('1044874.jpg');
  assert.strictEqual(r1.no,'1044874');assert.strictEqual(r1.ex,'4836916');
  assert.deepStrictEqual(r1.items.map(x=>[x.name,x.qty]),[['Соевый соус на вынос шт',1],['Имбирь на вынос шт',1],['Сельдь с картофелем беби',1],['Мясной гриль',1]]);
  assert.ok(r1.items.every(x=>x.st==='o'),JSON.stringify(r1.items));assert.ok(r1.items.some(x=>x.how==='neural'));
  assert.match(await page.textContent('#app'),/по нейросети/);
  /* подтвердить всё, что просит подтверждения, и создать заказ */
  for(let k=0;k<20;k++){const c=await page.$('[data-a=cf]');if(!c)break;await c.click()}const w=await page.$('[data-f=warnok]');if(w)await w.check();
  await page.click('[data-a=create]');await page.waitForFunction(()=>S.v==='order');
  /* 018: заказ называется по ID заказа; после сборки — скопировать ID / отправить чек, заказ и ID */
  assert.strictEqual((await page.textContent('h1')).trim(),'ID 4836916');assert.strictEqual(await page.$('[data-a=cpid]'),null);
  const qs=await page.evaluate(()=>S.orders.find(o=>o.id===S.id).items.map(i=>i.q));for(let i=0;i<qs.length;i++)for(let k=0;k<qs[i];k++)await page.click(`[data-a=inc][data-i="${i}"]`);
  await page.click('[data-a=cpid]');assert.strictEqual(await page.evaluate(()=>navigator.clipboard.readText()),'4836916');
  await page.evaluate(()=>{navigator.clipboard.writeText('');document.querySelector('#toast').textContent=''});await page.click('[data-a=share]');await page.waitForFunction(()=>/скопирован|отправ/i.test(document.querySelector('#toast').textContent));
  assert.strictEqual(await page.evaluate(()=>navigator.clipboard.readText()),'4836916');
  const pr=await page.evaluate(async()=>(await DBX.prices()).map(p=>[p.name,p.unit]).sort());
  assert.deepStrictEqual(pr,[['Имбирь на вынос шт',11.77],['Мясной гриль',311.89],['Сельдь с картофелем беби',37.37],['Соевый соус на вынос шт',9.95]]);
  /* 2) чек 1044880: соус ×2 = 19.90 и имбирь ×2 = 23.54 сверяются с ценами первого чека */
  await page.click('[data-a=home]');const r2=await scan('1044880.jpg');
  const soy=r2.items.find(x=>/Соевый/.test(x.name)),gin=r2.items.find(x=>/Имбирь/.test(x.name));
  assert.ok(soy&&soy.priceOk&&soy.qty===2,JSON.stringify(soy));assert.ok(gin&&gin.priceOk&&gin.qty===2,JSON.stringify(gin));
  assert.match(await page.textContent('#app'),/Цена 9\.95 за шт\..*сумма строки сходится/);
  /* 018: тот же ID второй раз — предупреждение, «Создать заказ» заблокирован, пока не отмечено «это другой заказ» */
  await page.click('[data-a=home]');await scan('1044874.jpg');assert.match(await page.textContent('#app'),/Заказ с ID 4836916 уже есть/);
  assert.ok(await page.$eval('[data-a=create]',e=>e.disabled));await page.check('[data-f=dupok]');
  for(let k=0;k<20;k++){const c=await page.$('[data-a=cf]');if(!c)break;await c.click()}const w2=await page.$('[data-f=warnok]');if(w2)await w2.check();
  assert.ok(!(await page.$eval('[data-a=create]',e=>e.disabled)));
  /* 3) справочник: цена видна; экспорт CSV содержит колонку цены */
  await page.click('[data-a=home]');await page.click('[data-a=dict]');await page.fill('[data-f=ds]','Имбирь на вынос');assert.match(await page.textContent('#app'),/цена 11\.77/);
  const csv=await page.evaluate(()=>GPD.toCSV(S.dict,GPR.priceMap(S.prices)));assert.match(csv,/Цена за ед\./);assert.match(csv,/Имбирь на вынос шт;[^\r\n]*;11\.77;/);
  /* экран 360 px: нет горизонтальной прокрутки */
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  assert.deepStrictEqual(errs,[]);
  console.log(`  распознавание в Chromium: ${r1.sec.toFixed(1)} с и ${r2.sec.toFixed(1)} с (desktop, не телефон)`);
 }finally{await b.close();srv.close()}});
