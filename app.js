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
 ${o.note?`<div class="card wn"><b>Комментарий повару</b><div>${esc(o.note)}</div></div>`:''}
 ${phCard(o,'receipt')}
 ${o.items.map((i,k)=>`<div class="card"><div class="row ${i.g>=i.q?'full':''}"><span class="nm">${esc(i.n)} — ${i.q} шт.</span>${i.g>=i.q?'<span class="ck">✓</span>':''}</div>
 <div class="mu">Собрано: ${i.g}/${i.q}</div><div class="st"><button class="pm" data-a="dec" data-i="${k}" ${o.done?'disabled':''}>−</button><span class="cnt">${i.g}</span><button class="pm p" data-a="inc" data-i="${k}" ${o.done?'disabled':''}>+</button>
 <select data-f="g" data-i="${k}" ${o.done?'disabled':''}>${Array.from({length:i.q+1},(_,n)=>`<option ${n===i.g?'selected':''}>${n}</option>`).join('')}</select></div></div>`).join('')}
 ${phCard(o,'delivery')}
 ${o.done?'':`<div class="card">${S.fin===true?`<div class="r"><b style="flex:1">Завершить заказ?</b><button class="sm" data-a="no">Отмена</button><button class="sm" style="background:var(--ok);color:#fff" data-a="yes">Да</button></div>`:`<button class="big ${fb?'':'g'}" data-a="fin" ${fb?'disabled':''}>${fb||'Завершить заказ'}</button>`}</div>`}
 <button class="lnk" data-a="rm">${S.fin==='del'?'Нажмите ещё раз: заказ и обе фотографии удалятся':'Удалить заказ'}</button>`}
function renderViewer(){const v=S.viewer,el=$('#vw');let src=null,title='';
 if(v&&v.draft){src=S.d&&S.d.photo;title='Фото чека (черновик)'}else if(v){const o=S.orders.find(x=>x.id===v.id);src=o&&S.ph[v.id+':'+v.k];title=(v.k==='receipt'?'Фото чека':'Фото готовой доставки')+(o?' · заказ № '+o.no:'')}
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
  if(r)h+=`<div class="mu">Проходов: ${r.runs.length} · выбран «${esc(r.best)}» · ${Math.round(r.sec)} с · область: ${r.mode==='manual'?'ваша рамка':r.mode==='text-box'?'найдена автоматически':'весь кадр'}</div>`;
  h+=d.ocrSrc?`<div class="r"><button class="sm" data-a="ocr">Распознать заново</button><button class="sm" data-a="cropopen">✂ Обрезать и заново</button></div>`:'<div class="mu">Фото нет: введите позиции вручную.</div>';
  if(r)h+=`<div class="r"><button class="lnk" data-a="diag" style="padding:4px 0">Скопировать диагностику OCR</button></div>`}
 return h+'</div>'}
function vRev(){const d=S.d,on=S.dict.length>0,er=GP.validate(d,on),o=S.ocr||{},q=d.quality&&QL[d.quality],dr=(d.dropped||[]).filter(l=>/[а-яё]{3}/i.test(l)&&l.replace(/[^а-яёa-z0-9]/gi,'').length>=6);
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>Проверка чека</h1></div>${S.msg?`<div class="bn">${S.msg}</div>`:''}
 ${d.photo?`<div class="stk"><img src="${d.photo}" data-a="viewd" alt="Фото чека"><button class="sm" data-a="viewd">Увеличить</button></div>`:''}
 ${ocrCard()}
 ${q&&!o.busy?`<div class="card ${q[1]}"><b>${esc(q[0])}</b></div>`:''}
 ${(d.warn||[]).map(w=>`<div class="bn">${esc(w)}</div>`).join('')}
 <div class="card"><label>Номер предчека<input data-f="no" inputmode="numeric" value="${esc(d.no)}"></label><label style="margin:0">Дополнительный ID<input data-f="ex" inputmode="numeric" value="${esc(d.ex)}"></label></div>
 ${d.notes?`<div class="card"><label style="margin:0">Комментарий повару<textarea data-f="notes" style="min-height:60px">${esc(d.notes)}</textarea></label></div>`:''}
 ${d.items.map((x,k)=>{const need=GP.needsOk(x,on);return`<div class="card ${need&&!x.cf?'wn':''}"><input data-f="n" data-i="${k}" value="${esc(x.name)}" placeholder="Название">
 <div class="r"><select data-f="q" data-i="${k}">${qopts(x.qty)}</select><span class="mu">шт.</span>
 ${x.kind==='cutlery'?'<span class="tg o">Прибор</span>':x.st==='o'?'<span class="tg o">В справочнике</span>':x.st==='s'?`<button class="sm" data-a="acc" data-i="${k}">Заменить на «${esc(x.sug)}»</button>`:`<span class="tg u">${on?'Нет в справочнике':'Справочник пуст'}</span>${on&&x.name.trim()?`<button class="sm" data-a="adddict" data-i="${k}">В справочник</button>`:''}`}
 <span style="flex:1"></span><button class="dl" data-a="del" data-i="${k}">✕</button></div>
 ${x.doubt.length?`<div class="tg s">${x.doubt.map(esc).join('; ')}</div>`:''}
 ${need?(x.cf?'<div class="tg o">✓ Подтверждено</div>':`<div class="r"><button class="sm ok2" data-a="cf" data-i="${k}">Подтверждаю позицию</button></div>`):''}</div>`}).join('')}
 <button class="lnk" data-a="addrow">+ Добавить позицию</button>
 ${(d.skipped||[]).length?`<div class="card wn"><b>Строки таблицы, не вошедшие в позиции</b><div class="mu">Это могут быть блюда с плохо прочитанными цифрами. Добавьте строку как позицию или уберите её.</div>${d.skipped.map((s,k)=>`<div class="r"><span style="flex:1">${esc(s.line)}</span><button class="sm" data-a="sk-add" data-i="${k}">Позиция</button><button class="dl" data-a="sk-rm" data-i="${k}">✕</button></div>`).join('')}</div>`:''}
 ${dr.length?`<details class="card"><summary>Текст вне таблицы, похожий на слова (${dr.length})</summary><div class="mu">Это не позиции: шапка, реклама, комментарии. Показано для проверки, что блюдо не потерялось.</div>${dr.slice(0,25).map(l=>`<div class="r"><span style="flex:1;font-size:14px">${esc(l)}</span><button class="sm" data-a="dr-add" data-t="${esc(l)}">Позиция</button></div>`).join('')}</details>`:''}
 ${(d.warn||[]).length?`<div class="card"><label style="margin:0;display:flex;gap:10px;align-items:center;color:var(--tx)"><input type="checkbox" data-f="warnok" style="width:24px;height:24px" ${d.warnOk?'checked':''}>Я сверил(а) номер, позиции и количества с фото</label></div>`:''}
 <details class="card"><summary>Текст чека (результат OCR)</summary><label style="margin:8px 0 0">Можно править или вставить свой<textarea data-f="txt" placeholder="Текст чека">${esc(d.txt||'')}</textarea></label><div class="r"><button class="sm" data-a="parse">Разобрать текст</button></div></details>
 ${er.length?`<div class="card"><ul class="er">${er.slice(0,5).map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>`:''}
 ${S.saveErr?`<div class="bn">${esc(S.saveErr)}</div>`:''}
 <div class="fab"><button class="big" data-a="create" ${er.length||S.busy||o.busy?'disabled':''}>Создать заказ</button></div>`}
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
function vDict(){const q=norm(S.ds),L=S.dict.filter(d=>!q||d.k.includes(q)).sort((a,b)=>a.n.localeCompare(b.n,'ru'));
 return`<div class="top"><button class="ib" data-a="home">‹</button><h1>Справочник · ${S.dict.length}</h1></div>${S.msg?`<div class="bn">${S.msg}</div>`:''}
 <div class="card"><button class="big" data-a="imp">Импорт Excel / CSV</button><div class="mu" style="margin-top:8px">Берётся колонка с заголовком «Название» или «Блюдо», иначе первая.</div></div>
 <div class="card"><div class="r" style="margin:0"><input data-f="dn" placeholder="Новое блюдо" value="${esc(S.dn)}" style="flex:1"><button class="sm" data-a="dadd">Добавить</button></div></div>
 <div class="card"><input data-f="ds" placeholder="Поиск" value="${esc(S.ds)}">${L.slice(0,150).map(d=>`<div class="r"><span style="flex:1">${esc(d.n)}</span><button class="dl" data-a="ddel" data-k="${esc(d.k)}">✕</button></div>`).join('')||'<div class="mu" style="padding-top:8px">Пусто</div>'}${L.length>150?'<div class="mu">Показаны первые 150, уточните поиск.</div>':''}</div>`}
function render(){const y=scrollY;$('#app').innerHTML={home:vHome,order:vOrder,rev:vRev,dict:vDict,crop:vCrop}[S.v]();scrollTo(0,y);renderViewer();if(S.v==='crop')cropInit()}
const go=v=>{S.v=v;S.msg='';S.saveErr='';S.repl=0;S.fin=false;scrollTo(0,0);render()};
/* ---------- Фото и OCR ---------- */
function shrink(f,mx,q){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,mx/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);r(c.toDataURL('image/jpeg',q))};i.onerror=()=>r(null);i.src=fr.result};fr.onerror=()=>r(null);fr.readAsDataURL(f)})}
const decode=u=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);const id=x.getImageData(0,0,c.width,c.height);ok({w:c.width,h:c.height,d:id.data})};i.onerror=()=>no(new Error('не удалось открыть фото'));i.src=u});
function applyParse(d){const r=GP.parse(d.txt||'');fillFrom(d,r);return r}
function fillFrom(d,p){if(p.no)d.no=p.no;d.ex=p.ex||d.ex||'';d.items=p.items.length?p.items.map(x=>({...x,cf:false})):[blank()];d.skipped=p.skipped;d.dropped=p.dropped;d.notes=p.notes||d.notes||'';d.warn=[...p.warn];d.quality=p.quality;d.warnOk=false;
 if(p.quality!=='good'&&!p.check)d.warn.push(p.items.length?'Итог чека не найден или не подтвердил сумму позиций: сверьте каждую позицию с фото.':'Позиции в тексте не найдены.');recheck(d)}
function ocrProgress(run,ev){if(run.cancel)return;const o=S.ocr;o.pct=ev.pct||0;const ph=ev.phase==='variant'?`Проход ${ev.run} из ${ev.runs}: ${ev.label}`:ev.label||'Подготовка';o.step=ph+(ev.pct?` — ${Math.round(ev.pct*100)}%`:'');const a=$('#ocrstep'),b=$('#ocrbar');if(a)a.textContent=o.step;if(b)b.style.width=Math.round((ev.phase==='variant'?(((ev.run-1)+(ev.pct||0))/ev.runs):(ev.pct||0)*.2)*100)+'%'}
async function runOcr(opts){opts=opts||{};const d=S.d;if(!d||!d.ocrSrc||S.ocr.busy)return;const run={cancel:false};S.ocr={busy:true,run,step:'Подготовка…',pct:0,msg:''};if(S.v!=='rev')go('rev');else render();
 let res;try{const src=await decode(d.ocrSrc);res=await PIPE.recognizeReceipt(src,{recognize:(img,p,cb)=>OCR.recognize(img,p,cb),quad:opts.quad===undefined?(d.quad||null):opts.quad,onProgress:ev=>ocrProgress(run,ev),cancelled:()=>run.cancel})}
 catch(e){if(S.d!==d)return;S.ocr={msg:run.cancel?'Распознавание остановлено.':'Ошибка распознавания: '+e.message+'. Введите позиции вручную или повторите при наличии интернета.'};return render()}
 if(S.d!==d)return;if(res.cancelled||run.cancel){S.ocr={msg:'Распознавание остановлено.'};return render()}
 d.txt=res.best.text;d.box=res.locate.box||d.box||null;fillFrom(d,res.parsed);d.ocrRes={best:res.best.label,runs:res.runs,sec:res.totalMs/1000,mode:res.locate.mode,diag:PIPE.diagnostics(res,navigator.userAgent)};
 S.ocr={msg:res.parsed.items.length?'Готово. Проверьте номер, ID и позиции по фото: заказ автоматически не создаётся.':'Позиции не найдены.'};render()}
/* ---------- События ---------- */
document.addEventListener('click',async e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,i=+b.dataset.i,o=S.orders.find(x=>x.id===S.id),d=S.d;
 if(a==='home'){if(S.ocr.run)S.ocr.run.cancel=true;if(S.ocr.busy)OCR.cancel();S.ocr={};go('home')}else if(a==='dict')go('dict');else if(a==='scan')$('#fi').click();else if(a==='imp')$('#fd').click();
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
 else if(a==='ocrstop'){if(S.ocr.run)S.ocr.run.cancel=true;OCR.cancel()}
 else if(a==='cropopen')cropOpen();else if(a==='cropback'){go('rev')}
 else if(a==='cropreset'){CR.q=cropDefault();cropDraw()}
 else if(a==='cropauto'){d.quad=null;go('rev');runOcr({quad:null})}
 else if(a==='cropgo'){const q=CR.q;if(!IMG.isConvex(q))return toast('Рамка перекручена: потяните углы так, чтобы получился обычный четырёхугольник',1);d.quad=q.map(p=>[p[0],p[1]]);go('rev');runOcr({quad:d.quad})}
 else if(a==='viewd'){S.viewer={draft:true,z:0};render()}
 else if(a==='dr-add'){d.items.push({name:b.dataset.t,qty:0,kind:'dish',doubt:['добавлено вручную из текста вне таблицы'],cf:false,st:'u'});recheck(d);render()}
 else if(a==='diag'){const t=d.ocrRes&&d.ocrRes.diag||'';try{await navigator.clipboard.writeText(t);toast('Диагностика скопирована')}catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Диагностика скопирована')}catch(_){toast('Не удалось скопировать',1)}ta.remove()}}
 else if(a==='parse'){const r=applyParse(d);S.msg=r.items.length?'':'Позиции в тексте не найдены. Добавьте их вручную.';render()}
 else if(a==='del'){d.items.splice(i,1);render()}else if(a==='addrow'){d.items.push(blank());render()}
 else if(a==='acc'){d.items[i].name=d.items[i].sug;recheck(d);render()}
 else if(a==='cf'){d.items[i].cf=true;render()}
 else if(a==='adddict'){await addDict(d.items[i].name);recheck(d);render()}
 else if(a==='sk-add'){d.items.push({name:d.skipped[i].line,qty:0,kind:'dish',doubt:['добавлено из пропущенных строк'],cf:false,st:'u'});d.skipped.splice(i,1);recheck(d);render()}
 else if(a==='sk-rm'){d.skipped.splice(i,1);render()}
 else if(a==='create'){if(S.busy)return;const on=S.dict.length>0;if(GP.validate(d,on).length)return render();
  const mg=[];d.items.forEach(x=>{const y=mg.find(z=>norm(z.n)===norm(x.name)&&z.k===x.kind);y?y.q+=x.qty:mg.push({n:x.name.trim(),q:x.qty,g:0,k:x.kind})});
  const n={id:d.id,no:d.no.trim(),ex:String(d.ex||'').trim(),note:String(d.notes||'').trim(),t:Date.now(),items:mg,done:false,hasReceipt:!!d.photo,hasDelivery:false};
  S.busy=true;render();const ok=DBX?await DBX.createOrder(n,d.photo||null):false;S.busy=false;
  if(!ok){S.saveErr='Заказ НЕ создан: запись в память телефона не удалась'+(DBX?'':' (память недоступна)')+'. Нажмите «Создать заказ», чтобы повторить.';toast('Заказ не создан',1);return render()}
  S.orders.push(n);if(d.photo)S.ph[n.id+':receipt']=d.photo;S.id=n.id;S.d=null;S.ocr={};go('order')}
 else if(a==='dadd'){await addDict(S.dn);S.dn='';render()}
 else if(a==='ddel'){S.dict=S.dict.filter(x=>x.k!==b.dataset.k);if(DBX)await DBX.delDict(b.dataset.k);render()}});
document.addEventListener('change',async e=>{const t=e.target,f=t.dataset.f,i=+t.dataset.i,d=S.d;
 if((t.id==='fc'||t.id==='fg')&&t.files[0]){const fl=t.files[0],o=S.orders.find(x=>x.id===S.pick);t.value='';if(!o||o.done||(!o.hasDelivery&&!GPC.canAddDelivery(o)))return toast('Сейчас добавить фото нельзя',1);const data=await shrink(fl,1280,.78);if(!data)return toast('Не удалось прочитать фото',1);await saveDelivery(o,data)}
 else if(t.id==='fi'&&t.files[0]){const fl=t.files[0],p=await shrink(fl,1800,.82),big=await shrink(fl,2400,.92);t.value='';if(!p)return toast('Не удалось прочитать фото',1);if(S.ocr.busy){S.ocr.run.cancel=true;OCR.cancel()}S.d={id:newId(),no:'',ex:'',photo:p,ocrSrc:big,items:[blank()],skipped:[],dropped:[],warn:[],quad:null};S.ocr={};go('rev');runOcr()}
 else if(t.id==='fd'&&t.files[0]){await importDict(t.files[0]);t.value=''}
 else if(f==='g'){const o=S.orders.find(x=>x.id===S.id);o.items[i].g=+t.value;saveOrder(o);render()}
 else if(f==='warnok'){d.warnOk=t.checked;render()}else if(f==='notes'){d.notes=t.value}
 else if(f==='no'){d.no=t.value;render()}else if(f==='ex'){d.ex=t.value;render()}
 else if(f==='n'){const x=d.items[i];x.name=t.value;x.cf=false;recheck(d);render()}
 else if(f==='q'){d.items[i].qty=+t.value;render()}});
document.addEventListener('input',e=>{const t=e.target,f=t.dataset.f;if(f==='txt')S.d.txt=t.value;else if(f==='dn')S.dn=t.value;else if(f==='ds'){S.ds=t.value;const p=t.selectionStart;render();const n=$('[data-f=ds]');n.focus();n.setSelectionRange(p,p)}});
/* ---------- Запуск ---------- */
(async()=>{await initDB();if(DBX){S.orders=await DBX.orders();S.dict=await DBX.dict();await DBX.purgeOrphans()}if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
 await cleanup();render();setInterval(cleanup,6e4);document.addEventListener('visibilitychange',()=>{if(!document.hidden)cleanup()});
 if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('service-worker.js').catch(()=>{})})();
