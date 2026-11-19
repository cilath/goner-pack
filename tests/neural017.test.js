/* GONER PACK 017: части neural.js без нейросети — разрезание слипшихся строк, поворот на 90°, сборка строк по локальному наклону, склейка переносов. */
const test=require('node:test'),assert=require('node:assert');
const N=require('../neural.js'),GP=require('../parser.js');
test('компонента из двух слипшихся строк разрезается по провалу профиля',()=>{const w=60,h=44,p=new Float32Array(w*h);
 const fill=(x0,y0,x1,y1)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)p[y*w+x]=.9};
 const w2=w;fill(2,2,58,8);fill(5,16,50,22);fill(40,22,42,26);fill(5,26,50,32);fill(3,35,55,39);   /* строки 1 и 4 отдельно; строки 2 и 3 соединены тонкой перемычкой */
 const c=N.components(p,w2,h,.3);assert.strictEqual(c.length,4,JSON.stringify(c));assert.ok(c.filter(x=>x.split).length===2)});
test('поворот на 90° без потерь',()=>{const g={w:3,h:2,d:Uint8ClampedArray.from([1,2,3,4,5,6])};const r=N.rot90(g,1);assert.deepStrictEqual([r.w,r.h,...r.d],[2,3,4,1,5,2,6,3]);const back=N.rot90(r,-1);assert.deepStrictEqual([...back.d],[1,2,3,4,5,6])});
/* рамка: x0..x1, y-центр, наклон в градусах */
const box=(text,x0,x1,yc,ang,h)=>{h=h||20;return{text,conf:.95,x0,x1,rx0:x0,rx1:x1,y0:yc-h/2,y1:yc+h/2,ang:ang||0,wide:x1-x0>4*h}};
test('изогнутый чек: название и числа одной строки не уезжают в соседнюю (локальный наклон рамок)',()=>{
 /* строки идут с шагом 24 px; на этом участке чек наклонён на 6°: сумма на 400 px правее названия ниже на ~42 px (почти две строки) */
 const t=Math.tan(6*Math.PI/180),it=[];['Кацудон','Оливье с цыпленком ДМ','Чизкейк Сан Себастьян','Барбекю ролл с беконом','Пицца 4 Сыра'].forEach((n,i)=>{const y=100+24*i;it.push(box(n,100,300,y,6),box('1.0',480,520,y+t*300),box(String(100+i)+'.00',560,640,y+t*400))});
 const L=N.layout(it);const rows=L.lines.map(l=>l.text);
 assert.ok(rows.includes('Кацудон   1.0   100.00'),rows.join('\n'));assert.ok(rows.includes('Пицца 4 Сыра   1.0   104.00'),rows.join('\n'))});
test('перенос названия по ширине колонки склеивается без пробела, с отступом — через пробел',()=>{
 const P=(text,x0,x1,yc)=>({text,conf:.95,x0,x1,rx0:x0,rx1:x1,y0:yc-10,y1:yc+10});const L=(parts)=>({text:parts.map(p=>p.text).join('   '),conf:.95,parts,x0:parts[0].x0,x1:parts[parts.length-1].x1,y0:parts[0].y0,y1:parts[0].y1});
 const lines=[L([P('Наименование',100,300,80),P('Кол-в Сумма',480,640,80)]),
  L([P('Куриный шницель с картофеле',100,370,100),P('1.0',480,520,100),P('126.77',560,640,100)]),L([P('м айдахо',100,180,124)]),
  L([P('Королевские игай яки гигант',100,370,148),P('1.0',480,520,148),P('170.70',560,640,148)]),L([P('(5 WT)',112,170,172)]),
  L([P('Суши запеченные с тунцом в',100,358,196),P('1.0',480,520,196),P('39.94',560,640,196)]),L([P('СЫРНОМ СОУСЕ',100,220,220)]),
  L([P('Каппа маки',100,200,244)]),L([P('Итог : 336.41',400,640,268)])];
 const J=N.joinWraps(lines,N.tableOf(lines)).map(l=>l.text);
 assert.ok(J.includes('Куриный шницель с картофелем айдахо   1.0   126.77'),J.join('\n'));
 assert.ok(J.includes('Королевские игай яки гигант (5 шт)   1.0   170.70'),J.join('\n'));
 assert.ok(J.includes('Суши запеченные с тунцом в сырном соусе   1.0   39.94'),J.join('\n'));
 assert.ok(J.includes('Каппа маки'),'строка с заглавной буквы после законченного названия — не перенос');
 const p=GP.parse(['ПРЕДЧЕК АДМИН № 1044917',...J].join('\n'));const it=p.items.find(x=>/айдахо/.test(x.name));assert.ok(it&&it.qty===1&&it.sum===126.77)});
test('разбор помнит исходные строки позиции (для выбора блюда по нейросети)',()=>{
 const p=GP.parse('ПРЕДЧЕК АДМИН № 1\nНаименование Кол-во Сумма\nСуши запеченные с крабом в 1.0 21.96\nсырном соусе\nТори маки 1.0 181.79\nИтого 203.75');
 assert.deepStrictEqual(p.items.filter(x=>x.kind==='dish').map(x=>x.src),[[2,3],[4]])});
