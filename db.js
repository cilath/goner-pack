/* GONER PACK 008→017: IndexedDB, схема v4. Хранилища: orders, photos (ключ "<id заказа>:<receipt|delivery>"), dict, learn (014), prices (017:
   цена за единицу блюда справочника {k, name, unit, t}; пишется при создании заказа по чеку, правится в справочнике).
   V007 (схема v1) хранила фото чека внутри заказа (поле photo); миграция переносит его в photos. */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.DB=m})(typeof self!=='undefined'?self:this,function(){
const VER=4,DAY=864e5,KINDS=['receipt','delivery'];
function upgrade(db,tx,old){
 if(old<1){db.createObjectStore('orders',{keyPath:'id'});db.createObjectStore('dict',{keyPath:'k'})}
 if(old<2){const ph=db.createObjectStore('photos',{keyPath:'key'}),q=tx.objectStore('orders').openCursor();
  q.onsuccess=()=>{const c=q.result;if(!c)return;const o=c.value;
   if(o.photo){ph.put({key:o.id+':receipt',orderId:o.id,kind:'receipt',data:o.photo,t:o.t});o.hasReceipt=true}else o.hasReceipt=!!o.hasReceipt;
   delete o.photo;o.hasDelivery=!!o.hasDelivery;c.update(o);c.continue()}}
 if(old<3)db.createObjectStore('learn',{keyPath:'k'});
 if(old<4)db.createObjectStore('prices',{keyPath:'k'})}
function open(name,onBlocked){return new Promise((ok,no)=>{let q;try{q=indexedDB.open(name||'gonerpack',VER)}catch(e){return no(e)}
 q.onupgradeneeded=e=>upgrade(q.result,q.transaction,e.oldVersion);
 q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();ok(wrap(q.result))};
 q.onerror=()=>no(q.error||new Error('не удалось открыть базу'));q.onblocked=()=>onBlocked&&onBlocked()})}
function wrap(db){
 const run=(st,mode,f)=>new Promise(r=>{let t,res;try{t=db.transaction(st,mode)}catch(e){return r({ok:false,e})}
  t.oncomplete=()=>r({ok:true,res:res&&'result' in res?res.result:res});t.onabort=()=>r({ok:false,e:t.error});t.onerror=()=>{};
  try{res=f(t)}catch(e){try{t.abort()}catch(_){}r({ok:false,e})}});
 const pkey=(id,k)=>id+':'+k,rec=(id,k,data)=>{if(typeof data!=='string'||!data.startsWith('data:image'))throw new Error('bad photo');return{key:pkey(id,k),orderId:id,kind:k,data,t:Date.now()}};
 const api={
  raw:db,close:()=>db.close(),
  orders:async()=>(await run('orders','readonly',t=>t.objectStore('orders').getAll())).res||[],
  dict:async()=>(await run('dict','readonly',t=>t.objectStore('dict').getAll())).res||[],
  learn:async()=>(await run('learn','readonly',t=>t.objectStore('learn').getAll())).res||[],
  putLearn:async o=>(await run('learn','readwrite',t=>t.objectStore('learn').put(o))).ok,
  delLearn:async k=>(await run('learn','readwrite',t=>t.objectStore('learn').delete(k))).ok,
  clearLearn:async()=>(await run('learn','readwrite',t=>t.objectStore('learn').clear())).ok,
  prices:async()=>(await run('prices','readonly',t=>t.objectStore('prices').getAll())).res||[],
  putPrices:async a=>(await run('prices','readwrite',t=>{a.forEach(o=>t.objectStore('prices').put(o))})).ok,
  delPrice:async k=>(await run('prices','readwrite',t=>t.objectStore('prices').delete(k))).ok,
  putDict:async o=>(await run('dict','readwrite',t=>t.objectStore('dict').put(o))).ok,
  putDictMany:async a=>(await run('dict','readwrite',t=>{a.forEach(o=>t.objectStore('dict').put(o))})).ok,
  delDict:async k=>(await run('dict','readwrite',t=>t.objectStore('dict').delete(k))).ok,
  putOrder:async o=>(await run('orders','readwrite',t=>t.objectStore('orders').put(o))).ok,
  /* заказ и фото чека пишутся ОДНОЙ транзакцией: либо оба, либо ничего */
  createOrder:async(o,photo)=>(await run(['orders','photos'],'readwrite',t=>{const n={...o,hasReceipt:!!photo,hasDelivery:false};
   if(photo!=null)t.objectStore('photos').put(rec(o.id,'receipt',photo));t.objectStore('orders').put(n)})).ok,
  /* фото + флаг в заказе одной транзакцией; при ошибке старое фото остаётся */
  savePhoto:async(o,k,data)=>(await run(['orders','photos'],'readwrite',t=>{t.objectStore('photos').put(rec(o.id,k,data));
   t.objectStore('orders').put({...o,[k==='receipt'?'hasReceipt':'hasDelivery']:true})})).ok,
  getPhoto:async(id,k)=>{const x=(await run('photos','readonly',t=>t.objectStore('photos').get(pkey(id,k)))).res;return x&&x.orderId===id&&x.kind===k?x.data:null},
  deleteOrder:async id=>(await run(['orders','photos'],'readwrite',t=>{t.objectStore('orders').delete(id);KINDS.forEach(k=>t.objectStore('photos').delete(pkey(id,k)))})).ok,
  async expire(now){const out=[];for(const o of await api.orders())if(now-o.t>DAY&&await api.deleteOrder(o.id))out.push(o.id);return out},
  async purgeOrphans(){const ids=new Set((await api.orders()).map(o=>o.id)),ks=(await run('photos','readonly',t=>t.objectStore('photos').getAllKeys())).res||[],bad=ks.filter(k=>!ids.has(+String(k).split(':')[0]));
   if(bad.length)await run('photos','readwrite',t=>{bad.forEach(k=>t.objectStore('photos').delete(k))});return bad.length}};
 return api}
return{open,upgrade,VER}});
