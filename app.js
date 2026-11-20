const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={engine:(()=>{try{return localStorage.getItem('gp-engine')||'neural'}catch(e){return'neural'}})(),orders:[],dict:[],recs:[],rules:[],prices:[],learnRemove:null,learnClear:false,idx:[],srch:null,edit:null,ddk:null,dr:false,dcat:'',v:'home',id:null,d:null,ds:'',dn:'',fin:false,photoOpen:false,ocr:{},msg:'',ph:{},viewer:null,pick:null,repl:0,phErr:null,saveErr:'',busy:false};const DAY=864e5,norm=GP.norm;
function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='toast on'+(bad?' bad':'');clearTimeout(toast.h);toast.h=setTimeout(()=>t.className='toast',bad?8000:3000)}
/* ---------- IndexedDB (014: заказы, фото, справочник, подтверждённые исправления OCR) ---------- */
let DBX=null,dbErr='';
async function initDB(){try{DBX=await DB.open()}catch(e){DBX=null;dbErr=(e&&e.message)||'ошибка'}}
async function saveOrder(o){if(!DBX||!await DBX.putOrder(o)){toast('Прогресс заказа НЕ сохранён в память телефона',1);return false}return true}
async function cleanup(){if(!DBX)return;const ids=await DBX.expire(Date.now());if(!ids.length)return;S.orders=S.orders.filter(o=>!ids.includes(o.id));ids.forEach(id=>{delete S.ph[id+':receipt'];delete S.ph[id+':delivery']});if(S.viewer&&ids.includes(S.viewer.id))S.viewer=null;if(S.v==='order'&&!S.orders.find(o=>o.id===S.id))S.v='home';render()}
const newId=()=>{let i=Date.now();while(S.orders.some(x=>x.id===i))i++;return i};
/* ---------- Справочник (010): встроенная база (dict-seed.js) + локальные правки в IndexedDB; сопоставление — matcher.js ---------- */
function rebuildDict(){S.dict=GPD.build(GP_SEED.items,S.recs||[]).sort((a,b)=>a.n.localeCompare(b.n,'ru'));S.idx=GPM.index(S.dict)}
const seedKeys=new Set(GP_SEED.items.map(x=>GPD.key(x.n)));
/* статус позиции: o — в справочнике (подтверждать не нужно), s — похоже, нужен один тап, u — нет в справочнике; исходный текст OCR хранится в x.ocr */
/* статус позиции (017: review.js — правила 014, решение нейросети, справочник, цены); исходный текст OCR хранится в x.ocr */
function recheck(d){GPR.review(d,{idx:S.idx,dict:S.dict,rules:S.rules,prices:S.prices})}
/* 017: цены за единицу из подтверждённого заказа по чеку (только если сумма позиций сошлась с итогом чека: так в базу не попадёт неверно прочитанная сумма) */
async function savePrices(d){try{if(!DBX||d.origin==='screenshot'||!d.checkOk)return;const L=GPR.pricesFrom(d.items,S.dict,S.idx);if(!L.length)return;if(await DBX.putPrices(L)){const ks=new Set(L.map(p=>p.k));S.prices=[...S.prices.filter(p=>!ks.has(p.k)),...L]}}catch(e){}}
const priceOf=k=>GPR.priceMap(S.prices).get(k)||null;
/* цена из формы справочника: пусто — удалить, число — сохранить с сегодняшней датой */
async function editPrice(oldK,k,name,v){if(!DBX)return;const was=priceOf(oldK),t=String(v==null?'':v).replace(',','.').trim();
 if(!t){if(was){await DBX.delPrice(oldK);S.prices=S.prices.filter(p=>p.k!==oldK)}return}const u=+t;if(!(u>0)||u>1e6)return toast('Цена: укажите число больше 0',1);
 if(was&&oldK!==k){await DBX.delPrice(oldK);S.prices=S.prices.filter(p=>p.k!==oldK)}if(was&&oldK===k&&Math.abs(was.unit-u)<.005)return;
 const rec={k,name,unit:+u.toFixed(2),t:Date.now(),src:'manual'};if(await DBX.putPrices([rec]))S.prices=[...S.prices.filter(p=>p.k!==k),rec];else toast('Цена не сохранилась',1)}
async function importPrices(items){if(!DBX)return 0;const L=[],t=Date.now();for(const it of items||[]){if(!(it.p>0))continue;const m=GPM.match(it.n,S.idx);if(m.st!=='o'||!['exact','alias'].includes(m.how))continue;L.push({k:m.d.k,name:m.d.n,unit:+(+it.p).toFixed(2),t:it.pt||t,src:'import'})}
 if(!L.length)return 0;if(!(await DBX.putPrices(L)))return 0;const ks=new Set(L.map(p=>p.k));S.prices=[...S.prices.filter(p=>!ks.has(p.k)),...L];return L.length}
async function dictPut(rec){if(DBX&&await DBX.putDict(rec)){S.recs=(S.recs||[]).filter(r=>r.k!==rec.k);S.recs.push(rec);rebuildDict();return true}toast('Справочник не сохранился',1);return false}
async function dictDrop(k){const ok=seedKeys.has(k)?await DBX.putDict({k,del:true}):await DBX.delDict(k);if(!ok)return toast('Справочник не сохранился',1),false;S.recs=(S.recs||[]).filter(r=>r.k!==k);if(seedKeys.has(k))S.recs.push({k,del:true});rebuildDict();return true}
async function addDict(name,cat){name=GPD.clean(name);const k=GPD.key(name);if(!k)return false;if(S.dict.some(x=>x.k===k)){toast('Такое блюдо уже есть в справочнике',1);return false}return dictPut({k,n:name,c:GPD.clean(cat),a:[],src:'user'})}
async function importDict(f){let r;try{r=await GPD.parseFile(f.name,await f.arrayBuffer())}catch(e){S.msg='Не удалось прочитать файл: '+esc(e.message);return render()}
 const m=GPD.merge(S.dict,r.items);if(m.save.length&&!(DBX&&await DBX.putDictMany(m.save))){S.msg='';toast('Справочник не сохранился',1);return render()}
 m.save.forEach(x=>{S.recs=(S.recs||[]).filter(y=>y.k!==x.k);S.recs.push(x)});rebuildDict();const np=await importPrices(r.items);
 S.msg=`Прочитано листов: ${r.info.length} (${r.info.map(x=>`«${esc(x.sheet)}»: ${x.rows}`).join(', ')}). Добавлено блюд: ${m.added}, дополнено (алиасы, раздел): ${m.updated}, уже были: ${m.same}.${np?` Цен: ${np}.`:''}`;render()}
function exportDict(){const b=new Blob([GPD.toCSV(S.dict,GPR.priceMap(S.prices))],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='goner-pack-spravochnik.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);toast('Справочник сохранён в файл')}
/* ---------- Заказы ---------- */
const tot=o=>o.items.reduce((a,i)=>a+i.q,0),got=o=>o.items.reduce((a,i)=>a+i.g,0),left=GPC.left;
const stt=GPC.status;
const fmt=t=>new Date(t).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
const blank=()=>({name:'',qty:1,kind:'dish',doubt:[],cf:false,st:'u'});
const bar=o=>{const p=tot(o)?Math.round(got(o)/tot(o)*100):0;return`<div class="bar"><i class="${p===100?'f':''}" style="width:${p}%"></i></div>`};
/* 018: чем заказ определяется: по чеку — ID заказа (доп. ID), навынос — номер заказа */
const oid=o=>o.type==='takeaway'?String(o.no||''):String(o.ex||o.no||''),oTitle=o=>o.type==='takeaway'?'№ '+oid(o):'ID '+oid(o);
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}ta.remove();return ok}}
/* 018: отправить фото чека + фото собранного заказа + ID одним действием (меню «Поделиться» телефона: Telegram, WhatsApp…).
   Буфер обмена браузера держит только текст или одну картинку, поэтому ID сначала копируется в буфер — его можно вставить подписью. */
async function shareOrder(o){const id=oid(o),files=[];
 for(const k of['receipt','delivery']){if(!(k==='receipt'?o.hasReceipt:o.hasDelivery))continue;const src=S.ph[o.id+':'+k]||(DBX&&await DBX.getPhoto(o.id,k));if(!src)continue;
  try{const b=await(await fetch(src)).blob();files.push(new File([b],`${id}-${k==='receipt'?'chek':'zakaz'}.jpg`,{type:b.type||'image/jpeg'}))}catch(e){}}
 const copied=await copyText(id);
 if(files.length&&navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files,text:(o.type==='takeaway'?'Заказ № ':'ID заказа ')+id,title:oTitle(o)});toast(copied?'ID '+id+' также скопирован в буфер':'Отправлено');return}catch(e){if(e&&e.name==='AbortError')return toast(copied?'Отправка отменена. ID '+id+' скопирован':'Отправка отменена')}}
 toast(copied?'Этот браузер не умеет отправлять фото из приложения. ID '+id+' скопирован — фото откройте в заказе':'Не удалось ни отправить, ни скопировать',!copied)}
function card(o){const[s,c]=stt(o);return`<div class="card" data-a="open" data-id="${o.id}"><div class="hd"><span class="no">${esc(oTitle(o))} ${o.type==='takeaway'?'<span class="type-pill">🥡 Навынос</span>':''}</span><span class="pill ${c}">${s}</span></div>
<div class="mu">${o.type==='takeaway'?'Официант '+esc(o.waiter||'не указан')+(o.due?' · к '+esc(o.due):'')+(o.table?' · стол №'+esc(o.table):'')+(o.guest?' · гость '+esc(o.guest):''):(o.no&&o.no!==oid(o)?'предчек № '+esc(o.no):'Доставка')} · создан в ${fmt(o.t)} · ${o.type==='takeaway'?'скриншот':'чек'} ${o.hasReceipt?'📄':'—'}${o.type==='takeaway'?'':' · доставка '+(o.hasDelivery?'📦':'—')}</div>${bar(o)}<div class="hd mu"><span>Собрано ${got(o)} из ${tot(o)}</span><span>${o.done?'':'Осталось позиций: '+left(o)}</span></div></div>`}
function vHome(){const L=[...S.orders].sort((a,b)=>(a.done-b.done)||b.t-a.t);
 return`<div class="top"><h1>GONER PACK</h1><button class="ib2" data-a="dict">Справочник · ${S.dict.length}</button></div>${DBX?'':`<div class="bn">Память телефона (IndexedDB) недоступна${dbErr?': '+esc(dbErr):''}. Создать заказ нельзя: он не сохранится.</div>`}
 ${L.length?L.map(card).join(''):'<div class="emp">Заказов пока нет.<br>Добавьте чек доставки или скриншот официанта для навыноса.</div>'}
 <div class="mu" style="text-align:center;margin-top:14px">Версия 018 · справочник ${S.dict.length} · <a href="lab.html">OCR LAB</a></div>
 <div class="fab"><button class="big" data-a="take">🥡 Навынос по скриншоту</button><div class="r home-actions"><button class="sm" data-a="scan">📷 Сканировать чек</button><button class="sm" data-a="manual">Ввести вручную</button></div></div>`}
const pickBtns=()=>`<div class="r"><button class="sm" data-a="pickc" ${S.busy?'disabled':''}>📷 Камера</button><button class="sm" data-a="pickg" ${S.busy?'disabled':''}>🖼 Галерея</button></div>`;
function phCard(o,k){const t=k==='receipt'?(o.type==='takeaway'?'Скриншот официанта':'Фото чека'):'Фото готовой доставки',has=k==='receipt'?o.hasReceipt:o.hasDelivery,src=S.ph[o.id+':'+k];let b=`<div class="card"><b>${t}</b>`;
 if(has)b+=src?`<img class="th" src="${src}" data-a="view" data-k="${k}" alt="${t}"><div class="mu">Нажмите, чтобы открыть крупно</div>`:`<div class="mu">${src===false?'Фото не читается из памяти телефона':'Загрузка фото…'}</div>`;
 else if(k==='receipt')b+='<div class="mu">У заказа нет фото чека (введён вручную).</div>';
 else if(GPC.canAddDelivery(o))b+=`<div class="mu">Сфотографируйте собранный и упакованный заказ перед передачей курьеру.</div>${pickBtns()}`;
 else b+=`<div class="mu">${o.done?'Фото не добавлено':'Станет доступно, когда отмечены все позиции'}</div>`;
 if(k==='delivery'&&has&&GPC.canReplaceDelivery(o))b+=S.repl===0?`<div class="r"><button class="sm" data-a="repl">Заменить фото</button></div>`:S.repl===1?`<div class="r"><b style="flex:1">Заменить фото доставки? Старое останется, пока новое не сохранится.</b></div><div class="r"><button class="sm" data-a="repno">Отмена</button><button class="sm" data-a="repyes">Да, заменить</button></div>`:`${pickBtns()}<div class="r"><button class="sm" data-a="repno">Отмена</button></div>`;
 if(k==='delivery'&&S.phErr&&S.phErr.id===o.id)b+=`<div class="bn" style="margin:8px 0 0">Фото НЕ сохранилось в память телефона.<div class="r"><button class="sm" data-a="phretry" ${S.busy?'disabled':''}>Повторить</button><button class="sm" data-a="phdrop">Отменить</button></div></div>`;
 return b+'</div>'}
function vOrder(){const o=S.orders.find(x=>x.id===S.id),[s,c]=stt(o),oth=S.orders.filter(x=>!x.done),fb=GPC.finishBlock(o);
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>${esc(oTitle(o))}</h1><span class="pill ${c}">${s}</span></div>
 ${oth.length>1?`<div class="chips">${oth.map(x=>`<button class="chip ${x.id===o.id?'on':''}" data-a="open" data-id="${x.id}">${esc(oTitle(x))} · ${got(x)}/${tot(x)}</button>`).join('')}</div>`:''}
 <div class="card"><div class="mu">${o.type==='takeaway'?'🥡 Навынос · официант: '+esc(o.waiter||'не указан')+(o.due?' · к '+esc(o.due):'')+(o.table?' · стол №'+esc(o.table):'')+(o.guest?' · гость '+esc(o.guest):''):'Доставка'+(o.no&&o.no!==oid(o)?' · предчек № '+esc(o.no):'')} · создан в ${fmt(o.t)}</div>${bar(o)}<div class="mu">Собрано ${got(o)} из ${tot(o)}. Заказ и его изображения удалятся через 24 часа после создания (проверка при запуске и пока приложение открыто).</div></div>
 ${o.note?`<div class="card wn"><b>Комментарий повару</b><div>${esc(o.note)}</div></div>`:''}
 ${phCard(o,'receipt')}
 ${o.items.map((i,k)=>`<div class="card"><div class="row ${i.g>=i.q?'full':''}"><span class="nm">${esc(i.n)} — ${i.q} шт.${i.takeaway?' <span class="mu">· 🥡 пометка навынос</span>':''}</span>${i.g>=i.q?'<span class="ck">✓</span>':''}</div>
 <div class="mu">Собрано: ${i.g}/${i.q}</div><div class="st"><button class="pm" data-a="dec" data-i="${k}" ${o.done?'disabled':''}>−</button><span class="cnt">${i.g}</span><button class="pm p" data-a="inc" data-i="${k}" ${o.done?'disabled':''}>+</button>
 <select data-f="g" data-i="${k}" ${o.done?'disabled':''}>${Array.from({length:i.q+1},(_,n)=>`<option ${n===i.g?'selected':''}>${n}</option>`).join('')}</select></div></div>`).join('')}
 ${o.type==='takeaway'?'':phCard(o,'delivery')}
 ${GPC.allDone(o)||o.done?`<div class="card"><b>${esc(oTitle(o))}</b><div class="r"><button class="sm" data-a="cpid">📋 Скопировать ID</button><button class="sm ok2" data-a="share">📤 Отправить чек, заказ и ID</button></div><div class="mu sm2">«Отправить» открывает меню «Поделиться» телефона с фото чека${o.type==='takeaway'?'':' и фото собранного заказа'}; ID заказа одновременно копируется в буфер — вставьте его подписью, если приложение-получатель не возьмёт текст.</div></div>`:''}
 ${o.done?'':`<div class="card">${S.fin===true?`<div class="r"><b style="flex:1">Завершить заказ?</b><button class="sm" data-a="no">Отмена</button><button class="sm" style="background:var(--ok);color:#fff" data-a="yes">Да</button></div>`:`<button class="big ${fb?'':'g'}" data-a="fin" ${fb?'disabled':''}>${fb||'Завершить заказ'}</button>`}</div>`}
 <button class="lnk" data-a="rm">${S.fin==='del'?'Нажмите ещё раз: заказ и обе фотографии удалятся':'Удалить заказ'}</button>`}
function renderViewer(){const v=S.viewer,el=$('#vw');let src=null,title='';
 if(v&&v.draft){src=S.d&&S.d.photo;title=S.d&&S.d.origin==='screenshot'?'Скриншот официанта (черновик)':'Фото чека (черновик)'}else if(v){const o=S.orders.find(x=>x.id===v.id);src=o&&S.ph[v.id+':'+v.k];title=(v.k==='receipt'?(o&&o.type==='takeaway'?'Скриншот официанта':'Фото чека'):'Фото готовой доставки')+(o?' · заказ '+oTitle(o):'')}
 if(!src){S.viewer=null;el.innerHTML='';return}
 el.innerHTML=`<div class="vw"><div class="vb"><b style="flex:1">${esc(title)}</b><button class="sm" data-a="zoom">${v.z?'Уменьшить':'Увеличить'}</button><button class="sm" data-a="vclose">Закрыть</button></div><div class="vs"><img src="${src}" style="width:${v.z?'250%':'100%'}" alt=""></div></div>`}
async function loadPhotos(o){for(const k of['receipt','delivery']){if(!(k==='receipt'?o.hasReceipt:o.hasDelivery)||S.ph[o.id+':'+k])continue;const d=DBX?await DBX.getPhoto(o.id,k):null;S.ph[o.id+':'+k]=d||false}if(S.v==='order'&&S.id===o.id)render()}
async function saveDelivery(o,data){S.busy=true;render();const ok=DBX?await DBX.savePhoto(o,'delivery',data):false;S.busy=false;
 if(!ok){S.phErr={id:o.id,data};toast('Фото НЕ сохранено',1);return render()}
 o.hasDelivery=true;S.ph[o.id+':delivery']=data;S.phErr=null;S.repl=0;toast('Фото готовой доставки сохранено');render()}
const qopts=q=>{const s=[...new Set([...Array.from({length:31},(_,n)=>n),q])].sort((a,b)=>a-b);return s.map(n=>`<option value="${n}" ${n===q?'selected':''}>${n===0?'?':n}</option>`).join('')};
const QL={good:['Сумма позиций сошлась с итогом чека. Названия всё равно сверьте с фото.','ok2'],ok:['Часть данных не подтверждена автоматически. Сверьте каждую позицию с фото.','wn'],bad:['Распознавание ненадёжно или позиции не найдены. Обрежьте фото и повторите или введите позиции вручную.','bad']};
function ocrCard(){const o=S.ocr||{},d=S.d,r=d.ocrRes;let h=`<div class="card"><b>Распознавание</b>`;
 if(o.busy)h+=`<div class="mu" id="ocrstep">${esc(o.step||'Подготовка…')}</div><div class="bar"><i id="ocrbar" style="width:${Math.round((o.pct||0)*100)}%"></i></div><div class="r"><button class="sm" data-a="ocrstop">Остановить</button></div><div class="mu">Фото не отправляется на сервер. При первом запуске скачиваются файлы модели (нужен интернет), потом распознавание идёт на телефоне.</div>`;
 else{if(o.msg)h+=`<div class="mu">${esc(o.msg)}</div>`;
  if(r)h+=r.engine&&r.engine!=='tesseract'?`<div class="mu">${esc(r.best)} · ${r.sec.toFixed(1)} с · строк: ${r.boxes||'—'}${r.rot?` · наклон ${r.rot}° исправлен`:''}${r.load&&r.load.loadMs?` · загрузка модели ${(r.load.loadMs/1000).toFixed(1)} с`:''}</div>`:`<div class="mu">Tesseract · проходов: ${r.runs.length} · выбран «${esc(r.best)}» · ${Math.round(r.sec)} с · область: ${r.mode==='manual'?'ваша рамка':r.mode==='text-box'?'найдена автоматически':'весь кадр'}</div>`;
  if(r&&r.engine==='neural'&&d.origin!=='screenshot'&&d.quality!=='good')h+=`<div class="r"><button class="sm" data-a="ocrfb">Сверить резервным Tesseract (дольше)</button></div><div class="mu">Нейросеть не подтвердила итог чека или номер. Резервный проход Tesseract объединится с её результатом.</div>`;
  if(d.ocrSrc)h+=`<div class="r"><span class="mu">Движок:</span><button class="sm ${S.engine==='neural'?'ok2':''}" data-a="eng" data-e="neural">Нейросеть</button><button class="sm ${S.engine==='tesseract'?'ok2':''}" data-a="eng" data-e="tesseract">Tesseract</button></div>`;
  h+=d.ocrSrc?`<div class="r"><button class="sm" data-a="ocr">Распознать заново</button><button class="sm" data-a="cropopen">✂ Обрезать и заново</button></div>${d.origin==='screenshot'?'<div class="mu">Если строки распознаны плохо, попробуйте другой движок и уточните позиции вручную.</div>':''}`:'<div class="mu">Фото нет: введите позиции вручную.</div>';
  if(r)h+=`<div class="r"><button class="lnk" data-a="diag" style="padding:4px 0">Скопировать диагностику OCR</button></div>`}
 return h+'</div>'}
/* 012: компактный счётчик; длинные карточки не нужны — правильно распознанные позиции не требуют действий */
function revCounts(d){const L=d.items.filter(x=>x.kind!=='cutlery'),need=d.items.filter(x=>GP.needsOk(x,true)),left=need.filter(x=>!x.cf).length,cut=d.items.filter(x=>x.kind==='cutlery').reduce((a,x)=>a+(x.qty||0),0);return{n:L.length,ok:d.items.length-left,left,need:need.length,cut,dict:L.filter(x=>x.st==='o').length}}
function revSummary(d){const c=revCounts(d),bulk=d.items.filter(x=>x.st==='u'&&!x.gb&&!x.cf&&!GP.hard(x).length&&x.kind!=='cutlery').length;
 return c.n?`<div class="cnt"><span class="ok">✓ ${c.ok} готово</span><span class="${c.left?'wn':'ok'}">${c.left?'⚠ проверить '+c.left:'проверять нечего'}</span><span>блюд ${c.n}</span><span>приборов ${c.cut}</span></div>${bulk>=2?`<div class="r" style="margin:0 0 10px"><button class="sm" data-a="cfall">Оставить как есть все блюда не из справочника (${bulk})</button></div>`:''}`:''}
function itemCard(x,k){const need=GP.needsOk(x,true),hd=GP.hard(x),cut=x.kind==='cutlery',pk=S.srch&&S.srch.i===k;
 const tag=cut?'<span class="tg o">Прибор</span>':x.st==='o'?`<span class="tg o">✓ В справочнике${x.how==='neural'?' · по нейросети':x.how==='neural+price'?' · по нейросети и цене':x.how==='price'?' · по цене':''}</span>`:x.st==='s'?'<span class="tg s">Похоже на запись справочника</span>':x.gb?'<span class="tg u">Похоже на ошибку распознавания</span>':'<span class="tg u">Нет в справочнике</span>';
 const was=x.fixed&&GPL.key(x.fixed)!==GPL.key(x.name)?`<div class="mu sm2">OCR: «${esc(x.fixed)}» → ${x.learned?'исправлено по вашему словарю':'исправлено по справочнику'}</div>`:'';
 const target=x.userEdited&&x.st==='o'?GPL.canLearn(x.ocr,x.name,S.dict):null;
 const known=target&&S.rules.some(r=>r.k===GPL.key(x.ocr)&&r.target===target.k);
 const learning=target&&!known?`<div class="r"><button class="sm learn-btn" data-a="learnsave" data-i="${k}">🧠 Запомнить исправление</button></div>`:known?'<div class="mu sm2">✓ Исправление уже запомнено</div>':'';
 const kk=v=>GPM.tokens(v).join(''),seen=new Set([kk(x.name)]),uniqN=v=>{const q=kk(v);if(seen.has(q))return false;seen.add(q);return true};
 const cands=x.st==='s'||x.st==='u'?(x.cand||[]).map((n,j)=>({n,j})).filter(z=>uniqN(z.n)).map(({n,j})=>`<button class="sm" data-a="acc" data-i="${k}" data-j="${j}">${x.st==='s'&&j===0?'Заменить на':'Возможно'} «${esc(n)}»</button>`).join(''):'';
 const alts=(x.alts||[]).map((n,j)=>({n,j})).filter(z=>{const m=GPM.match(z.n,S.idx);return!(m.st==='o'&&(m.name===x.name||(x.cand||[]).includes(m.name)))&&uniqN(z.n)}).slice(0,2).map(({n,j})=>`<button class="sm" data-a="alt" data-i="${k}" data-j="${j}">Другое прочтение «${esc(n)}»</button>`).join('');
 const srch=pk?`<div class="srch"><input data-f="sq" placeholder="Поиск по справочнику" value="${esc(S.srch.q)}" autocomplete="off">${GPM.search(S.srch.q||x.name,S.idx,6).map((r,j)=>`<div class="res" data-a="pickd" data-i="${k}" data-k="${esc(r.d.k)}"><b>${esc(r.n)}</b><span class="mu"> ${esc(r.c)}</span></div>`).join('')||'<div class="mu">Ничего не найдено</div>'}<div class="r"><button class="sm" data-a="srchx">Закрыть</button></div></div>`:'';
 return`<div class="card it ${need&&!x.cf?'wn':''}"><textarea class="nm" data-f="n" data-i="${k}" rows="${Math.max(1,Math.ceil(x.name.length/30))}" placeholder="Название" enterkeyhint="done">${esc(x.name)}</textarea>
 ${x.takeaway?'<div class="mu">🥡 Отмечено «навынос» на скриншоте</div>':''}
 <div class="r"><select data-f="q" data-i="${k}">${qopts(x.qty)}</select><span class="mu">шт.</span>${tag}<span style="flex:1"></span><button class="dl" data-a="del" data-i="${k}">✕</button></div>${was}${priceLine(x,k)}
 ${hd.length?`<div class="tg s">${hd.map(esc).join('; ')}</div>`:''}
 ${!cut&&x.st!=='o'?`<div class="r">${cands}${alts}<button class="sm" data-a="srch" data-i="${k}">🔍 Из справочника</button>${x.name.trim()?`<button class="sm" data-a="adddict" data-i="${k}">В справочник</button>`:''}</div>`:''}${srch}
 ${learning}
 ${need?(x.cf?'<div class="tg o">✓ Подтверждено</div>':`<div class="r"><button class="sm ok2" data-a="cf" data-i="${k}">${x.st==='o'?'Подтверждаю позицию':'Оставить как есть'}</button></div>`):''}</div>`}
/* 017: цена за единицу из справочника цен; предложение количества по цене одним нажатием */
function priceLine(x,k){if(x.kind==='cutlery')return'';let h='';if(x.price)h+=`<div class="mu sm2">Цена ${x.price.unit.toFixed(2)} за шт. (от ${new Date(x.price.t).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})})${x.priceOk?' · ✓ сумма строки сходится':''}</div>`;
 if(x.qtySug&&x.qtySug!==x.qty)h+=`<div class="r"><button class="sm" data-a="qsug" data-i="${k}">Количество по цене: ${x.qtySug}</button></div>`;
 if(x.qconf!=null&&x.qconf<.9&&x.kind!=='cutlery')h+=`<div class="mu sm2">Количество прочитано неуверенно (колонка «Кол-в»)</div>`;return h}
/* 018: такой ID уже есть среди заказов */
const dupOf=d=>d.origin==='screenshot'?null:S.orders.find(o=>o.type!=='takeaway'&&String(o.ex||'').trim()&&String(o.ex).trim()===String(d.ex||'').trim());
function dupWarn(d){const o=dupOf(d);return o?`<div class="bn" style="margin:0 0 8px">Заказ с ID ${esc(oid(o))} уже есть (создан в ${fmt(o.t)}).<div class="r"><button class="sm" data-a="open" data-id="${o.id}">Открыть его</button></div><label style="margin:6px 0 0;display:flex;gap:10px;align-items:center;color:var(--tx)"><input type="checkbox" data-f="dupok" style="width:24px;height:24px" ${d.dupOk?'checked':''}>Это другой заказ — всё равно создать</label></div>`:''}
const revErrors=(d,on)=>{const er=GP.validate(d,on);if(dupOf(d)&&!d.dupOk)er.unshift('Заказ с таким ID уже есть: откройте его или отметьте, что это другой заказ');return er};
function idWarn(d,lab){const w=(d.warn||[]).find(x=>x.startsWith(lab+' прочитан'));if(!w)return'';const m=w.match(/\(([^)]*)\): выбран (\d+)/);return`<div class="tg s" style="margin:4px 0 8px">${m?`Проходы OCR прочитали по-разному: ${esc(m[1])}. Выбран ${esc(m[2])} — сверьте с фото.`:esc(w)}</div>`}
function vRev(){const d=S.d,on=true,er=revErrors(d,on),o=S.ocr||{},q=d.quality&&QL[d.quality],dr=(d.dropped||[]).filter(l=>/[а-яё]{3}/i.test(l)&&l.replace(/[^а-яёa-z0-9]/gi,'').length>=6);
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>${d.origin==='screenshot'?'Проверка скриншота':'Проверка чека'}</h1></div>${S.msg?`<div class="bn">${S.msg}</div>`:''}
 ${d.photo?`<div class="thumb"><img src="${d.photo}" data-a="viewd" alt="Фото чека"><div class="mu">Нажмите на изображение, чтобы увеличить и сверить ${d.origin==='screenshot'?'заказ':'чек'}</div></div>`:''}
 ${ocrCard()}
 ${q&&!o.busy&&d.origin!=='screenshot'?`<div class="card ${q[1]}"><b>${esc(q[0])}</b></div>`:''}
 ${(d.warn||[]).filter(w=>!/^(Дополнительный ID|Номер предчека) прочитан/.test(w)).map(w=>`<div class="bn">${esc(w)}</div>`).join('')}
 <div class="card">${d.origin==='screenshot'?`<b>🥡 Заказ навынос</b><div class="mu" style="margin-top:5px">${d.noSource==='local'?'Номер создан автоматически: можно заменить на номер заказа со скриншота.':'Номер взят со скриншота — проверьте его.'}</div><label>Номер заказа<input data-f="no" inputmode="numeric" value="${esc(d.no)}"></label><label>Официант<input data-f="waiter" value="${esc(d.waiter||'')}" placeholder="Кто передал заказ"></label><label>К какому времени (необязательно)<input data-f="due" value="${esc(d.due||'')}" placeholder="Например, 14:30"></label><div class="mu" style="margin:8px 0">${d.screenMode==='table'?'Формат: таблица кассы · ПЦ = количество, Сумма = цена':d.screenMode==='card'?'Формат: карточки блюд с пометками «+ навынос»':'Распознавание скриншота'}</div><div class="r"><label style="flex:1">Стол (необязательно)<input data-f="table" inputmode="numeric" value="${esc(d.table||'')}" placeholder="№ стола"></label><label style="flex:1">Гость (необязательно)<input data-f="guest" inputmode="numeric" value="${esc(d.guest||'')}" placeholder="№ гостя"></label></div>`:`<label>ID заказа<input data-f="ex" inputmode="numeric" value="${esc(d.ex)}" class="${(d.warn||[]).some(w=>w.startsWith('Дополнительный ID прочитан'))?'wnf':''}"></label>${idWarn(d,'Дополнительный ID')}<div class="mu sm2" style="margin:-4px 0 8px">Число с двоеточием над приборами (например, 4837199:). По нему заказ виден в списке.</div>${dupWarn(d)}<label style="margin:0">Номер предчека (необязательно)<input data-f="no" inputmode="numeric" value="${esc(d.no)}"></label>`}</div>
 ${d.notes||d.origin==='screenshot'?`<div class="card"><label style="margin:0">Комментарий к заказу / упаковке<textarea data-f="notes" style="min-height:60px">${esc(d.notes||'')}</textarea></label></div>`:''}
 ${revSummary(d)}
 ${d.items.map((x,k)=>itemCard(x,k)).join('')}
 <button class="lnk" data-a="addrow">+ Добавить позицию</button>
 ${(d.skipped||[]).length?`<div class="card wn"><b>${d.origin==='screenshot'?'Неразобранные строки скриншота':'Строки таблицы, не вошедшие в позиции'}</b><div class="mu">${d.origin==='screenshot'?'Проверьте: здесь могут быть блюда, которые приложение не смогло сопоставить. Добавьте или уберите каждую строку.':'Это могут быть блюда с плохо прочитанными цифрами. Добавьте строку как позицию или уберите её.'}</div>${d.skipped.map((s,k)=>`<div class="r"><span style="flex:1">${esc(s.line)}</span><button class="sm" data-a="sk-add" data-i="${k}">Позиция</button><button class="dl" data-a="sk-rm" data-i="${k}">✕</button></div>`).join('')}</div>`:''}
 ${dr.length?`<details class="card"><summary>Текст вне таблицы, похожий на слова (${dr.length})</summary><div class="mu">Это не позиции: шапка, реклама, комментарии. Показано для проверки, что блюдо не потерялось.</div>${dr.slice(0,25).map(l=>`<div class="r"><span style="flex:1;font-size:14px">${esc(l)}</span><button class="sm" data-a="dr-add" data-t="${esc(l)}">Позиция</button></div>`).join('')}</details>`:''}
 ${(d.warn||[]).length?`<div class="card"><label style="margin:0;display:flex;gap:10px;align-items:center;color:var(--tx)"><input type="checkbox" data-f="warnok" style="width:24px;height:24px" ${d.warnOk?'checked':''}>Я сверил(а) номер, позиции и количества с фото</label></div>`:''}
 <details class="card"><summary>${d.origin==='screenshot'?'Текст скриншота (OCR)':'Текст чека (результат OCR)'}</summary><label style="margin:8px 0 0">Можно править или вставить свой<textarea data-f="txt" placeholder="Текст чека">${esc(d.txt||'')}</textarea></label><div class="r"><button class="sm" data-a="parse">Разобрать текст</button></div></details>
 ${er.length?`<div class="card"><ul class="er">${er.slice(0,5).map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>`:''}
 ${S.saveErr?`<div class="bn">${esc(S.saveErr)}</div>`:''}
 <div class="fab rv">${(()=>{const c=revCounts(d);return c.n?`<div class="fabc">✓ ${c.ok} из ${d.items.length}${c.left?` · ⚠ осталось проверить ${c.left}`:''}${er.length&&!c.left?' · '+esc(er[0]):''}</div>`:''})()}<button class="big" data-a="create" ${er.length||S.busy||o.busy?'disabled':''}>Создать заказ</button></div>`}
/* ---------- обрезка ---------- */
function vCrop(){return`<div class="top"><button class="ib" data-a="cropback">‹</button><h1>Обрезка чека</h1></div>
 <div class="mu" style="margin-bottom:8px">Потяните четыре угла так, чтобы чек занимал почти весь кадр. Наклон и перспектива будут выпрямлены.</div>
 <div class="cropw"><canvas id="cv"></canvas></div>
 <div class="r"><button class="sm" data-a="cropreset">Сбросить рамку</button><button class="sm" data-a="cropauto">Автоматически, без рамки</button></div>
 <div class="fab"><button class="big" data-a="cropgo">Распознать выбранную область</button></div>`}
const CR=S.crop={q:null,img:null,w:0,h:0,drag:-1,k:1};
function cropDraw(){const c=$('#cv');if(!c||!CR.img)return;const x=c.getContext('2d'),q=CR.q,k=CR.k;x.clearRect(0,0,c.width,c.height);x.drawImage(CR.img,0,0,c.width,c.height);
 x.save();x.fillStyle='rgba(0,0,0,.45)';x.beginPath();x.rect(0,0,c.width,c.height);x.moveTo(q[0][0]*k,q[0][1]*k);for(let i=3;i>=0;i--)x.lineTo(q[i][0]*k,q[i][1]*k);x.closePath();x.fill('evenodd');x.restore();
 x.strokeStyle='#2a9df4';x.lineWidth=3;x.beginPath();q.forEach((p,i)=>i?x.lineTo(p[0]*k,p[1]*k):x.moveTo(p[0]*k,p[1]*k));x.closePath();x.stroke();
 q.forEach(p=>{x.fillStyle='#fff';x.strokeStyle='#2a9df4';x.lineWidth=4;x.beginPath();x.arc(p[0]*k,p[1]*k,15,0,7);x.fill();x.stroke()})}
function cropInit(){const c=$('#cv');if(!c||!CR.img)return;const W=Math.min(540,document.documentElement.clientWidth-24);CR.k=W/CR.w;c.width=W;c.height=Math.round(CR.h*CR.k);c.style.width=W+'px';c.style.height=c.height+'px';cropDraw();
 const pos=e=>{const r=c.getBoundingClientRect();return[(e.clientX-r.left)/CR.k,(e.clientY-r.top)/CR.k]};
 c.onpointerdown=e=>{const p=pos(e);let b=-1,bd=44/CR.k;CR.q.forEach((v,i)=>{const d=Math.hypot(v[0]-p[0],v[1]-p[1]);if(d<bd){bd=d;b=i}});CR.drag=b;if(b>=0){c.setPointerCapture(e.pointerId);e.preventDefault()}};
 c.onpointermove=e=>{if(CR.drag<0)return;const p=pos(e);CR.q[CR.drag]=[Math.max(0,Math.min(CR.w,p[0])),Math.max(0,Math.min(CR.h,p[1]))];cropDraw()};
 c.onpointerup=c.onpointercancel=()=>{CR.drag=-1}}
function cropDefault(){const d=S.d,b=d&&d.box;if(b){const w=b.x1-b.x0,h=b.y1-b.y0,x0=Math.max(0,b.x0-.25*w),x1=Math.min(CR.w,b.x1+.25*w),y0=Math.max(0,b.y0-.25*h),y1=Math.min(CR.h,b.y1+.18*h);return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]}
 const m=.05;return[[CR.w*m,CR.h*m],[CR.w*(1-m),CR.h*m],[CR.w*(1-m),CR.h*(1-m)],[CR.w*m,CR.h*(1-m)]]}
async function cropOpen(){const d=S.d;if(!d||!d.ocrSrc)return;if(S.ocr.busy){toast('Сначала остановите распознавание',1);return}
 const img=new Image();await new Promise(r=>{img.onload=r;img.onerror=r;img.src=d.ocrSrc});if(!img.naturalWidth)return toast('Не удалось открыть фото',1);
 CR.img=img;CR.w=img.naturalWidth;CR.h=img.naturalHeight;CR.q=d.quad||cropDefault();go('crop');cropInit()}
function vDict(){const q=S.ds.trim(),L=q?GPM.search(q,S.idx,80).map(r=>r.d):S.dict.slice(0,80),srcT=d=>d.src==='seed'?'встроенный':d.src==='import'?'импорт':d.src==='edit'?'изменён':'вручную';
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>Справочник · ${S.dict.length}</h1></div>${S.msg?`<div class="bn">${S.msg}</div>`:''}
  <div class="card"><button class="sm" data-a="learnview">🧠 История исправлений · ${S.rules.length}</button><div class="mu" style="margin-top:6px">Здесь хранятся только подтверждённые вами исправления OCR. На других устройствах они пока не синхронизируются.</div></div>
  <div class="card"><button class="big" data-a="imp">Импорт Excel / CSV</button><div class="r"><button class="sm" data-a="exp">Экспорт CSV</button><button class="sm" data-a="dreset">${S.dr?'Точно сбросить?':'Вернуть встроенный'}</button>${S.dr?'<button class="sm" data-a="dresetno">Нет</button>':''}</div>
 <div class="mu">Читаются все листы Excel. Колонки: «Раздел», «Название позиции», «Алиасы (через |)», «Цена за ед.» (017, необязательно). Это стартовый набор, а не полный список блюд: если блюда нет — оно остаётся с текстом OCR и просит проверки. Справочник хранится только в этом телефоне.</div></div>
 <div class="card"><div class="r" style="margin:0"><input data-f="dn" placeholder="Новое блюдо" value="${esc(S.dn)}" style="flex:1"></div><div class="r"><input data-f="dc" placeholder="Раздел (необязательно)" value="${esc(S.dcat||'')}" style="flex:1"><button class="sm" data-a="dadd">Добавить</button></div></div>
 <div class="card"><input data-f="ds" placeholder="Поиск по справочнику" value="${esc(S.ds)}">${L.map(d=>S.edit&&S.edit.k===d.k?`<div class="srch"><input data-f="en" value="${esc(S.edit.n)}" placeholder="Название"><input data-f="ec" value="${esc(S.edit.c)}" placeholder="Раздел"><textarea data-f="ea" placeholder="Другие написания, по одному на строку" style="min-height:60px">${esc(S.edit.a)}</textarea><input data-f="ep" inputmode="decimal" value="${esc(S.edit.p||'')}" placeholder="Цена за 1 шт. (необязательно)"><div class="r"><button class="sm ok2" data-a="esave">Сохранить</button><button class="sm" data-a="ecancel">Отмена</button></div></div>`
  :`<div class="r"><div style="flex:1"><div>${esc(d.n)}</div><div class="mu">${esc(d.c||'без раздела')} · ${srcT(d)}${d.a.length?` · вариантов: ${d.a.length}`:''}${(p=>p?` · цена ${p.unit.toFixed(2)} (от ${new Date(p.t).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'})})`:'')(priceOf(d.k))}</div></div>${S.ddk===d.k?`<button class="sm" data-a="ddyes" data-k="${esc(d.k)}">Удалить?</button><button class="sm" data-a="ddno">Нет</button>`:`<button class="sm" data-a="dedit" data-k="${esc(d.k)}">✎</button><button class="dl" data-a="ddel" data-k="${esc(d.k)}">✕</button>`}</div>`).join('')||'<div class="mu" style="padding-top:8px">Ничего не найдено</div>'}${!q&&S.dict.length>80?'<div class="mu">Показаны первые 80, используйте поиск.</div>':''}</div>`}
function vLearn(){const rules=[...S.rules].sort((a,b)=>(b.t||0)-(a.t||0));
 return`<div class="top"><button class="ib" data-a="dict">‹</button><h1>История исправлений · ${rules.length}</h1></div>
 <div class="card"><div class="mu">Исправления сохраняются только после вашего нажатия «Запомнить исправление». Они не изменяют фото и не заменяют незнакомые блюда по догадке. При удалении правила следующее распознавание использует обычный справочник.</div></div>
 ${rules.map(r=>{const d=S.dict.find(x=>x.k===r.target);return`<div class="card"><div class="mu">OCR прочитал:</div><b>${esc(r.raw)}</b><div class="learn-arrow">↓</div><div>${d?esc(d.n):'<span class="tg u">Блюдо больше не найдено в справочнике — правило не применяется</span>'}</div><div class="r">${S.learnRemove===r.k?`<button class="sm" data-a="lrmyes" data-k="${esc(r.k)}">Точно удалить?</button><button class="sm" data-a="lrmno">Отмена</button>`:`<button class="sm" data-a="lrm" data-k="${esc(r.k)}">Удалить правило</button>`}</div></div>`}).join('')||'<div class="emp">Пока нет сохранённых исправлений. Исправьте название в проверке чека и нажмите «Запомнить исправление».</div>'}
 ${rules.length?`<div class="r">${S.learnClear?'<button class="sm" data-a="lclearyes">Да, удалить все</button><button class="sm" data-a="lclearno">Отмена</button>':'<button class="sm" data-a="lclear">Очистить всю историю</button>'}</div>`:''}`}
function render(){const y=scrollY;$('#app').innerHTML={home:vHome,order:vOrder,rev:vRev,dict:vDict,learn:vLearn,crop:vCrop}[S.v]();scrollTo(0,y);renderViewer();if(S.v==='crop')cropInit()}
const go=v=>{S.v=v;S.msg='';S.saveErr='';S.repl=0;S.fin=false;scrollTo(0,0);render()};
/* ---------- Фото и OCR ---------- */
function shrink(f,mx,q){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,mx/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);r(c.toDataURL('image/jpeg',q))};i.onerror=()=>r(null);i.src=fr.result};fr.onerror=()=>r(null);fr.readAsDataURL(f)})}
const decode=u=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);const id=x.getImageData(0,0,c.width,c.height);ok({w:c.width,h:c.height,d:id.data})};i.onerror=()=>no(new Error('не удалось открыть фото'));i.src=u});
function applyParse(d){const r=d.origin==='screenshot'?GPS.parse(d.txt||'',{matcher:GPM,idx:S.idx}):GP.parse(d.txt||'');if(d.origin==='screenshot')fillScreenshot(d,r);else fillFrom(d,r);return r}
function fillFrom(d,p){if(p.no)d.no=p.no;d.ex=p.ex||d.ex||'';d.items=p.items.length?p.items.map(x=>({...x,cf:false})):[blank()];d.skipped=p.skipped;d.dropped=p.dropped;d.notes=p.notes||d.notes||'';d.warn=p.warn.filter(w=>!/^Номер предчека/.test(w));d.quality=p.quality;d.checkOk=!!(p.check&&p.check.ok);d.warnOk=false;
 if(p.quality!=='good'&&!p.check)d.warn.push(p.items.length?'Итог чека не найден или не подтвердил сумму позиций: сверьте каждую позицию с фото.':'Позиции в тексте не найдены.');recheck(d)}
/* 015: скриншоты официантов — отдельный режим OCR, без предположения о структуре предчека. */
function fillScreenshot(d,p){
 d.items=p.items.length?p.items:[blank()];d.skipped=p.skipped;d.dropped=[];d.warn=[...p.warn];d.warnOk=false;d.quality='';d.ex='';
 if(p.no){d.no=p.no;d.noSource='screenshot'}
 d.table=p.table||d.table||'';d.guest=p.guest||d.guest||'';d.screenMode=p.mode||'';
 if(p.notes&&!d.notes)d.notes=p.notes;
 recheck(d);
 // Количество «1» без явного указания в скриншоте требует ручного подтверждения, даже если название есть в базе.
}
async function runScreenshotOcr(opts){
 opts=opts||{};const d=S.d;if(!d||d.origin!=='screenshot'||!d.ocrSrc||S.ocr.busy)return;
 const run={cancel:false};S.ocr={busy:true,run,step:'Чтение скриншота…',pct:0,msg:''};render();
 const eng=opts.engine||S.engine,quad=opts.quad===undefined?(d.quad||null):opts.quad;
 let res,used='',note='';
 try{
  const src=await decode(d.ocrSrc);
  if(eng==='neural'&&window.NEURAL_WEB){try{
   const nr=await NEURAL_WEB.recognize(src,{quad,qtyColumn:false,onProgress:ev=>ocrProgress(run,ev),cancelled:()=>run.cancel});
   res={text:nr.text,layout:nr.lines,width:nr.size&&nr.size[0],ms:nr.ms.total,boxes:nr.boxes,rot:nr.rot,load:nr.load};used='neural';
  }catch(e){if(run.cancel)throw e;note='Нейросеть недоступна, переключено на Tesseract. ';}}
  if(!res){const t0=performance.now(),gray=IMG.gray(src),tr=await OCR.recognize(gray,{psm:11},p=>ocrProgress(run,{phase:'variant',run:1,runs:1,pct:p,label:'Tesseract: чтение скриншота'}));
   const gl=tr.words&&tr.words.length?GP.linesFromWords(tr.words):null;res={text:gl&&gl.text||tr.text,layout:gl&&gl.lines?gl.lines.map(l=>({...l,parts:l.w})):null,width:gray.w,ms:performance.now()-t0,boxes:tr.words.length,rot:0};used='tesseract'}
 }catch(e){if(S.d!==d)return;S.ocr={msg:run.cancel?'Распознавание остановлено.':'Скриншот не распознан: '+e.message+'. Введите позиции вручную.'};return render()}
 if(S.d!==d)return;if(run.cancel){S.ocr={msg:'Распознавание остановлено.'};return render()}
 d.txt=res.text;const p=GPS.parse(res.text,{matcher:GPM,idx:S.idx,layout:res.layout,width:res.width});fillScreenshot(d,p);
 d.ocrRes={engine:used,best:used==='neural'?'Нейросеть · скриншот':'Tesseract · скриншот',sec:res.ms/1000,boxes:res.boxes,rot:res.rot,load:res.load,runs:[{id:used}],mode:'screenshot',diag:'GONER PACK 017 · Скриншот ('+p.mode+')\n'+res.text};
 S.ocr={msg:note+(p.items.length?`Найдено позиций: ${p.items.length}. Неоднозначные строки: ${p.skipped.length}. Проверьте скриншот перед созданием заказа.`:'Блюда не определены уверенно. Добавьте позиции вручную по скриншоту.')};render();
}
function ocrProgress(run,ev){if(run.cancel)return;const o=S.ocr;o.pct=ev.pct||0;const ph=ev.phase==='variant'?`Проход ${ev.run} из ${ev.runs}: ${ev.label}`:ev.label||'Подготовка';o.step=ph+(ev.pct?` — ${Math.round(ev.pct*100)}%`:'');const a=$('#ocrstep'),b=$('#ocrbar');if(a)a.textContent=o.step;if(b)b.style.width=Math.round((ev.phase==='variant'?(((ev.run-1)+(ev.pct||0))/ev.runs):ev.phase==='neural-load'?(ev.pct||0)*.3:ev.phase==='neural-det'?.35:ev.phase==='neural-rec'?.4+(ev.pct||0)*.6:(ev.pct||0)*.2)*100)+'%'}
/* 013: движок по умолчанию — нейросеть (Neural OCR). Tesseract 012 — резервный: выбирается вручную, по кнопке «Сверить резервным Tesseract»
   или автоматически, только если нейросеть не загрузилась (нет интернета при первом запуске, старый браузер). */
async function runOcr(opts){opts=opts||{};const d=S.d;if(!d||!d.ocrSrc||S.ocr.busy)return;const run={cancel:false};S.ocr={busy:true,run,step:'Подготовка…',pct:0,msg:''};if(S.v!=='rev')go('rev');else render();
 const match=n=>GPM.match(n,S.idx),quad=opts.quad===undefined?(d.quad||null):opts.quad,eng=opts.engine||S.engine;let res,note='';
 const tess=src=>PIPE.recognizeReceipt(src,{recognize:(img,p,cb)=>OCR.recognize(img,p,cb),quad,match,onProgress:ev=>ocrProgress(run,ev),cancelled:()=>run.cancel});
 try{const src=await decode(d.ocrSrc);
  if(eng==='neural'&&window.NEURAL_WEB){try{const nr=await NEURAL_WEB.recognize(src,{quad,onProgress:ev=>ocrProgress(run,ev),cancelled:()=>run.cancel});if(nr.cancelled)res={cancelled:true};else{res=PIPE.fromNeural(nr,{match,dict:S.dict});ocrProgress(run,{phase:'neural-rec',pct:1,label:'Нейросеть: повторное чтение трудных строк'});try{await PIPE.refineNeural(res,nr,{match,dict:S.dict})}catch(e){}if(nr.release)nr.release();delete res.neuralSegs;res.load=nr.load;d.ocrNeural=res}}
   catch(e){if(run.cancel)throw e;note=`Нейросеть недоступна (${e.message}) — использован Tesseract. `;res=await tess(src)}}
  else if(eng==='fallback'&&d.ocrNeural){const t=await tess(src);if(t.cancelled)res=t;else{res=PIPE.mergeEngines(d.ocrNeural,t,{match});res.load=d.ocrNeural.load}}
  else res=await tess(src)}
 catch(e){if(S.d!==d)return;S.ocr={msg:run.cancel?'Распознавание остановлено.':'Ошибка распознавания: '+e.message+'. Введите позиции вручную или повторите при наличии интернета.'};return render()}
 if(S.d!==d)return;if(res.cancelled||run.cancel){S.ocr={msg:'Распознавание остановлено.'};return render()}
 d.txt=res.best.text;d.box=res.locate.box||d.box||null;fillFrom(d,res.parsed);
 d.ocrRes={best:res.best.label,runs:res.runs,sec:res.totalMs/1000,mode:res.locate.mode,engine:res.engine||'tesseract',boxes:res.locate.boxes,rot:res.locate.rot,load:res.load,diag:PIPE.diagnostics(res,navigator.userAgent)};
 S.ocr={msg:note+(res.parsed.items.length?'Готово. Проверьте номер, ID и позиции по фото: заказ автоматически не создаётся.':'Позиции не найдены.')};render()}
/* ---------- События ---------- */
document.addEventListener('click',async e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,i=+b.dataset.i,o=S.orders.find(x=>x.id===S.id),d=S.d;
 if(a==='home'){if(S.ocr.run)S.ocr.run.cancel=true;if(S.ocr.busy)OCR.cancel();S.ocr={};go('home')}else if(a==='dict')go('dict');else if(a==='learnview')go('learn');else if(a==='take')$('#fs').click();else if(a==='scan')$('#fi').click();else if(a==='imp')$('#fd').click();
 else if(a==='manual'){S.d={id:newId(),no:'',ex:'',photo:null,items:[blank()],skipped:[]};S.ocr={};go('rev')}
 else if(a==='open'){S.id=+b.dataset.id;S.phErr=null;go('order');loadPhotos(S.orders.find(x=>x.id===S.id))}
 else if(a==='view'){S.viewer={id:o.id,k:b.dataset.k,z:0};render()}else if(a==='zoom'){S.viewer.z=S.viewer.z?0:1;renderViewer()}else if(a==='vclose'){S.viewer=null;renderViewer()}
 else if(a==='pickc'){S.pick=o.id;$('#fc').click()}else if(a==='pickg'){S.pick=o.id;$('#fg').click()}
 else if(a==='repl'){S.repl=1;render()}else if(a==='repyes'){S.repl=2;render()}else if(a==='repno'){S.repl=0;render()}
 else if(a==='phretry'){const e=S.phErr,x=e&&S.orders.find(y=>y.id===e.id);if(x&&!S.busy)await saveDelivery(x,e.data)}else if(a==='phdrop'){S.phErr=null;render()}
 else if(a==='inc'||a==='dec'){const t=o.items[i];t.g=Math.max(0,Math.min(t.q,t.g+(a==='inc'?1:-1)));if(navigator.vibrate)navigator.vibrate(15);saveOrder(o);render()}
 else if(a==='fin'){S.fin=true;render()}else if(a==='no'){S.fin=false;render()}
 else if(a==='yes'){if(!GPC.canFinish(o)){S.fin=false;toast(GPC.finishBlock(o),1);return render()}if(!DBX||!await DBX.putOrder({...o,done:true})){S.fin=false;toast('Завершение заказа НЕ сохранено',1);return render()}o.done=true;S.fin=false;go('home')}
 else if(a==='rm'){if(S.fin==='del'){if(!(DBX&&await DBX.deleteOrder(o.id))){S.fin=false;toast('Не удалось удалить заказ и фото',1);return render()}S.orders=S.orders.filter(x=>x!==o);delete S.ph[o.id+':receipt'];delete S.ph[o.id+':delivery'];go('home')}else{S.fin='del';render()}}
 else if(a==='ocr')(d&&d.origin==='screenshot'?runScreenshotOcr():runOcr());
 else if(a==='ocrfb')(d&&d.origin==='screenshot'?runScreenshotOcr({engine:'tesseract'}):runOcr({engine:'fallback'}));
 else if(a==='eng'){S.engine=b.dataset.e;try{localStorage.setItem('gp-engine',S.engine)}catch(e){}render()}
 else if(a==='ocrstop'){if(S.ocr.run)S.ocr.run.cancel=true;OCR.cancel()}
 else if(a==='cropopen')cropOpen();else if(a==='cropback'){go('rev')}
 else if(a==='cropreset'){CR.q=cropDefault();cropDraw()}
 else if(a==='cropauto'){d.quad=null;go('rev');(d.origin==='screenshot'?runScreenshotOcr({quad:null}):runOcr({quad:null}))}
 else if(a==='cropgo'){const q=CR.q;if(!IMG.isConvex(q))return toast('Рамка перекручена: потяните углы так, чтобы получился обычный четырёхугольник',1);d.quad=q.map(p=>[p[0],p[1]]);go('rev');(d.origin==='screenshot'?runScreenshotOcr({quad:d.quad}):runOcr({quad:d.quad}))}
 else if(a==='viewd'){S.viewer={draft:true,z:0};render()}
 else if(a==='dr-add'){d.items.push({name:b.dataset.t,qty:0,kind:'dish',doubt:['добавлено вручную из текста вне таблицы'],cf:false,st:'u'});recheck(d);render()}
 else if(a==='cpid'){toast(await copyText(oid(o))?'ID '+oid(o)+' скопирован':'Не удалось скопировать',0)}else if(a==='share'){await shareOrder(o)}else if(a==='diag'){const t=d.ocrRes&&d.ocrRes.diag||'';try{await navigator.clipboard.writeText(t);toast('Диагностика скопирована')}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Диагностика скопирована')}catch(_){toast('Не удалось скопировать',1)}ta.remove()}}
 else if(a==='parse'){const r=applyParse(d);S.msg=r.items.length?'':'Позиции в тексте не найдены. Добавьте их вручную.';render()}
 else if(a==='del'){d.items.splice(i,1);S.srch=null;render()}else if(a==='addrow'){d.items.push(blank());render()}
 else if(a==='acc'){const x=d.items[i],n=x.cand&&x.cand[+b.dataset.j||0];if(n){x.name=n;x.userEdited=true;x.learned=false;x.cf=false;x.fixed=x.ocr;recheck(d)}render()}
 else if(a==='alt'){const x=d.items[i],n=x.alts&&x.alts[+b.dataset.j];if(n){x.name=n;x.userEdited=true;x.learned=false;x.fixed=x.ocr;x.cf=false;recheck(d)}render()}
 else if(a==='cfall'){d.items.forEach(x=>{if(x.st==='u'&&!x.gb&&!GP.hard(x).length&&x.kind!=='cutlery')x.cf=true});render()}
 else if(a==='srch'){S.srch=S.srch&&S.srch.i===i?null:{i,q:''};render()}else if(a==='srchx'){S.srch=null;render()}
 else if(a==='pickd'){const x=d.items[i],r=S.dict.find(y=>y.k===b.dataset.k);if(r){x.fixed=x.ocr;x.name=r.n;x.userEdited=true;x.learned=false;x.cf=false;S.srch=null;recheck(d)}render()}
  else if(a==='learnsave'){const x=d&&d.items[i],rec=x&&x.userEdited&&GPL.makeRule(x.ocr,x.name,S.dict);
   if(!rec)return toast('Выберите существующее блюдо в справочнике и подтвердите исправление',1);
   if(!DBX||!await DBX.putLearn(rec))return toast('Исправление НЕ сохранилось',1);
   S.rules=S.rules.filter(r=>r.k!==rec.k);S.rules.push(rec);toast('Исправление запомнено на этом телефоне');render()}
  else if(a==='lrm'){S.learnRemove=b.dataset.k;render()}
  else if(a==='lrmno'){S.learnRemove=null;render()}
  else if(a==='lrmyes'){const k=b.dataset.k;if(!DBX||!await DBX.delLearn(k))return toast('Правило не удалилось',1);
   S.rules=S.rules.filter(r=>r.k!==k);S.learnRemove=null;if(S.d)recheck(S.d);render()}
  else if(a==='lclear'){S.learnClear=true;render()}
  else if(a==='lclearno'){S.learnClear=false;render()}
  else if(a==='lclearyes'){if(!DBX||!await DBX.clearLearn())return toast('Не удалось очистить историю',1);
   S.rules=[];S.learnClear=false;if(S.d)recheck(S.d);render()}
  else if(a==='exp')exportDict();
 else if(a==='dreset'){if(!S.dr){S.dr=true;return render()}let ok=!!DBX;for(const r of(S.recs||[]).slice())if(!(DBX&&await DBX.delDict(r.k)))ok=false;if(ok)S.recs=[];S.dr=false;rebuildDict();if(S.d)recheck(S.d);S.msg=ok?'Справочник возвращён к встроенному набору.':'';if(!ok)toast('Не удалось сбросить справочник',1);render()}
 else if(a==='dresetno'){S.dr=false;render()}
 else if(a==='ddel'){S.ddk=b.dataset.k;render()}else if(a==='ddno'){S.ddk=null;render()}
 else if(a==='ddyes'){await dictDrop(b.dataset.k);S.ddk=null;if(S.d)recheck(S.d);render()}
 else if(a==='dedit'){const x=S.dict.find(y=>y.k===b.dataset.k);if(x){S.edit={k:x.k,n:x.n,c:x.c,a:x.a.join('\n'),p:priceOf(x.k)?priceOf(x.k).unit.toFixed(2):''};render()}}
 else if(a==='ecancel'){S.edit=null;render()}
 else if(a==='esave'){const e=S.edit,n=GPD.clean(e.n),k=GPD.key(n),old=S.dict.find(x=>x.k===e.k);if(!k||!old)return toast('Укажите название',1);if(k!==e.k&&S.dict.some(x=>x.k===k))return toast('Такое блюдо уже есть в справочнике',1);
  const rec={k,n,c:GPD.clean(e.c),a:GPD.uniq(e.a.split(/\n+/)),src:old.src==='import'?'import':old.src==='user'?'user':'edit'};if(k!==e.k&&!await dictDrop(e.k))return;if(await dictPut(rec)){await editPrice(e.k,k,n,e.p);S.edit=null;if(S.d)recheck(S.d);render()}}
 else if(a==='qsug'){const x=d.items[i];if(x&&x.qtySug){x.qty=x.qtySug;x.qtyUser=true;x.qtyRead=x.qty;x.cf=false;recheck(d)}render()}else if(a==='cf'){d.items[i].cf=true;render()}
 else if(a==='adddict'){await addDict(d.items[i].name,'');recheck(d);render()}
 else if(a==='sk-add'){const raw=d.skipped[i].line,parsed=d.origin==='screenshot'?GPS.parseLine(raw,GPM,S.idx):null;d.items.push({name:parsed?parsed.name:raw,qty:parsed?parsed.qty:0,kind:'dish',ocr:parsed?parsed.name:raw,doubt:['добавлено вручную из непроверенной строки'],cf:false,st:'u'});d.skipped.splice(i,1);recheck(d);render()}
 else if(a==='sk-rm'){d.skipped.splice(i,1);render()}
 else if(a==='create'){if(S.busy)return;const on=S.dict.length>0;if(revErrors(d,on).length)return render();
  const mg=[];d.items.forEach(x=>{const y=mg.find(z=>norm(z.n)===norm(x.name)&&z.k===x.kind);y?(y.q+=x.qty,y.takeaway=y.takeaway||!!x.takeaway):mg.push({n:x.name.trim(),q:x.qty,g:0,k:x.kind,takeaway:!!x.takeaway})});
  const n={id:d.id,no:d.no.trim(),ex:String(d.ex||'').trim(),note:String(d.notes||'').trim(),table:String(d.table||'').trim(),guest:String(d.guest||'').trim(),type:d.origin==='screenshot'?'takeaway':'delivery',origin:d.origin||'receipt',waiter:String(d.waiter||'').trim(),due:String(d.due||'').trim(),t:Date.now(),items:mg,done:false,hasReceipt:!!d.photo,hasDelivery:false};
  S.busy=true;render();const ok=DBX?await DBX.createOrder(n,d.photo||null):false;S.busy=false;
  if(!ok){S.saveErr='Заказ НЕ создан: запись в память телефона не удалась'+(DBX?'':' (память недоступна)')+'. Нажмите «Создать заказ», чтобы повторить.';toast('Заказ не создан',1);return render()}
  S.orders.push(n);savePrices(d);if(d.photo)S.ph[n.id+':receipt']=d.photo;S.id=n.id;S.d=null;S.ocr={};go('order')}
 else if(a==='dadd'){if(await addDict(S.dn,S.dcat)){S.dn='';S.dcat=''}if(S.d)recheck(S.d);render()}});
document.addEventListener('change',async e=>{const t=e.target,f=t.dataset.f,i=+t.dataset.i,d=S.d;
 if((t.id==='fc'||t.id==='fg')&&t.files[0]){const fl=t.files[0],o=S.orders.find(x=>x.id===S.pick);t.value='';if(!o||o.done||(!o.hasDelivery&&!GPC.canAddDelivery(o)))return toast('Сейчас добавить фото нельзя',1);const data=await shrink(fl,1280,.78);if(!data)return toast('Не удалось прочитать фото',1);await saveDelivery(o,data)}
 else if(t.id==='fs'&&t.files[0]){const fl=t.files[0],p=await shrink(fl,1800,.9),big=await shrink(fl,2600,.95);t.value='';if(!p||!big)return toast('Не удалось открыть скриншот',1);if(S.ocr.busy){S.ocr.run.cancel=true;OCR.cancel()};S.d={id:newId(),origin:'screenshot',orderType:'takeaway',no:String(Date.now()).slice(-8),noSource:'local',ex:'',waiter:'',due:'',table:'',guest:'',notes:'',photo:p,ocrSrc:big,items:[blank()],skipped:[],dropped:[],warn:[],quad:null};S.ocr={};go('rev');runScreenshotOcr()}
 else if(t.id==='fi'&&t.files[0]){const fl=t.files[0],p=await shrink(fl,1800,.82),big=await shrink(fl,2400,.92);t.value='';if(!p)return toast('Не удалось прочитать фото',1);if(S.ocr.busy){S.ocr.run.cancel=true;OCR.cancel()}S.d={id:newId(),no:'',ex:'',photo:p,ocrSrc:big,items:[blank()],skipped:[],dropped:[],warn:[],quad:null};S.ocr={};go('rev');runOcr()}
 else if(t.id==='fd'&&t.files[0]){await importDict(t.files[0]);t.value=''}
 else if(f==='g'){const o=S.orders.find(x=>x.id===S.id);o.items[i].g=+t.value;saveOrder(o);render()}
 else if(f==='dupok'){d.dupOk=t.checked;render()}else if(f==='warnok'){d.warnOk=t.checked;render()}else if(f==='notes'){d.notes=t.value}
 else if(f==='waiter'){d.waiter=t.value}else if(f==='due'){d.due=t.value}else if(f==='table'){d.table=t.value}else if(f==='guest'){d.guest=t.value}else if(f==='no'){d.no=t.value;d.noSource='manual';render()}else if(f==='ex'){d.ex=t.value;render()}
 else if(f==='n'){const x=d.items[i];if(x.ocr===undefined)x.ocr=x.name;x.name=t.value;x.userEdited=GPL.key(t.value)!==GPL.key(x.ocr);x.learned=false;x.fixed=x.userEdited?x.ocr:undefined;x.cf=false;recheck(d);render()}
 else if(f==='q'){const x=d.items[i];x.qty=+t.value;x.qtyUser=true;x.qtyRead=x.qty;recheck(d);render()}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList&&e.target.classList.contains('nm')){e.preventDefault();e.target.blur()}});
document.addEventListener('input',e=>{const t=e.target,f=t.dataset.f;if(t.classList&&t.classList.contains('nm')){t.style.height='auto';t.style.height=t.scrollHeight+'px'}if(f==='txt')S.d.txt=t.value;else if(f==='dn')S.dn=t.value;else if(f==='ds'){S.ds=t.value;const p=t.selectionStart;render();const n=$('[data-f=ds]');n.focus();n.setSelectionRange(p,p)}
 else if(f==='sq'){S.srch.q=t.value;const p=t.selectionStart;render();const n=$('[data-f=sq]');if(n){n.focus();n.setSelectionRange(p,p)}}else if(f==='dc')S.dcat=t.value;else if(S.edit&&(f==='en'||f==='ec'||f==='ea'||f==='ep'))S.edit[f[1]]=t.value});
/* ---------- Запуск ---------- */
(async()=>{await initDB();if(DBX){S.orders=await DBX.orders();S.recs=await DBX.dict();S.rules=await DBX.learn();S.prices=await DBX.prices();await DBX.purgeOrphans()}rebuildDict();if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
 S.ready=true;await cleanup();render();setInterval(cleanup,6e4);document.addEventListener('visibilitychange',()=>{if(!document.hidden)cleanup()});
 if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('service-worker.js').catch(()=>{})})();
