import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync, gunzipSync, constants } from "node:zlib";
import { inflateGzipBounded, crc32 } from "../app/session-gzip-preflight.mjs";
import { parseSessionHash, parseSessionHashAsync, MAX_DECODED_BYTES, MAX_FRAGMENT_LENGTH, MAX_COMPRESSED_BYTES } from "../app/session-share.mjs";
import { createMemoryTrainingRepository, saveTrainingSession } from "../app/training-records.mjs";
const fixture = JSON.parse(await readFile(new URL("./fixtures/session-share-v1-transport.json", import.meta.url)));
const catalog = JSON.parse(await readFile(new URL("../reference/kata-catalog.v2.json", import.meta.url)));
const kata = catalog.kata.map(k => ({ id:k.id, name:k.nameKo }));
const Native = globalThis.DecompressionStream;
const token = bytes => "#session=gz1." + Buffer.from(bytes).toString("base64url");
const encode = value => token(gzipSync(Buffer.from(JSON.stringify(value))));
async function withoutNative(action) {
  const original = globalThis.DecompressionStream;globalThis.DecompressionStream = undefined;
  try { return await action(); } finally { globalThis.DecompressionStream = original; }
}
const fallback = hash => withoutNative(() => parseSessionHashAsync(hash));
const assertCode = (result, code) => {assert.equal(result.ok,false);assert.equal(result.code,code);assert.equal(typeof result.message,"string");};

test("D1 fallback feature dispatch prefers complete native gzip", async()=>{
  let calls=0;globalThis.DecompressionStream=class extends Native {constructor(format){super(format);assert.equal(format,"gzip");calls++;}};
  try {assert.deepEqual((await parseSessionHashAsync(new URL(fixture.gzipUrl).hash)).payload,fixture.payload);assert.equal(calls,1);}
  finally {globalThis.DecompressionStream=Native;}
});
for(const [label,API] of [
  ["absent",undefined], ["unknown value",{}], ["null",null],
  ["constructor rejects gzip",class {constructor(){throw Error("unsupported");}}],
  ["partial object",class {}],
  ["duck-typed non-stream",class {constructor(){this.readable={getReader(){}};this.writable={getWriter(){}};}}],
  ["throwing stream getter",class {get readable(){throw Error("partial");}}]
]) test("D1 fallback feature dispatch handles "+label,async()=>{
  globalThis.DecompressionStream=API;
  try {assert.deepEqual((await parseSessionHashAsync(new URL(fixture.gzipUrl).hash)).payload,fixture.payload);}
  finally {globalThis.DecompressionStream=Native;}
});
test("D1 fallback does not require ReadableStream/WritableStream APIs",async()=>{
  const readable=globalThis.ReadableStream,writable=globalThis.WritableStream;
  globalThis.ReadableStream=undefined;globalThis.WritableStream=undefined;
  try {assert.deepEqual((await parseSessionHashAsync(new URL(fixture.gzipUrl).hash)).payload,fixture.payload);}
  finally {globalThis.ReadableStream=readable;globalThis.WritableStream=writable;}
});
test("D1 started native stream errors fail closed without retrying through fallback",async()=>{
  globalThis.DecompressionStream=class {constructor(){
    this.readable=new ReadableStream({start(controller){controller.error(Error("native failed"));}});
    this.writable=new WritableStream();
  }};
  try {assertCode(await parseSessionHashAsync(new URL(fixture.gzipUrl).hash),"invalid-compressed-stream");}
  finally {globalThis.DecompressionStream=Native;}
});
for(const [label,list] of [
  ["normal Korean",kata.slice(0,5)], ["long fifty",kata.slice(0,50)],
  ["ken/jo awase individual reverse order",kata.filter(k=>k.name.includes("아와세")).reverse()],
  ["unknown/name mismatch",[{id:"future-id",name:"새 카타"},{id:kata[0].id,name:"기존 공유 이름"}]],
  ["97 entries keep semantic rejection",kata]
]) test("D1 fallback/native logical equivalence: "+label,async()=>{
  const value={...fixture.payload,sessionNo:12345,date:"2028-02-29",kata:list};
  const hash=encode(value), native=await parseSessionHashAsync(hash);
  assert.deepEqual(await fallback(hash),native);
  if(list.length<=50) {assert.deepEqual(native.payload,value);assert.equal(native.payload.sessionNo,12345);assert.equal(native.payload.date,"2028-02-29");}
  else assertCode(native,"invalid-kata-array");
});
const bytes=gzipSync(Buffer.from(JSON.stringify(fixture.payload)));
const corrupted=Buffer.from(bytes);corrupted[corrupted.length-8]^=1;
for(const [label,hash,code] of [
  ["malformed gzip",token([0,1,2]),"invalid-compressed-stream"],
  ["invalid DEFLATE block",token([31,139,8,0,0,0,0,0,0,3,7,0,0,0,0,0,0,0,0]),"invalid-compressed-stream"],
  ["CRC mismatch",token(corrupted),"invalid-compressed-stream"],
  ["trailing bytes",token(Buffer.concat([bytes,Buffer.from([0])])),"invalid-compressed-stream"],
  ["concatenated members",token(Buffer.concat([bytes,bytes])),"invalid-compressed-stream"],
  ["empty-prefix member",token(Buffer.concat([gzipSync(Buffer.alloc(0)),bytes])),"invalid-compressed-stream"],
  ["malformed base64url","#session=gz1.***","invalid-base64url"],
  ["noncanonical pad bits","#session=gz1.AB","invalid-base64url"],
  ["padded base64","#session=gz1.AA==","invalid-base64url"],
  ["unknown discriminator","#session=gz2.AA","unsupported-transport"],
  ["encoded oversize","#session=gz1."+"A".repeat(MAX_FRAGMENT_LENGTH-3),"fragment-too-long"],
  ["inflated oversize",token(gzipSync(Buffer.alloc(8193,65))),"inflated-too-large"],
  ["invalid UTF-8",token(gzipSync(Buffer.from([195,40]))),"invalid-utf8"],
  ["invalid JSON",token(gzipSync(Buffer.from("{invalid"))),"invalid-json"],
  ["invalid Payload v1",encode({...fixture.payload,schema:"wrong"}),"invalid-schema"]
]) test("D1 forced fallback rejects "+label,async()=>{
  const native=await parseSessionHashAsync(hash);assertCode(native,code);assert.deepEqual(await fallback(hash),native);
});
test("D1 forced fallback rejects every truncated prefix",async()=>{
  await withoutNative(async()=>{for(let i=0;i<bytes.length;i++)assert.equal((await parseSessionHashAsync(token(bytes.subarray(0,i)))).ok,false,`cut ${i}`);});
});
test("D1 fallback exact inflated limit succeeds and honest/forged bombs allocate no output",async()=>{
  const text=JSON.stringify(fixture.payload);
  assert.deepEqual((await fallback(token(gzipSync(Buffer.from(text+" ".repeat(8192-Buffer.byteLength(text))))))).payload,fixture.payload);
  const bomb=gzipSync(Buffer.alloc(2*1024*1024,65)), forged=Buffer.from(bomb);forged.writeUInt32LE(8192,forged.length-4);
  const TypedArray=globalThis.Uint8Array,allocations=[];
  globalThis.Uint8Array=new Proxy(TypedArray,{construct(target,args){allocations.push(args[0]);return Reflect.construct(target,args);}});
  try {
    for(const candidate of [bomb,forged])assert.throws(()=>inflateGzipBounded(candidate,MAX_DECODED_BYTES),e=>e.code==="inflated-too-large");
    assert.deepEqual(allocations,[]);
  } finally {globalThis.Uint8Array=TypedArray;}
});
test("D1 fallback exact compressed bound succeeds and compressed oversize rejects",async()=>{
  const header=Buffer.from(bytes.subarray(0,10));header[3]=4;
  const extra=MAX_COMPRESSED_BYTES-bytes.length-2,length=Buffer.alloc(2);length.writeUInt16LE(extra);
  const atLimit=Buffer.concat([header,length,Buffer.alloc(extra),bytes.subarray(10)]);
  assert.equal(atLimit.length,12285);assert.equal(token(atLimit).slice(9).length,16384);
  assert.deepEqual((await fallback(token(atLimit))).payload,fixture.payload);
  const longer=Buffer.concat([atLimit.subarray(0,12),Buffer.from([0]),atLimit.subarray(12)]);longer.writeUInt16LE(extra+1,10);
  assert.equal(gunzipSync(longer).length,Buffer.byteLength(JSON.stringify(fixture.payload)));
  assert.throws(()=>inflateGzipBounded(longer,8192));assertCode(await fallback(token(longer)),"fragment-too-long");
});
test("D1 fallback rejects caller limits above the fixed cap or nonfinite limits",()=>{
  for(const limit of [8193,Infinity,NaN,-1,1.5])assert.throws(()=>inflateGzipBounded(bytes,limit));
});
test("D1 fallback supports gzip optional extra/name/comment and verifies header CRC",async()=>{
  const header=Buffer.from(bytes.subarray(0,10));header[3]=2|4|8|16;
  const prefix=Buffer.concat([header,Buffer.from([1,0,9]),Buffer.from("session\0note\0")]),check=Buffer.alloc(2);check.writeUInt16LE(crc32(prefix)&65535);
  const framed=Buffer.concat([prefix,check,bytes.subarray(10)]);
  assert.deepEqual((await fallback(token(framed))).payload,fixture.payload);
  framed[prefix.length]^=1;assertCode(await fallback(token(framed)),"invalid-compressed-stream");
});
test("D1 fallback/native preview errors and successes never touch browser storage",async()=>{
  let calls=0;Object.defineProperty(globalThis,"indexedDB",{configurable:true,get(){calls++;throw Error("unexpected storage access");}});
  try {await fallback(encode(fixture.payload));await fallback("#session=gz1.AA");assert.equal(calls,0);}
  finally {delete globalThis.indexedDB;}
});
test("D1 fallback/raw confirm retains duplicate/date-conflict semantics",async()=>{
  const repository=createMemoryTrainingRepository(), parsed=await fallback(encode(fixture.payload));
  assert.deepEqual(await repository.list(),[]);
  assert.equal((await saveTrainingSession(repository,parsed.payload,"2026-10-07T00:00:00Z")).status,"saved");
  const before=await repository.list(),raw=parseSessionHash(new URL(fixture.legacyUrl).hash);
  assert.equal((await saveTrainingSession(repository,raw.payload,"2026-10-07T00:01:00Z")).status,"duplicate");
  const conflict=await fallback(encode({...fixture.payload,date:"2026-09-14"}));
  assert.equal((await saveTrainingSession(repository,conflict.payload,"2026-10-07T00:02:00Z")).status,"conflict");
  assert.deepEqual(await repository.list(),before);
});
test("D1 fallback byte-exact differential covers 384 valid stored/fixed/dynamic/RLE vectors",()=>{
  let seed=456789,count=0;
  for(const length of [0,1,2,10,100,1000,8191,8192])for(const level of [0,1,6,9])for(const strategy of [constants.Z_DEFAULT_STRATEGY,constants.Z_FIXED,constants.Z_HUFFMAN_ONLY,constants.Z_RLE]) {
    const random=Buffer.alloc(length);for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;random[i]=seed>>>24;}
    for(const input of [random,Buffer.alloc(length,65),Buffer.from("가나다라마바사😀".repeat(Math.ceil(length/26))).subarray(0,length)]) {
      const gzip=gzipSync(input,{level,strategy}),output=inflateGzipBounded(gzip,8192);
      assert.deepEqual(Buffer.from(output),input);assert.deepEqual(Buffer.from(output),gunzipSync(gzip));count++;
    }
  }
  assert.equal(count,384);
});
test("D1 fallback byte-exact/rejection differential covers 5000 corrupted vectors",()=>{
  let seed=456789;const base=gzipSync(Buffer.from(JSON.stringify({...fixture.payload,kata:kata.slice(0,50)})));
  for(let i=0;i<5000;i++) {
    const candidate=Buffer.from(base);seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    candidate[10+seed%(candidate.length-18)]^=1<<(seed%8);
    let oracle,output;try {oracle=gunzipSync(candidate,{maxOutputLength:8192});}catch{}
    try {output=inflateGzipBounded(candidate,8192);}catch{}
    if(oracle) {assert.ok(output,`false reject ${i}`);assert.deepEqual(Buffer.from(output),oracle);}
    else assert.equal(output,undefined,`invalid accepted ${i}`);
  }
});

function deflateFrame(build, output = Buffer.alloc(0)) {
  const bits=[];
  const write=(value,count)=>{for(let i=0;i<count;i++)bits.push((value>>>i)&1);};
  const fixed=symbol=>{
    const [code,length]=symbol<144?[48+symbol,8]:symbol<256?[400+symbol-144,9]:symbol<280?[symbol-256,7]:[192+symbol-280,8];
    for(let i=length-1;i>=0;i--)bits.push((code>>>i)&1);
  };
  build(write,fixed);
  const data=Buffer.alloc(Math.ceil(bits.length/8));bits.forEach((bit,i)=>data[i>>>3]|=bit<<(i&7));
  const trailer=Buffer.alloc(8);trailer.writeUInt32LE(crc32(output));trailer.writeUInt32LE(output.length,4);
  return Buffer.concat([Buffer.from([31,139,8,0,0,0,0,0,0,3]),data,trailer]);
}
test("D1 fallback overlapping LZ77 match copies forward byte-exactly",()=>{
  const output=Buffer.alloc(259,65);
  const framed=deflateFrame((write,fixed)=>{write(1,1);write(1,2);fixed(65);fixed(285);write(0,5);fixed(256);},output);
  assert.deepEqual(gunzipSync(framed),output);assert.deepEqual(Buffer.from(inflateGzipBounded(framed,8192)),output);
});
test("D1 fallback rejects invalid distance and reserved literal/length codes",async()=>{
  for(const framed of [
    deflateFrame((write,fixed)=>{write(1,1);write(1,2);fixed(257);write(0,5);fixed(256);},Buffer.alloc(3,65)),
    deflateFrame((write,fixed)=>{write(1,1);write(1,2);fixed(286);fixed(256);})
  ]) {
    assert.throws(()=>gunzipSync(framed));assert.throws(()=>inflateGzipBounded(framed,8192));
    assertCode(await fallback(token(framed)),"invalid-compressed-stream");
  }
});
function emptyDynamic(write,incompleteCodeTree=false) {
  write(1,1);write(2,2);write(0,5);write(0,5);write(14,4);
  const order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1];
  for(const symbol of order)write(symbol===0?1:symbol===1&&!incompleteCodeTree?1:0,3);
  for(let i=0;i<258;i++)write(i===256?1:0,1);
  write(0,1);
}
test("D1 fallback accepts legal single EOB tree and unused empty distance tree",()=>{
  const framed=deflateFrame(write=>emptyDynamic(write));
  assert.deepEqual(gunzipSync(framed),Buffer.alloc(0));assert.equal(inflateGzipBounded(framed,8192).length,0);
});
test("D1 fallback rejects incomplete code-length tree and stored LEN/NLEN mismatch",async()=>{
  const dynamic=deflateFrame(write=>emptyDynamic(write,true));
  const stored=deflateFrame(write=>{write(1,1);write(0,2);write(0,5);write(1,16);write(0,16);write(65,8);},Buffer.from("A"));
  for(const framed of [dynamic,stored]) {
    assert.throws(()=>gunzipSync(framed));assert.throws(()=>inflateGzipBounded(framed,8192));
    assertCode(await fallback(token(framed)),"invalid-compressed-stream");
  }
});
