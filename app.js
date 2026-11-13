const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={orders:[],dict:[],v:'home',id:null,d:null,ds:'',dn:'',fin:false,photoOpen:false,ocr:{},msg:'',ph:{},viewer:null,pick:null,repl:0,phErr:null,saveErr:'',busy:false};const DAY=864e5,norm=GP.norm;
function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='toast on'+(bad?' bad':'');clearTimeout(toast.h);toast.h=setTimeout(()=>t.className='toast',bad?8000:3000)}
/* ---------- IndexedDB (V008: orders + photos + dict, схема v2; логика в db.js) ---------- */
let DBX=null,dbErr='';
async function initDB(){try{DBX=await DB.open()}catch(e){DBX=null;dbErr=(e&&e.message)||'ошибка'}}
async function saveOrder(o){if(!DBX||!await DBX.putOrder(o)){toast('Прогресс заказа НЕ сохранён в память телефона',1);return false}return true}
async function cleanup(){if(!DBX)return;const ids=await DBX.expire(Date.now());if(!ids.length)return;S.orders=S.orders.filter(o=>!ids.includes(o.id));ids.forEach(id=>{delete S.ph[id+':receipt'];delete S.ph[id+':delivery']});if(S.viewer&&ids.includes(S.viewer.id))S.viewer=null;if(S.v==='order'&&!S.orders.find(o=>o.id===S.id))S.v='home';render()}
const newId=()=>{let i=Date.now();while(S.orders.some(x=>x.id===i))i++;return i};
/* ---------- Справочник ---------- */
function lev(a,b){const m=a.length,n=b.length;let p=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function match(name){const n=norm(name);if(!n||!S.dict.length)return{st:'u'};let best=null,bs=0,sc=0;for(const d of S.dict){if(d.k===n)return{st:'o',name:d.n};const s=1-lev(n,d.k)/Math.max(n.length,d.k.length);if(s>bs){sc=bs;bs=s;best=d}else if(s>sc)sc=s}
 /* похожие названия НЕ объединяются автоматически: только подсказка */
 return best&&bs>=.8&&bs-sc>=.05?{st:'s',name:best.n}:{st:'u'}}
const recheck=d=>d.items.forEach(x=>{if(x.kind==='cutlery'){x.st='o';return}const m=match(x.name);x.st=m.st;x.sug=m.name;if(m.st==='o')x.name=m.name});
async function addDict(name){name=name.trim();const k=norm(name);if(!k||S.dict.some(d=>d.k===k))return;const o={k,n:name};S.dict.push(o);if(!(DBX&&await DBX.putDict(o)))toast('Справочник не сохранился',1)}
async function importDict(f){let rows=[];try{if(/\.(xlsx|xls)$/i.test(f.name)){if(!window.XLSX)throw Error('библиотека Excel не загрузилась (нужен интернет)');const wb=XLSX.read(await f.arrayBuffer());rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1})}else rows=(await f.text()).split(/\r?\n/).map(l=>l.split(/[;\t,]/))}catch(e){S.msg='Не удалось прочитать файл: '+esc(e.message);return render()}
 let c=0;const R=/назван|блюд|наимен|name/i,h=rows.findIndex(r=>r.some(x=>R.test(x)));if(h>=0)c=rows[h].findIndex(x=>R.test(x));
 const a=[];rows.slice(h+1).forEach(r=>{const n=String(r[c]??'').trim(),k=norm(n);if(n&&k&&isNaN(n)&&!a.some(x=>x.k===k)&&!S.dict.some(x=>x.k===k))a.push({k,n})});
 const ok=!!DBX&&await DBX.putDictMany(a);if(ok)S.dict.push(...a);else toast('Справочник не сохранился',1);S.msg=ok?`Добавлено блюд: ${a.length}. Колонка: ${h>=0?'«'+esc(rows[h][c])+'»':'первая'}.`:'';render()}
/* ---------- Заказы ---------- */
const tot=o=>o.items.reduce((a,i)=>a+i.q,0),got=o=>o.items.reduce((a,i)=>a+i.g,0),left=GPC.left;
const stt=GPC.status;
const fmt=t=>new Date(t).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
const blank=()=>({name:'',qty:1,kind:'dish',doubt:[],cf:false,st:'u'});
const bar=o=>{const p=tot(o)?Math.round(got(o)/tot(o)*100):0;return`<div class="bar"><i class="${p===100?'f':''}" style="width:${p}%"></i></div>`};
function card(o){const[s,c]=stt(o);return`<div class="card" data-a="open" data-id="${o.id}"><div class="hd"><span class="no">№ ${esc(o.no)}</span><span class="pill ${c}">${s}</span></div>
<div class="mu">ID ${esc(o.ex||'—')} · создан в ${fmt(o.t)} · чек ${o.hasReceipt?'📄':'—'} · доставка ${o.hasDelivery?'📦':'—'}</div>${bar(o)}<div class="hd mu"><span>Собрано ${got(o)} из ${tot(o)}</span><span>${o.done?'':'Осталось позиций: '+left(o)}</span></div></div>`}
function vHome(){const L=[...S.orders].sort((a,b)=>(a.done-b.done)||b.t-a.t);
 return`<div class="top"><h1>GONER PACK</h1><button class="ib2" data-a="dict">Справочник · ${S.dict.length}</button></div>${DBX?'':`<div class="bn">Память телефона (IndexedDB) недоступна${dbErr?': '+esc(dbErr):''}. Создать заказ нельзя: он не сохранится.</div>`}
 ${L.length?L.map(card).join(''):'<div class="emp">Заказов пока нет.<br>Нажмите «Сканировать чек»: фото распознаётся на телефоне, затем вы проверяете позиции.</div>'}
 <div class="fab"><button class="big" data-a="scan">📷 Сканировать чек</button><button class="lnk" data-a="manual">Ввести вручную</button></div>`}
const pickBtns=()=>`<div class="r"><button class="sm" data-a="pickc" ${S.busy?'disabled':''}>📷 Камера</button><button class="sm" data-a="pickg" ${S.busy?'disabled':''}>🖼 Галерея</button></div>`;
function phCard(o,k){const t=k==='receipt'?'Фото чека':'Фото готовой доставки',has=k==='receipt'?o.hasReceipt:o.hasDelivery,src=S.ph[o.id+':'+k];let b=`<div class="card"><b>${t}</b>`;
 if(has)b+=src?`<img class="th" src="${src}" data-a="view" data-k="${k}" alt="${t}"><div class="mu">Нажмите, чтобы открыть крупно</div>`:`<div class="mu">${src===false?'Фото не читается из памяти телефона':'Загрузка фото…'}</div>`;
 else if(k==='receipt')b+='<div class="mu">У заказа нет фото чека (введён вручную).</div>';
 else if(GPC.canAddDelivery(o))b+=`<div class="mu">Сфотографируйте собранный и упакованный заказ перед передачей курьеру.</div>${pickBtns()}`;
 else b+=`<div class="mu">${o.done?'Фото не добавлено':'Станет доступно, когда отмечены все позиции'}</div>`;
 if(k==='delivery'&&has&&GPC.canReplaceDelivery(o))b+=S.repl===0?`<div class="r"><button class="sm" data-a="repl">Заменить фото</button></div>`:S.repl===1?`<div class="r"><b style="flex:1">Заменить фото доставки? Старое останется, пока новое не сохранится.</b></div><div class="r"><button class="sm" data-a="repno">Отмена</button><button class="sm" data-a="repyes">Да, заменить</button></div>`:`${pickBtns()}<div class="r"><button class="sm" data-a="repno">Отмена</button></div>`;
 if(k==='delivery'&&S.phErr&&S.phErr.id===o.id)b+=`<div class="bn" style="margin:8px 0 0">Фото НЕ сохранилось в память телефона.<div class="r"><button class="sm" data-a="phretry" ${S.busy?'disabled':''}>Повторить</button><button class="sm" data-a="phdrop">Отменить</button></div></div>`;
 return b+'</div>'}
function vOrder(){const o=S.orders.find(x=>x.id===S.id),[s,c]=stt(o),oth=S.orders.filter(x=>!x.done),fb=GPC.finishBlock(o);
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>№ ${esc(o.no)}</h1><span class="pill ${c}">${s}</span></div>
 ${oth.length>1?`<div class="chips">${oth.map(x=>`<button class="chip ${x.id===o.id?'on':''}" data-a="open" data-id="${x.id}">№${esc(x.no)} · ${got(x)}/${tot(x)}</button>`).join('')}</div>`:''}
 <div class="card"><div class="mu">ID ${esc(o.ex||'—')} · создан в ${fmt(o.t)}</div>${bar(o)}<div class="mu">Собрано ${got(o)} из ${tot(o)}. Заказ и обе фотографии удалятся через 24 часа после создания (проверка при запуске и пока приложение открыто).</div></div>
 ${phCard(o,'receipt')}
 ${o.items.map((i,k)=>`<div class="card"><div class="row ${i.g>=i.q?'full':''}"><span class="nm">${esc(i.n)} — ${i.q} шт.</span>${i.g>=i.q?'<span class="ck">✓</span>':''}</div>
 <div class="mu">Собрано: ${i.g}/${i.q}</div><div class="st"><button class="pm" data-a="dec" data-i="${k}" ${o.done?'disabled':''}>−</button><span class="cnt">${i.g}</span><button class="pm p" data-a="inc" data-i="${k}" ${o.done?'disabled':''}>+</button>
 <select data-f="g" data-i="${k}" ${o.done?'disabled':''}>${Array.from({length:i.q+1},(_,n)=>`<option ${n===i.g?'selected':''}>${n}</option>`).join('')}</select></div></div>`).join('')}
 ${phCard(o,'delivery')}
 ${o.done?'':`<div class="card">${S.fin===true?`<div class="r"><b style="flex:1">Завершить заказ?</b><button class="sm" data-a="no">Отмена</button><button class="sm" style="background:var(--ok);color:#fff" data-a="yes">Да</button></div>`:`<button class="big ${fb?'':'g'}" data-a="fin" ${fb?'disabled':''}>${fb||'Завершить заказ'}</button>`}</div>`}
 <button class="lnk" data-a="rm">${S.fin==='del'?'Нажмите ещё раз: заказ и обе фотографии удалятся':'Удалить заказ'}</button>`}
function renderViewer(){const v=S.viewer,el=$('#vw'),o=v&&S.orders.find(x=>x.id===v.id),src=v&&S.ph[v.id+':'+v.k];if(!o||!src){S.viewer=null;el.innerHTML='';return}
 el.innerHTML=`<div class="vw"><div class="vb"><b style="flex:1">${v.k==='receipt'?'Фото чека':'Фото готовой доставки'} · заказ № ${esc(o.no)}</b><button class="sm" data-a="zoom">${v.z?'Уменьшить':'Увеличить'}</button><button class="sm" data-a="vclose">Закрыть</button></div><div class="vs"><img src="${src}" style="width:${v.z?'250%':'100%'}" alt=""></div></div>`}
async function loadPhotos(o){for(const k of['receipt','delivery']){if(!(k==='receipt'?o.hasReceipt:o.hasDelivery)||S.ph[o.id+':'+k])continue;const d=DBX?await DBX.getPhoto(o.id,k):null;S.ph[o.id+':'+k]=d||false}if(S.v==='order'&&S.id===o.id)render()}
async function saveDelivery(o,data){S.busy=true;render();const ok=DBX?await DBX.savePhoto(o,'delivery',data):false;S.busy=false;
 if(!ok){S.phErr={id:o.id,data};toast('Фото НЕ сохранено',1);return render()}
 o.hasDelivery=true;S.ph[o.id+':delivery']=data;S.phErr=null;S.repl=0;toast('Фото готовой доставки сохранено');render()}
const qopts=q=>{const s=[...new Set([...Array.from({length:31},(_,n)=>n),q])].sort((a,b)=>a-b);return s.map(n=>`<option value="${n}" ${n===q?'selected':''}>${n===0?'?':n}</option>`).join('')};
function vRev(){const d=S.d,on=S.dict.length>0,er=GP.validate(d,on),o=S.ocr||{};
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>Проверка чека</h1></div>${S.msg?`<div class="bn">${S.msg}</div>`:''}
 ${d.photo?`<img class="ph" src="${d.photo}">`:''}
 <div class="card"><b>Распознавание</b><div class="mu">Фото не отправляется на сервер: текст распознаётся на телефоне. При первом запуске из интернета загружаются файлы модели; для этого нужен интернет.</div>
 ${d.photo?`<div class="r"><button class="sm" data-a="ocr" ${o.busy?'disabled':''}>${o.busy?'Идёт распознавание…':'Распознать фото'}</button></div>`:'<div class="mu">Фото нет: введите позиции вручную.</div>'}<div class="mu" id="ocrmsg">${esc(o.msg||'')}</div></div>
 <div class="card"><label>Номер предчека<input data-f="no" inputmode="numeric" value="${esc(d.no)}"></label><label style="margin:0">Дополнительный ID<input data-f="ex" inputmode="numeric" value="${esc(d.ex)}"></label></div>
 <div class="card"><label style="margin:0">Текст чека (результат OCR, можно править или вставить свой)<textarea data-f="txt" placeholder="Текст чека">${esc(d.txt||'')}</textarea></label><div class="r"><button class="sm" data-a="parse">Разобрать текст</button></div></div>
 ${d.items.map((x,k)=>{const need=GP.needsOk(x,on);return`<div class="card ${need&&!x.cf?'wn':''}"><input data-f="n" data-i="${k}" value="${esc(x.name)}" placeholder="Название">
 <div class="r"><select data-f="q" data-i="${k}">${qopts(x.qty)}</select><span class="mu">шт.</span>
 ${x.kind==='cutlery'?'<span class="tg o">Прибор</span>':x.st==='o'?'<span class="tg o">В справочнике</span>':x.st==='s'?`<button class="sm" data-a="acc" data-i="${k}">Заменить на «${esc(x.sug)}»</button>`:`<span class="tg u">${on?'Нет в справочнике':'Справочник пуст'}</span>${on&&x.name.trim()?`<button class="sm" data-a="adddict" data-i="${k}">В справочник</button>`:''}`}
 <span style="flex:1"></span><button class="dl" data-a="del" data-i="${k}">✕</button></div>
 ${x.doubt.length?`<div class="tg s">${x.doubt.map(esc).join('; ')}</div>`:''}
 ${need?(x.cf?'<div class="tg o">✓ Подтверждено</div>':`<div class="r"><button class="sm ok2" data-a="cf" data-i="${k}">Подтверждаю позицию</button></div>`):''}</div>`}).join('')}
 <button class="lnk" data-a="addrow">+ Добавить позицию</button>
 ${(d.skipped||[]).length?`<div class="card wn"><b>Строки чека не вошли в позиции</b><div class="mu">Добавьте строку как позицию или уберите, если это не блюдо.</div>${d.skipped.map((s,k)=>`<div class="r"><span style="flex:1">${esc(s.line)}</span><button class="sm" data-a="sk-add" data-i="${k}">Позиция</button><button class="dl" data-a="sk-rm" data-i="${k}">✕</button></div>`).join('')}</div>`:''}
 ${er.length?`<div class="card"><ul class="er">${er.slice(0,5).map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>`:''}
 ${S.saveErr?`<div class="bn">${esc(S.saveErr)}</div>`:''}
 <div class="fab"><button class="big" data-a="create" ${er.length?'disabled':''}>Создать заказ</button></div>`}
function vDict(){const q=norm(S.ds),L=S.dict.filter(d=>!q||d.k.includes(q)).sort((a,b)=>a.n.localeCompare(b.n,'ru'));
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>Справочник · ${S.dict.length}</h1></div>${S.msg?`<div class="bn">${S.msg}</div>`:''}
 <div class="card"><button class="big" data-a="imp">Импорт Excel / CSV</button><div class="mu" style="margin-top:8px">Берётся колонка с заголовком «Название» или «Блюдо», иначе первая.</div></div>
 <div class="card"><div class="r" style="margin:0"><input data-f="dn" placeholder="Новое блюдо" value="${esc(S.dn)}" style="flex:1"><button class="sm" data-a="dadd">Добавить</button></div></div>
 <div class="card"><input data-f="ds" placeholder="Поиск" value="${esc(S.ds)}">${L.slice(0,150).map(d=>`<div class="r"><span style="flex:1">${esc(d.n)}</span><button class="dl" data-a="ddel" data-k="${esc(d.k)}">✕</button></div>`).join('')||'<div class="mu" style="padding-top:8px">Пусто</div>'}${L.length>150?'<div class="mu">Показаны первые 150, уточните поиск.</div>':''}</div>`}
function render(){const y=scrollY;$('#app').innerHTML={home:vHome,order:vOrder,rev:vRev,dict:vDict}[S.v]();scrollTo(0,y);renderViewer()}
const go=v=>{S.v=v;S.msg='';S.saveErr='';S.repl=0;S.fin=false;scrollTo(0,0);render()};
/* ---------- Фото и OCR ---------- */
function shrink(f,mx,q){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,mx/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);r(c.toDataURL('image/jpeg',q))};i.onerror=()=>r(null);i.src=fr.result};fr.onerror=()=>r(null);fr.readAsDataURL(f)})}
function applyParse(d){const r=GP.parse(d.txt||'');if(r.no)d.no=r.no;if(r.ex)d.ex=r.ex;d.items=r.items.map(x=>({...x,cf:false}));d.skipped=r.skipped;recheck(d);return r}
async function runOcr(){const d=S.d;if(!d||!(d.ocrSrc||d.photo))return;S.ocr={busy:true,msg:'Подготовка…'};render();
 try{const t=await OCR.run(d.ocrSrc||d.photo,m=>{const el=$('#ocrmsg');if(el&&m.status)el.textContent=m.status+(m.progress?' '+Math.round(m.progress*100)+'%':'')});
  if(S.d!==d)return;d.txt=t;const r=applyParse(d);S.ocr={msg:r.items.length?'Готово. Проверьте номер, ID и позиции по фото.':'Текст получен, но позиции не найдены. Проверьте текст ниже или введите позиции вручную.'}}
 catch(e){if(S.d!==d)return;S.ocr={msg:'Ошибка OCR: '+e.message+'. Введите позиции вручную или повторите при наличии интернета.'}}render()}
/* ---------- События ---------- */
document.addEventListener('click',async e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,i=+b.dataset.i,o=S.orders.find(x=>x.id===S.id),d=S.d;
 if(a==='home'){S.ocr={};go('home')}else if(a==='dict')go('dict');else if(a==='scan')$('#fi').click();else if(a==='imp')$('#fd').click();
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
 else if(a==='ocr')runOcr();
 else if(a==='parse'){const r=applyParse(d);S.msg=r.items.length?'':'Позиции в тексте не найдены. Добавьте их вручную.';render()}
 else if(a==='del'){d.items.splice(i,1);render()}else if(a==='addrow'){d.items.push(blank());render()}
 else if(a==='acc'){d.items[i].name=d.items[i].sug;recheck(d);render()}
 else if(a==='cf'){d.items[i].cf=true;render()}
 else if(a==='adddict'){await addDict(d.items[i].name);recheck(d);render()}
 else if(a==='sk-add'){d.items.push({name:d.skipped[i].line,qty:0,kind:'dish',doubt:['добавлено из пропущенных строк'],cf:false,st:'u'});d.skipped.splice(i,1);recheck(d);render()}
 else if(a==='sk-rm'){d.skipped.splice(i,1);render()}
 else if(a==='create'){if(S.busy)return;const on=S.dict.length>0;if(GP.validate(d,on).length)return render();
  const mg=[];d.items.forEach(x=>{const y=mg.find(z=>norm(z.n)===norm(x.name)&&z.k===x.kind);y?y.q+=x.qty:mg.push({n:x.name.trim(),q:x.qty,g:0,k:x.kind})});
  const n={id:d.id,no:d.no.trim(),ex:String(d.ex||'').trim(),t:Date.now(),items:mg,done:false,hasReceipt:!!d.photo,hasDelivery:false};
  S.busy=true;render();const ok=DBX?await DBX.createOrder(n,d.photo||null):false;S.busy=false;
  if(!ok){S.saveErr='Заказ НЕ создан: запись в память телефона не удалась'+(DBX?'':' (память недоступна)')+'. Нажмите «Создать заказ», чтобы повторить.';toast('Заказ не создан',1);return render()}
  S.orders.push(n);if(d.photo)S.ph[n.id+':receipt']=d.photo;S.id=n.id;S.d=null;S.ocr={};go('order')}
 else if(a==='dadd'){await addDict(S.dn);S.dn='';render()}
 else if(a==='ddel'){S.dict=S.dict.filter(x=>x.k!==b.dataset.k);if(DBX)await DBX.delDict(b.dataset.k);render()}});
document.addEventListener('change',async e=>{const t=e.target,f=t.dataset.f,i=+t.dataset.i,d=S.d;
 if((t.id==='fc'||t.id==='fg')&&t.files[0]){const fl=t.files[0],o=S.orders.find(x=>x.id===S.pick);t.value='';if(!o||o.done||(!o.hasDelivery&&!GPC.canAddDelivery(o)))return toast('Сейчас добавить фото нельзя',1);const data=await shrink(fl,1280,.78);if(!data)return toast('Не удалось прочитать фото',1);await saveDelivery(o,data)}
 else if(t.id==='fi'&&t.files[0]){const fl=t.files[0],p=await shrink(fl,1800,.82),big=await shrink(fl,2400,.92);t.value='';if(!p)return toast('Не удалось прочитать фото',1);S.d={id:newId(),no:'',ex:'',photo:p,ocrSrc:big,items:[blank()],skipped:[]};S.ocr={};go('rev');runOcr()}
 else if(t.id==='fd'&&t.files[0]){await importDict(t.files[0]);t.value=''}
 else if(f==='g'){const o=S.orders.find(x=>x.id===S.id);o.items[i].g=+t.value;saveOrder(o);render()}
 else if(f==='no'){d.no=t.value;render()}else if(f==='ex'){d.ex=t.value;render()}
 else if(f==='n'){const x=d.items[i];x.name=t.value;x.cf=false;recheck(d);render()}
 else if(f==='q'){d.items[i].qty=+t.value;render()}});
document.addEventListener('input',e=>{const t=e.target,f=t.dataset.f;if(f==='txt')S.d.txt=t.value;else if(f==='dn')S.dn=t.value;else if(f==='ds'){S.ds=t.value;const p=t.selectionStart;render();const n=$('[data-f=ds]');n.focus();n.setSelectionRange(p,p)}});
/* ---------- Запуск ---------- */
(async()=>{await initDB();if(DBX){S.orders=await DBX.orders();S.dict=await DBX.dict();await DBX.purgeOrphans()}if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
 await cleanup();render();setInterval(cleanup,6e4);document.addEventListener('visibilitychange',()=>{if(!document.hidden)cleanup()});
 if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('service-worker.js').catch(()=>{})})();
