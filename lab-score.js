/* GONER PACK 013 / OCR LAB: сравнение результата с эталоном. Эталон используется ТОЛЬКО здесь, для подсчёта ошибок; в распознавание он не попадает. */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.LABSCORE=m})(typeof self!=='undefined'?self:this,function(){
function score(p,T,o){o=o||{};const match=o.match,needsOk=o.needsOk,dn=n=>{if(!match)return null;const m=match(n);return m.st==='o'?m.name:null},norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]/g,'');
 const key=n=>dn(n)||norm(n);const want=T.items.filter(x=>x.kind!=='cutlery'),dish=p.items.filter(x=>x.kind==='dish'),used=new Set();let ok=0,qtyErr=0,sumErr=0;const missed=[],qtyBad=[];
 for(const t of want){const k=dish.findIndex((x,i)=>!used.has(i)&&key(x.name)===key(t.name));if(k<0){missed.push(t.name);continue}used.add(k);ok++;if(dish[k].qty!==t.qty){qtyErr++;qtyBad.push(`${t.name}: ${dish[k].qty} вместо ${t.qty}`)}if(t.sum!=null&&dish[k].sum!==t.sum)sumErr++}
 const extra=dish.filter((x,i)=>!used.has(i)).map(x=>x.name),cut=p.items.filter(x=>x.kind==='cutlery').map(x=>x.name+'×'+x.qty).sort(),wc=T.items.filter(x=>x.kind==='cutlery').map(x=>x.name+'×'+x.qty).sort();
 const manual=needsOk?p.items.filter(x=>needsOk({...x,st:x.kind==='cutlery'?'o':x.st?x.st:match?match(x.name).st:'u'},true)).length:null;   // 017: статус экрана проверки (review.js), если он уже посчитан
 return{ms:Math.round(o.ms||0),rows:dish.length,ok,want:want.length,qtyErr,qtyBad,sumErr,missed,extra,manual,no:!T.no||p.no===T.no,ex:!T.ex||p.ex===T.ex,total:!!(p.check&&p.check.ok),cut:!wc.length||JSON.stringify(cut)===JSON.stringify(wc),cutList:cut}}
/* эталон из текста: строки «Название ×N» или «Название N»; приборы — с префиксом «прибор:» */
function parseTruth(text){const items=[];String(text||'').split(/\r?\n/).forEach(l=>{l=l.trim();if(!l)return;const cut=/^прибор[ыа]?\s*:/i.test(l);l=l.replace(/^прибор[ыа]?\s*:\s*/i,'');const m=l.match(/^(.*?)\s*[×x*]?\s*(\d{1,2})\s*(шт\.?)?$/i);
 const name=(m?m[1]:l).trim().replace(/[–—-]\s*$/,'').trim(),qty=m?+m[2]:1;if(name)items.push(cut?{name,qty,kind:'cutlery'}:{name,qty})});return{items}}
return{score,parseTruth}});
