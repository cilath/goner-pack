/* GONER PACK 014 — подтверждённые человеком исправления OCR.
   Отдельный словарь вариантов: сохранённые исправления никогда не становятся
   новыми блюдами и не меняют исходный текст фото/чека. */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.GPL=m})(typeof self!=='undefined'?self:this,function(){
'use strict';
/* Ключ сохраняет границы слов и десятичные разделители: 0,3 не равно 03. */
function key(s){return String(s==null?'':s).toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/(\d)\.(?=\d)/g,'$1,').replace(/[^а-яa-z0-9,]+/g,' ').replace(/\s+/g,' ').trim()}
const forms=d=>[d.n,...(d.a||[])];
const targetOf=(name,dict)=>(dict||[]).find(d=>forms(d).some(f=>key(f)===key(name)));
function canLearn(raw,corrected,dict){const k=key(raw),target=targetOf(corrected,dict);if(!k||!target||key(target.n)===k||!key(corrected))return null;
 // Нельзя обучать правило, которое переопределяет другое существующее блюдо или его алиас.
 if((dict||[]).some(d=>d.k!==target.k&&forms(d).some(f=>key(f)===k)))return null;
 return target}
function makeRule(raw,corrected,dict,now){const d=canLearn(raw,corrected,dict);return d?{k:key(raw),raw:String(raw).trim(),target:d.k,accepted:d.n,t:now==null?Date.now():now}:null}
function resolve(raw,rules,dict){const k=key(raw),rec=k&&(rules||[]).find(x=>x.k===k);if(!rec)return null;
 const target=(dict||[]).find(d=>d.k===rec.target);if(!target)return null;
 // После импорта/редактирования справочника приоритет у точного названия и алиаса другого блюда.
 if((dict||[]).some(d=>d.k!==target.k&&forms(d).some(f=>key(f)===k)))return null;
 return{rule:rec,target}}
/* Показываем похожие варианты только как предложения; отдельное подтверждение обязательно.
   Не предлагаем численно несовместимые наименования (например, 0,3 против 0,5). */
function alternatives(raw,idx,matcher,limit){if(!matcher||!idx||!idx.length)return[];const m=matcher.match(raw,idx),pool=[];
 for(const x of m.alts||[])pool.push({n:x.n,score:x.score});
 for(const x of matcher.search(raw,idx,8)||[])pool.push({n:x.n,score:x.score});
 const seen=new Set([key(raw)]),out=[];
 for(const x of pool.sort((a,b)=>b.score-a.score)){
  if(x.score<.56||seen.has(key(x.n)))continue;
  const c=matcher.compare(matcher.tokens(raw),matcher.tokens(x.n));
  if(c.tok.numBad)continue;
  seen.add(key(x.n));out.push(x.n);if(out.length>=(limit||3))break;
 }
 return out}
return{key,targetOf,canLearn,makeRule,resolve,alternatives}});
