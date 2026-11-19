/* GONER PACK 017: CTC-скоринг (ctc.js) — проверка против полного перебора путей на маленьких матрицах. Без нейросети, только числа. */
const test=require('node:test'),assert=require('node:assert');
const CTC=require('../ctc.js');
const R=CTC.R,col=c=>CTC.colOf(c);
/* случайная матрица: в каждом кадре вероятности только на заданных столбцах (остальные почти ноль), лог-вероятности */
function mat(T,cols,seed){let s=seed||1;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;const lp=new Float32Array(T*R).fill(CTC.FLOOR);
 for(let t=0;t<T;t++){const w=cols.map(()=>rnd()+.05),z=w.reduce((a,b)=>a+b,0);cols.forEach((c,i)=>{lp[t*R+c]=Math.log(w[i]/z)})}return{lp,T}}
/* полный перебор: сумма вероятностей путей, которые после схлопывания повторов и удаления пустых дают ровно target (список столбцов) */
/* разделители (пробел, дефис, кавычка…) для необязательных меток — один класс «S» */
const SEP=new Set([' ','-','.','"','(',')','+','/'].map(c=>CTC.colOf(c)));
function brute(m,cols,target,cls){let tot=0;const T=m.T,n=cols.length;const idx=new Array(T).fill(0),tok=c=>cls&&SEP.has(c)?-1:c;
 for(;;){let p=0;for(let t=0;t<T;t++)p+=m.lp[t*R+cols[idx[t]]];const seq=[];let last=-2;for(let t=0;t<T;t++){const c=tok(cols[idx[t]]);if(c!==last&&c!==0)seq.push(c);last=c}
  if(seq.length===target.length&&seq.every((c,i)=>c===target[i]))tot+=Math.exp(p);
  let k=0;while(k<T){idx[k]++;if(idx[k]<n)break;idx[k]=0;k++}if(k===T)break}
 return Math.log(tot)}
const exact=labs=>{const c={labs:Int16Array.from(labs),opt:new Uint8Array(labs.length),core:labs.length};c.g=CTC.graph(c.labs,c.opt);return c};
test('прямой проход CTC совпадает с полным перебором (в т.ч. повтор буквы «оо»)',()=>{
 const a=col('а'),o=col('о'),cols=[0,a,o];
 for(const[T,target,seed]of[[5,[a,o],3],[6,[o,o],7],[6,[a,o,a],11],[4,[a],5]]){const m=mat(T,cols,seed);
  assert.ok(Math.abs(CTC.forward(m,exact(target))-brute(m,cols,target))<1e-4,`T=${T}`)}});
test('необязательный разделитель: P(«а б») = P(«аб») + P(«а␠б») + P(«а-б»)',()=>{
 const a=col('а'),b=col('б'),sp=col(' '),cols=[0,a,b,sp],m=mat(6,cols,13);
 const dash=col('-'),cols2=[0,a,b,sp,dash],m2=mat(6,cols2,13);const p=CTC.forward(m2,CTC.compile('а б')),q=Math.log([[a,b],[a,-1,b]].map(t=>Math.exp(brute(m2,cols2,t,true))).reduce((x,y)=>x+y,0));
 assert.ok(Math.abs(p-q)<1e-4,p+' '+q)});
test('разделители подряд («␠"») — один необязательный разделитель, пути не считаются дважды',()=>{
 const a=col('а'),b=col('б'),sp=col(' '),qq=col('"'),cols=[0,a,b,sp,qq],m=mat(7,cols,17);
 const c=CTC.compile('а "б');assert.deepStrictEqual([...c.opt],[0,1,0]);
 const p=CTC.forward(m,c),v=[[a,b],[a,-1,b]].map(t=>Math.exp(brute(m,cols,t,true))).reduce((x,y)=>x+y,0);
 assert.ok(Math.abs(p-Math.log(v))<1e-4)});
test('нормализация: регистр, ё/й, латиница-двойники',()=>{
 assert.strictEqual(CTC.compile('Ёжик Й').txt,CTC.compile('ежик и').txt);
 assert.strictEqual(CTC.colOf('C'),CTC.colOf('с'));assert.strictEqual(CTC.colOf('р'),CTC.colOf('p'));assert.strictEqual(CTC.colOf(','),CTC.colOf('.'));
 assert.strictEqual(CTC.colOf('n'),CTC.colOf('п'));assert.notStrictEqual(CTC.colOf('z'),CTC.colOf('з'))});
/* «картинка» из текста: в кадре нужной буквы вероятность 0.9, между буквами — пустой символ */
function picture(text,noise){const cs=[...text].map(c=>CTC.colOf(c)).filter(c=>c>=0),T=cs.length*3+2,lp=new Float32Array(T*R).fill(Math.log((noise||.02)/R));
 for(let t=0;t<T;t++)lp[t*R]=Math.log(.9);cs.forEach((c,i)=>{const t=1+3*i;lp[t*R]=Math.log(.08);lp[t*R+c]=Math.log(.9)});return{lp,T}}
test('выбор блюда: точное название → auto, «Сп Кимчи» (пропущена буква) → лидер «Суп Кимчи», начинки не путаются',()=>{
 const dict=[{n:'Суп Кимчи',a:[]},{n:'Суши запечённые с крабом в сырном соусе',a:[]},{n:'Суши запечённые с креветкой в сырном соусе',a:[]},{n:'Киото маки',a:[]}],idx=CTC.index(dict);
 let r=CTC.rank(picture('Суши запеченные с крабом в сырном соусе'),idx),d=CTC.decide(r);assert.strictEqual(d.name,'Суши запечённые с крабом в сырном соусе');assert.strictEqual(d.dec,'auto');
 r=CTC.rank(picture('Суп Кимчи'),idx);d=CTC.decide(r);assert.strictEqual(d.dec,'auto');assert.strictEqual(d.name,'Суп Кимчи');
 /* блюда нет в справочнике: свободное прочтение намного лучше любого блюда */
 r=CTC.rank(picture('Суши запеченные с угрем'),idx);d=CTC.decide(r);assert.strictEqual(d.dec,'none')});
test('многострочное название склеивается через шов (пробел или ничего)',()=>{
 const dict=[{n:'Куриный шницель с картофелем айдахо',a:[]},{n:'Куриный шницель',a:[]}],idx=CTC.index(dict);
 const m=CTC.concat([picture('Куриный шницель с картофеле'),picture('м айдахо')]);const d=CTC.decide(CTC.rank(m,idx));
 assert.strictEqual(d.name,'Куриный шницель с картофелем айдахо');assert.strictEqual(d.dec,'auto')});
test('количество: маска цифр и шаблон N.0',()=>{
 const q=CTC.qtyPick([CTC.qtyScores(picture('3.0'))]);assert.strictEqual(q.q,3);assert.ok(q.post>.9);
 /* буквы вокруг («и 2.0») маска не превращает в цифры */
 const q2=CTC.qtyPick([CTC.qtyScores(picture('12.0'))]);assert.strictEqual(q2.q,12);
 const q3=CTC.qtyPick([CTC.qtyScores(picture('2.0')),CTC.qtyScores(picture('2.0',.5))]);assert.strictEqual(q3.q,2)});
test('усреднение нескольких прочтений строки',()=>{
 const dict=[{n:'Тори маки',a:[]},{n:'Тори пицца маки',a:[]}],idx=CTC.index(dict);
 const a=CTC.rank(picture('Тори маки'),idx),b=CTC.rank(picture('Тори маки',.2),idx),m=CTC.mergeRanks([a,b]);assert.strictEqual(m.list[0].n,'Тори маки');assert.strictEqual(CTC.decide(m).dec,'auto')});
