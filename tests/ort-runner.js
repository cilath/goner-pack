/* GONER PACK 017: запуск моделей в Node для тестов и замеров. Используется тот же onnxruntime-web 1.20.1 (WebAssembly), что и в браузере
   телефона (neural-web.js), — те же ONNX-файлы из models/, та же предобработка neural.js. Отличие от телефона: процессор и число потоков. */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
let cache=null;
async function load(){if(cache)return cache;const ort=require('onnxruntime-web');ort.env.wasm.numThreads=1;
 const opt={executionProviders:['wasm'],graphOptimizationLevel:'all'};
 const det=await ort.InferenceSession.create(path.join(ROOT,'models/ppocrv5_mobile_det.onnx'),opt),rec=await ort.InferenceSession.create(process.env.GP_REC_MODEL||path.join(ROOT,'models/eslav_ppocrv5_mobile_rec.onnx'),opt);
 /* другая модель распознавания для сравнения: GP_REC_MODEL=путь.onnx GP_REC_KEYS=словарь.txt node tools/bench017.js 017 */
 const keys=fs.readFileSync(process.env.GP_REC_KEYS||path.join(ROOT,'models/ppocrv5_eslav_dict.txt'),'utf8').split('\n');if(keys[keys.length-1]==='')keys.pop();
 const runner={det:async(x,d)=>{const r=await det.run({[det.inputNames[0]]:new ort.Tensor('float32',x,d)});return r[det.outputNames[0]].data},
  rec:async(x,d)=>{const r=await rec.run({[rec.inputNames[0]]:new ort.Tensor('float32',x,d)}),o=r[rec.outputNames[0]];return{data:o.data,dims:o.dims}}};
 cache={runner,keys};return cache}
/* JPEG → {w,h,d:RGBA}. Фото уже уменьшены до 2400 px по длинной стороне, как это делает приложение (shrink 2400, качество 0.92). */
async function image(file){const sharp=require('sharp'),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{w:info.width,h:info.height,d:new Uint8ClampedArray(data.buffer,data.byteOffset,data.length)}}
module.exports={load,image,ROOT};
