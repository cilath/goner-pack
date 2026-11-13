/* GONER PACK 007: разбор текста чека. Работает в браузере (window.GP) и в Node (тесты). */
(function(root,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else root.GP=m})(typeof self!=='undefined'?self:this,function(){
const LK={a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у'};
const norm=s=>String(s).toLowerCase().replace(/ё/g,'е').replace(/[a-z]/g,c=>LK[c]||c).replace(/[^а-я0-9a-z]/g,'');
const intQty=s=>{const m=String(s).match(/^(\d{1,3})(?:[.,]0+)?$/);return m?+m[1]:null};
const isNum=s=>/^\d+(?:[.,]\d+)?$/.test(s),num=s=>parseFloat(String(s).replace(',','.'));
const CUT=/^(?:палочк|ложк|нож|вилк|прибор)/i;
const CUTQ=/^(палочк\S*|ложк\S*|нож\S*|вилк\S*|прибор\S*)(?:\s*[-:xх×]*\s*(\d{1,2})(?:[.,]0+)?)?\s*(?:шт\.?)?$/i;
const HDR=/наименование|кол-?\s?во/i,END=/^(?:итого|всего|к оплате|сумма заказа|итог)/i;
const SVC=/спасибо|www\.|http|@|\bтел[.:\s]|телефон|адрес|касс[аи]|официант|^стол\b|^дата|скидк|акци[яи]|подар|ндс|чаев|приятного|\d{2}\.\d{2}\.\d{2,4}|\d{1,2}:\d{2}/i;
function qtyFrom(n){const k=n.length;
 if(k>=3){const qi=intQty(n[0]);if(qi&&Math.abs(qi*num(n[1])-num(n[2]))<0.015)return{qty:qi,d:[]};return{qty:qi||0,d:['сумма не сходится с ценой × количеством']}}
 if(k===2){const qi=intQty(n[0]);return qi?{qty:qi,d:[]}:{qty:0,d:['количество не определено']}}
 const qi=intQty(n[0]);return{qty:qi||0,d:[qi?'нет цены, количество под вопросом':'количество не определено']}}
function parse(text){
 const L=String(text).split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean),out={no:'',ex:'',items:[],skipped:[]};
 const NR=/ПРЕД\s*ЧЕК\s*АДМИН[^\d\n]{0,6}(\d+)/i,ni=L.findIndex(l=>NR.test(l));if(ni>=0)out.no=L[ni].match(NR)[1];
 const ci=L.findIndex(l=>/^прибор/i.test(l)&&l.length<30&&!/\d{3,}/.test(l));let exI=-1;
 if(ci>0)for(let j=ci-1;j>=Math.max(0,ci-3);j--)if(/^\d{3,8}$/.test(L[j].replace(/\s/g,''))){out.ex=L[j].replace(/\s/g,'');exI=j;break}
 const h=L.findIndex(l=>HDR.test(l)),s=h>=0?h+1:ni+1;let e=L.length;
 for(let i=s;i<L.length;i++)if(END.test(L[i])){e=i;break}
 if(ci>=s&&ci<e)e=ci;
 const items=[];let pend='',prev=null;
 const push=(name,qty,doubt,kind)=>{prev={name,qty,doubt,kind:kind||(CUT.test(name)?'cutlery':'dish')};items.push(prev)};
 const flush=()=>{if(pend){out.skipped.push({line:pend});pend=''}};
 for(let i=s;i<e;i++){const l=L[i];if(i===exI||HDR.test(l)||SVC.test(l))continue;
  const cm=l.match(CUTQ);if(cm){flush();push(cm[1],cm[2]?+cm[2]:0,cm[2]?[]:['количество не найдено'],'cutlery');continue}
  const t=l.split(' ');let k=0;while(k<3&&k<t.length&&isNum(t[t.length-1-k]))k++;
  if(!k){if(prev&&/^[а-яёa-z]/.test(l)&&!pend){prev.name+=' '+l;if(!prev.doubt.includes('перенос названия'))prev.doubt.push('перенос названия')}else{flush();pend=l}continue}
  const name=t.slice(0,t.length-k).join(' '),nm=[pend,name].filter(Boolean).join(' ').trim(),q=qtyFrom(t.slice(t.length-k));
  if(!nm){out.skipped.push({line:l});pend='';continue}
  const d=[...q.d];if(pend)d.push('перенос названия');pend='';push(nm,q.qty,d)}
 flush();
 for(let i=0;i<L.length;i++){if(i>=s&&i<e)continue;const cm=L[i].match(CUTQ);if(cm&&cm[2]&&i!==exI)push(cm[1],+cm[2],[],'cutlery')}
 const mg=[];items.forEach(x=>{const key=x.kind+norm(x.name),y=mg.find(z=>z.key===key);if(y){y.qty+=x.qty;x.doubt.forEach(d=>y.doubt.includes(d)||y.doubt.push(d))}else mg.push({...x,key})});
 out.items=mg.map(({key,...r})=>r).sort((a,b)=>(a.kind==='cutlery')-(b.kind==='cutlery'));return out}
const needsOk=(x,on)=>!!((x.doubt&&x.doubt.length)||(on&&x.kind!=='cutlery'&&x.st!=='o'));
function validate(d,on){const er=[];if(!/^\d+$/.test(String(d.no||'').trim()))er.push('Укажите номер предчека (только цифры)');
 if(String(d.ex||'').trim()&&!/^\d+$/.test(String(d.ex).trim()))er.push('Дополнительный ID: только цифры');
 if(!d.items.length)er.push('Добавьте хотя бы одну позицию');
 d.items.forEach((x,i)=>{if(!String(x.name).trim())er.push(`Позиция ${i+1}: нет названия`);if(!Number.isInteger(x.qty)||x.qty<1||x.qty>99)er.push(`Позиция ${i+1}: количество должно быть целым числом от 1 до 99`)});
 const u=d.items.filter(x=>needsOk(x,on)&&!x.cf).length;if(u)er.push(`Подтвердите сомнительные позиции: ${u}`);
 if((d.skipped||[]).length)er.push(`Разберите пропущенные строки чека: ${d.skipped.length}`);return er}
return{parse,validate,needsOk,norm,intQty}});
