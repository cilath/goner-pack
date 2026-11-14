/* GONER PACK 010: справочник блюд — слияние встроенной базы с локальными правками, импорт CSV/TSV/TXT/XLSX (без интернета), экспорт.
   Хранение: встроенные записи лежат в коде (dict-seed.js); в IndexedDB (хранилище dict) — только правки пользователя:
   {k,n,c,a,src:'user'|'import'|'edit'} — своя/изменённая запись, {k,del:true} — «надгробие» удалённой встроенной записи. Схема БД не менялась. */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.GPD=m})(typeof self!=='undefined'?self:this,function(){
const key=s=>String(s==null?'':s).toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]/g,'');
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const uniq=a=>{const o=[],k=new Set();for(const x of a){const t=clean(x);if(t&&!k.has(key(t))){k.add(key(t));o.push(t)}}return o};
/* итоговый справочник = встроенные записи − удалённые + изменённые/добавленные пользователем */
function build(seed,recs){const m=new Map();for(const s of seed||[])m.set(key(s.n),{k:key(s.n),n:s.n,c:s.c||'',a:(s.a||[]).slice(),src:'seed',s:s.s||''});
 for(const x of recs||[]){if(!x||!x.k)continue;if(x.del){m.delete(x.k);continue}if(!x.n)continue;m.set(x.k,{k:x.k,n:x.n,c:x.c||'',a:(x.a||[]).slice(),src:x.src||'user',s:x.s||''})}
 return[...m.values()]}
/* ---- CSV ---- */
function parseCSV(text){text=String(text).replace(/^﻿/,'');const first=text.split(/\r?\n/,1)[0]||'',cnt=c=>first.split(c).length-1,d=cnt(';')>=cnt('\t')&&cnt(';')>=cnt(',')?';':cnt('\t')>=cnt(',')?'\t':',';
 const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
  else if(c==='"')q=true;else if(c===d){row.push(cur);cur=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);rows.push(row);row=[];cur=''}else cur+=c}
 if(cur!==''||row.length){row.push(cur);rows.push(row)}return rows.filter(r=>r.some(c=>clean(c)))}
function toCSV(items){const e=v=>{v=String(v==null?'':v);return/[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
 return'﻿'+[['Раздел','Название позиции','Алиасы (через |)','Источник'],...items.map(x=>[x.c,x.n,(x.a||[]).join('|'),x.src==='seed'?x.s||'Встроенный':x.src==='import'?'Импорт':'Добавлено вручную'])].map(r=>r.map(e).join(';')).join('\r\n')+'\r\n'}
/* ---- XLSX: минимальный читатель (zip + XML), без библиотек. Читает ВСЕ листы. ---- */
const u16=(b,o)=>b[o]|b[o+1]<<8,u32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0,dec=new TextDecoder('utf-8');
async function inflate(raw){if(typeof DecompressionStream==='undefined')throw new Error('браузер не умеет распаковывать Excel: сохраните справочник как CSV');
 const ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(raw);w.close();return new Uint8Array(await new Response(ds.readable).arrayBuffer())}
async function unzip(buf){const b=new Uint8Array(buf);let e=-1;for(let i=b.length-22;i>=Math.max(0,b.length-70000);i--)if(b[i]===0x50&&b[i+1]===0x4b&&b[i+2]===5&&b[i+3]===6){e=i;break}
 if(e<0)throw new Error('это не файл Excel (.xlsx)');const n=u16(b,e+10);let p=u32(b,e+16);const out={};
 for(let i=0;i<n;i++){if(u32(b,p)!==0x02014b50)break;const meth=u16(b,p+10),cs=u32(b,p+20),nl=u16(b,p+28),el=u16(b,p+30),cl=u16(b,p+32),lo=u32(b,p+42),name=dec.decode(b.subarray(p+46,p+46+nl));p+=46+nl+el+cl;
  if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name))continue;
  const ln=u16(b,lo+26),le=u16(b,lo+28),d=b.subarray(lo+30+ln+le,lo+30+ln+le+cs);out[name]=NS(dec.decode(meth===0?d:await inflate(d)))}return out}
/* XML с префиксом пространства имён (<x:row>…) приводим к обычному виду */
const NS=x=>x.replace(/<(\/?)[A-Za-z][\w-]*:(?=[A-Za-z])/g,'<$1');
const unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(m,c)=>String.fromCodePoint(+c)).replace(/&#x([0-9a-f]+);/gi,(m,c)=>String.fromCodePoint(parseInt(c,16))).replace(/&amp;/g,'&');
const textOf=x=>[...x.replace(/<rPh[\s\S]*?<\/rPh>/g,'').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>unesc(m[1])).join('');
const colNo=ref=>{let n=0;for(const c of ref.replace(/\d+/g,''))n=n*26+c.charCodeAt(0)-64;return n-1};
async function readXlsx(buf){const z=await unzip(buf);if(!z['xl/workbook.xml'])throw new Error('в файле нет книги Excel');
 const ss=z['xl/sharedStrings.xml']?[...z['xl/sharedStrings.xml'].matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map(m=>textOf(m[1])):[];
 const rel={};for(const m of(z['xl/_rels/workbook.xml.rels']||'').matchAll(/<Relationship\b[^>]*>/g)){const id=(m[0].match(/\bId="([^"]+)"/)||[])[1],t=(m[0].match(/\bTarget="([^"]+)"/)||[])[1];if(id&&t)rel[id]=t}
 const sheets=[];for(const m of z['xl/workbook.xml'].matchAll(/<sheet\b[^>]*>/g)){const nm=unesc((m[0].match(/\bname="([^"]*)"/)||[])[1]||''),id=(m[0].match(/\br:id="([^"]+)"/)||[])[1];let t=rel[id]||'';t=t.replace(/^\/?(xl\/)?/,'');const xml=z['xl/'+t];if(!xml)continue;
  const rows=[];for(const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){const row=[];
   for(const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const at=cm[1],ref=(at.match(/\br="([A-Z]+\d+)"/)||[])[1],ty=(at.match(/\bt="([^"]+)"/)||[])[1],body=cm[2]||'';let v='';
    if(ty==='s'){const i=+((body.match(/<v>(\d+)<\/v>/)||[])[1]);v=ss[i]||''}else if(ty==='inlineStr')v=textOf(body);else{const x=body.match(/<v>([\s\S]*?)<\/v>/);v=x?unesc(x[1]):''}
    const c=ref?colNo(ref):row.length;while(row.length<c)row.push('');row[c]=v}
   rows.push(row)}
  sheets.push({name:nm,rows:rows.filter(r=>r.some(c=>clean(c)))})}
 return sheets}
/* ---- разбор таблицы в записи: заголовки определяются по названию колонок, иначе название = первая колонка ---- */
function rowsToItems(rows,srcName){const H=rows[0]||[],hn=H.map(h=>clean(h).toLowerCase());
 const find=re=>hn.findIndex(h=>re.test(h)),iN=find(/назван|блюд|позици|наимен|продукт/),hasHead=iN>=0&&isNaN(H[iN]);
 const iC=hasHead?find(/раздел|категор|группа/):-1,iA=hasHead?find(/алиас|вариант|синоним|иначе/):-1,iS=hasHead?find(/источник/):-1,c0=hasHead?iN:0,out=[];
 for(const r of rows.slice(hasHead?1:0)){const n=clean(r[c0]);if(!n||!isNaN(n.replace(',','.'))||!/[а-яёa-z]/i.test(n))continue;
  out.push({n,c:iC>=0?clean(r[iC]):'',a:iA>=0?uniq(String(r[iA]||'').split(/[|\n]+/)):[],s:iS>=0?clean(r[iS]):srcName||''})}
 return{items:out,column:hasHead?clean(H[iN]):'первая колонка'}}
async function parseFile(name,buf){let sheets;
 if(/\.xlsx$/i.test(name)||(buf.byteLength>3&&new Uint8Array(buf,0,2)[0]===0x50&&new Uint8Array(buf,0,2)[1]===0x4b))sheets=await readXlsx(buf);
 else if(/\.xls$/i.test(name))throw new Error('старый формат .xls не поддерживается: сохраните как .xlsx или CSV');
 else sheets=[{name:'',rows:parseCSV(dec.decode(new Uint8Array(buf)))}];
 const items=[],info=[];for(const sh of sheets){const r=rowsToItems(sh.rows,sh.name);info.push({sheet:sh.name||'—',rows:r.items.length,column:r.column});items.push(...r.items)}
 return{items,info}}
/* слияние импортированных записей с текущим справочником → какие записи сохранить в БД */
function merge(cur,items){const by=new Map(cur.map(x=>[x.k,x])),aliasOf=new Map();cur.forEach(x=>(x.a||[]).forEach(a=>aliasOf.set(key(a),x)));const save=new Map();let added=0,updated=0,same=0;
 for(const it of items){const k=key(it.n);if(!k)continue;const ex=save.get(k)||by.get(k)||aliasOf.get(k);
  if(ex){const a=uniq([...(ex.a||[]),...it.a,...(ex.k!==k?[it.n]:[])]),c=ex.c||it.c;if(a.length!==(ex.a||[]).length||c!==ex.c){const was=save.has(ex.k);save.set(ex.k,{k:ex.k,n:ex.n,c,a,s:ex.s,src:ex.src==='seed'?'edit':ex.src});if(!was)updated++}else same++}
  else{const n={k,n:it.n,c:it.c,a:it.a,s:it.s,src:'import'};save.set(k,n);by.set(k,n);added++}}
 return{save:[...save.values()],added,updated,same}}
return{key,build,parseCSV,toCSV,readXlsx,parseFile,rowsToItems,merge,uniq,clean}});
