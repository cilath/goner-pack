/* GONER PACK 008: правила статусов, фото и завершения заказа (без DOM и IndexedDB). */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.GPC=m})(typeof self!=='undefined'?self:this,function(){
const left=o=>o.items.filter(i=>i.g<i.q).length;
const allDone=o=>o.items.length>0&&left(o)===0;
function status(o){if(o.done)return['Завершён','dn'];if(left(o))return['Сборка','pk'];if(o.type==='takeaway')return['Готов к выдаче','rd'];return o.hasDelivery?['Готов','rd']:['Готов — требуется фото','wn']}
const canAddDelivery=o=>!o.done&&allDone(o);
const canReplaceDelivery=o=>!o.done&&!!o.hasDelivery;
function finishBlock(o){if(o.done)return'Заказ уже завершён';if(left(o))return'Осталось позиций: '+left(o);if(o.type!=='takeaway'&&!o.hasDelivery)return'Нужно фото готовой доставки';return''}
return{left,allDone,status,canAddDelivery,canReplaceDelivery,finishBlock,canFinish:o=>!finishBlock(o)}});
