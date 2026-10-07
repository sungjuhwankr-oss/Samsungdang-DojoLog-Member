import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync, gunzipSync, constants } from "node:zlib";
import {
  parseSessionHash, parseSessionHashAsync, MAX_FRAGMENT_LENGTH,
  MAX_DECODED_BYTES, MAX_COMPRESSED_BYTES, MAX_KATA_COUNT
} from "../app/session-share.mjs";
import { crc32, preflightGzip } from "../app/session-gzip-preflight.mjs";
import { validateSessionKataCatalog, KATA_CATALOG_STATUS } from "../app/kata-catalog-validation.mjs";
import { createMemoryTrainingRepository, saveTrainingSession } from "../app/training-records.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/session-share-v1-transport.json", import.meta.url)));
const catalog = JSON.parse(await readFile(new URL("../reference/kata-catalog.v2.json", import.meta.url)));
const kata = catalog.kata.map(k => ({ id: k.id, name: k.nameKo }));
const payload = overrides => ({ ...fixture.payload, ...overrides });
const raw = value => "#session=" + Buffer.from(JSON.stringify(value)).toString("base64url");
const compressedBytes = bytes => "#session=gz1." + Buffer.from(bytes).toString("base64url");
const compressedText = text => compressedBytes(gzipSync(Buffer.from(text)));
const compressed = value => compressedText(JSON.stringify(value));
const assertCode = (result, code) => { assert.equal(result.ok, false); assert.equal(result.code, code); assert.equal(typeof result.message, "string"); };

test("D1 frozen legacy production-format URL retains the historical 1042 payload", async () => {
  assert.deepEqual(parseSessionHash(new URL(fixture.legacyUrl).hash), {ok:true,payload:fixture.payload,warnings:[]});
  assert.deepEqual(await parseSessionHashAsync(new URL(fixture.legacyUrl).hash), parseSessionHash(new URL(fixture.legacyUrl).hash));
});
test("D1 frozen gzip URL round-trips to exactly the same v1 logical payload", async () => {
  assert.deepEqual(await parseSessionHashAsync(new URL(fixture.gzipUrl).hash), parseSessionHash(new URL(fixture.legacyUrl).hash));
});
test("D1 raw/compressed preserve Korean UTF-8, session/date, IDs/names and exact Kata order", async () => {
  const value = payload({sessionNo:Number.MAX_SAFE_INTEGER,date:"2028-02-29",kata:[kata.at(-1),kata[0],kata[20],kata[1]]});
  const rawResult = parseSessionHash(raw(value));
  assert.deepEqual(rawResult.payload, value);
  assert.deepEqual(await parseSessionHashAsync(compressed(value)), rawResult);
});
test("D1 all seven ken and eight jo awase IDs remain individual ordered canonical entries", async () => {
  const awase = kata.filter(k => k.name.includes("아와세"));
  assert.equal(awase.filter(k => k.name.startsWith("검")).length, 7);
  assert.equal(awase.filter(k => k.name.startsWith("장")).length, 8);
  const value = payload({kata:awase.toReversed()});
  assert.deepEqual((await parseSessionHashAsync(compressed(value))).payload, value);
});
test("D1 fifty-entry payload retains the existing semantic maximum", async () => {
  const value = payload({kata:kata.slice(0,MAX_KATA_COUNT)});
  assert.deepEqual(await parseSessionHashAsync(compressed(value)), parseSessionHash(raw(value)));
});
test("D1 97-entry PoC payload is decoded but rejected by the unchanged 50-entry validator", async () => {
  assertCode(await parseSessionHashAsync(compressed(payload({kata}))), "invalid-kata-array");
  assertCode(parseSessionHash(raw(payload({kata}))), "invalid-kata-array");
});
test("D1 unknown ID/name mismatch keep existing warnings and original snapshots", async () => {
  const items=[{id:"future-id",name:kata[0].name},{id:kata[0].id,name:"이전 공유 이름"}];
  const result=await parseSessionHashAsync(compressed(payload({kata:items})));
  assert.equal(result.ok,true); assert.deepEqual(result.payload.kata,items);
  assert.deepEqual(validateSessionKataCatalog(items,catalog).map(k=>k.status), [KATA_CATALOG_STATUS.UNKNOWN_ID,KATA_CATALOG_STATUS.KNOWN_ID_NAME_MISMATCH]);
});
test("D1 raw acceptance including legacy noncanonical pad bits is unchanged", async () => {
  const text=JSON.stringify(fixture.payload); let bytes=Buffer.from(text);
  while(bytes.length%3!==1) bytes=Buffer.concat([bytes,Buffer.from(" ")]);
  const canonical=bytes.toString("base64url"), alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const alias=canonical.slice(0,-1)+alphabet[alphabet.indexOf(canonical.at(-1))+1];
  assert.equal(parseSessionHash("#session="+alias).ok,true);
  assert.deepEqual(await parseSessionHashAsync("#session="+alias),parseSessionHash("#session="+alias));
});
for(const [label,hash,code] of [
  ["missing","","no-session"], ["empty","#session=","no-session"],
  ["query-only","?session=gz1.AA","no-session"], ["wrong-key","#bundle=gz1.AA","no-session"],
  ["unknown prefix","#session=gz2.AA","unsupported-transport"],
  ["prefix embedded in raw","#session=AAAA.gz1.AA","unsupported-transport"],
  ["empty compressed token","#session=gz1.","invalid-base64url"],
  ["padding","#session=gz1.AA==","invalid-base64url"],
  ["whitespace","#session=gz1.A A","invalid-base64url"],
  ["standard alphabet","#session=gz1.+/","invalid-base64url"],
  ["impossible length","#session=gz1.A","invalid-base64url"],
  ["noncanonical pad bits","#session=gz1.AB","invalid-base64url"],
  ["percent encoding","#session=gz1.%41%41","invalid-base64url"],
  ["duplicate session","#session=gz1.AA&session=AA","invalid-base64url"],
  ["nested prefix","#session=gz1.gz1.AA","invalid-base64url"],
  ["non-gzip bytes",compressedBytes([0,1,2,3]),"invalid-compressed-stream"]
]) test("D1 rejects "+label, async()=>assertCode(await parseSessionHashAsync(hash),code));

const goodGzip=gzipSync(Buffer.from(JSON.stringify(fixture.payload)));
function changed(bytes,offset,value) {const copy=Buffer.from(bytes);copy[offset]=value;return copy;}
for(const [label,bytes] of [
  ["wrong gzip method",changed(goodGzip,2,0)], ["reserved gzip flags",changed(goodGzip,3,224)],
  ["checksum mismatch",changed(goodGzip,goodGzip.length-8,goodGzip.at(-8)^1)],
  ["trailing byte",Buffer.concat([goodGzip,Buffer.from([0])])],
  ["concatenated members",Buffer.concat([goodGzip,goodGzip])],
  ["empty prefix member",Buffer.concat([gzipSync(Buffer.alloc(0)),goodGzip])],
  ["empty suffix member",Buffer.concat([goodGzip,gzipSync(Buffer.alloc(0))])],
  ["reserved DEFLATE block",Buffer.from([31,139,8,0,0,0,0,0,0,3,7,0,0,0,0,0,0,0,0])]
]) test("D1 rejects "+label,async()=>assertCode(await parseSessionHashAsync(compressedBytes(bytes)),"invalid-compressed-stream"));
test("D1 rejects every truncated prefix of a valid gzip stream",async()=>{
  for(let i=0;i<goodGzip.length;i++) assert.equal((await parseSessionHashAsync(compressedBytes(goodGzip.subarray(0,i)))).ok,false,`cut ${i}`);
});
test("D1 encoded token cap rejects before decoding",async()=>{
  assertCode(await parseSessionHashAsync("#session=gz1."+"A".repeat(MAX_FRAGMENT_LENGTH-3)),"fragment-too-long");
});
test("D1 exact 16384-character token / 12285 compressed-byte boundary is accepted",async()=>{
  const header=Buffer.from(goodGzip.subarray(0,10));header[3]=4;
  const extraSize=MAX_COMPRESSED_BYTES-goodGzip.length-2, length=Buffer.alloc(2);length.writeUInt16LE(extraSize);
  const bytes=Buffer.concat([header,length,Buffer.alloc(extraSize),goodGzip.subarray(10)]);
  const hash=compressedBytes(bytes);
  assert.equal(hash.slice(9).length,MAX_FRAGMENT_LENGTH);
  assert.deepEqual((await parseSessionHashAsync(hash)).payload,fixture.payload);
  assertCode(await parseSessionHashAsync(compressedBytes(Buffer.concat([bytes,Buffer.from([0])]))),"fragment-too-long");
});
test("D1 exact 8192-byte inflated boundary is accepted; 8193 is rejected",async()=>{
  const text=JSON.stringify(fixture.payload), length=Buffer.byteLength(text);
  assert.deepEqual((await parseSessionHashAsync(compressedText(text+" ".repeat(MAX_DECODED_BYTES-length)))).payload,fixture.payload);
  assertCode(await parseSessionHashAsync(compressedText(text+" ".repeat(MAX_DECODED_BYTES-length+1))),"inflated-too-large");
});
test("D1 honest and forged 2 MiB bombs never reach native decompression",async()=>{
  const Native=globalThis.DecompressionStream;let calls=0;
  globalThis.DecompressionStream=class extends Native {constructor(...args){super(...args);calls++;}};
  try {
    const bomb=gzipSync(Buffer.alloc(2*1024*1024,65));
    assertCode(await parseSessionHashAsync(compressedBytes(bomb)),"inflated-too-large");
    bomb.writeUInt32LE(MAX_DECODED_BYTES,bomb.length-4);
    assertCode(await parseSessionHashAsync(compressedBytes(bomb)),"inflated-too-large");
    assert.equal(calls,0);
  } finally {globalThis.DecompressionStream=Native;}
});
test("D1 unavailable native API falls back while raw remains available",async()=>{
  const Native=globalThis.DecompressionStream;globalThis.DecompressionStream=undefined;
  try {assert.deepEqual((await parseSessionHashAsync(new URL(fixture.gzipUrl).hash)).payload,fixture.payload);assert.equal((await parseSessionHashAsync(new URL(fixture.legacyUrl).hash)).ok,true);}
  finally {globalThis.DecompressionStream=Native;}
});
test("D1 unsupported native constructor safely selects fallback",async()=>{
  const Native=globalThis.DecompressionStream;
  globalThis.DecompressionStream=class {constructor(){throw Error("failure");}};
  try {assert.deepEqual((await parseSessionHashAsync(new URL(fixture.gzipUrl).hash)).payload,fixture.payload);}
  finally {globalThis.DecompressionStream=Native;}
});
test("D1 rejects invalid UTF-8 after successful decompression",async()=>assertCode(await parseSessionHashAsync(compressedBytes(gzipSync(Buffer.from([195,40])))),"invalid-utf8"));
test("D1 rejects invalid JSON after successful decompression",async()=>assertCode(await parseSessionHashAsync(compressedText("{broken")),"invalid-json"));
for(const [label,overrides,code] of [
  ["schema",{schema:"wrong"},"invalid-schema"], ["version",{version:2},"unsupported-version"],
  ["dojo",{dojo:"other"},"invalid-dojo"], ["session",{sessionNo:0},"invalid-session-no"],
  ["unsafe session",{sessionNo:Number.MAX_SAFE_INTEGER+1},"invalid-session-no"],
  ["date",{date:"2026-02-30"},"invalid-date"], ["empty kata",{kata:[]},"invalid-kata-array"],
  ["51 kata",{kata:[...kata.slice(0,50),kata[50]]},"invalid-kata-array"],
  ["kata id",{kata:[{id:"",name:"이름"}]},"invalid-kata-item"],
  ["kata length",{kata:[{id:"x",name:"가".repeat(201)}]},"invalid-kata-item"]
]) test("D1 compressed semantic rejection reuses raw validator: "+label,async()=>{
  assertCode(await parseSessionHashAsync(compressed(payload(overrides))),code);
  assert.deepEqual(await parseSessionHashAsync(compressed(payload(overrides))),parseSessionHash(raw(payload(overrides))));
});
test("D1 preview and errors never access storage or mutate the repository",async()=>{
  const repository=createMemoryTrainingRepository();let accesses=0;
  Object.defineProperty(globalThis,"indexedDB",{configurable:true,get(){accesses++;throw Error("storage access before confirm");}});
  try {
    await parseSessionHashAsync(new URL(fixture.gzipUrl).hash);
    await parseSessionHashAsync("#session=gz1.AA");
    assert.deepEqual(await repository.list(),[]);assert.equal(accesses,0);
  } finally {delete globalThis.indexedDB;}
});
test("D1 raw/compressed duplicates and date conflicts use unchanged storage semantics",async()=>{
  const repository=createMemoryTrainingRepository();
  const first=await parseSessionHashAsync(compressed(fixture.payload));
  assert.equal((await saveTrainingSession(repository,first.payload,"2026-10-07T00:00:00Z")).status,"saved");
  const before=await repository.list();
  assert.equal((await saveTrainingSession(repository,parseSessionHash(raw(fixture.payload)).payload,"2026-10-07T00:01:00Z")).status,"duplicate");
  const conflict=await parseSessionHashAsync(compressed(payload({date:"2026-09-14"})));
  assert.equal((await saveTrainingSession(repository,conflict.payload,"2026-10-07T00:02:00Z")).status,"conflict");
  assert.deepEqual(await repository.list(),before);
});
test("D1 asynchronous UI hides old save actions and ignores discarded hash results",async()=>{
  const source=await readFile(new URL("../app/components/fragment-probe.tsx",import.meta.url),"utf8");
  assert.match(source,/if \(active\) setDecoded\(\{ hash, result \}\)/);
  assert.match(source,/return \(\) => \{ active = false; \}/);
  assert.match(source,/decoded\.hash !== hash/);
  assert.equal(source.indexOf("decoded.hash !== hash")<source.indexOf("<ValidSessionPreview"),true);
  assert.match(source,/onClick=\{handleSave\}/);
});
test("D1 preflight handles 192 deterministic stored/fixed/dynamic boundary vectors without inflation",()=>{
  let seed=12345,count=0;
  for(const length of [0,1,10,100,1000,8192,8193,65536]) for(const level of [0,1,6,9]) for(const strategy of [constants.Z_DEFAULT_STRATEGY,constants.Z_FIXED,constants.Z_HUFFMAN_ONLY]) {
    const random=Buffer.alloc(length);for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;random[i]=seed>>>24;}
    for(const input of [Buffer.alloc(length,65),random]) {
      const bytes=gzipSync(input,{level,strategy});
      if(length>MAX_DECODED_BYTES) assert.throws(()=>preflightGzip(bytes,MAX_DECODED_BYTES),e=>e.code==="inflated-too-large");
      else assert.deepEqual(preflightGzip(bytes,MAX_DECODED_BYTES),{inflatedBytes:length,checksum:crc32(input)});
      count++;
    }
  }
  assert.equal(count,192);
});
test("D1 optional gzip headers and header CRC are validated within the token bound",async()=>{
  const header=Buffer.from(goodGzip.subarray(0,10));header[3]=2|4|8|16;
  const extra=Buffer.from([3,0,1,2,3]), name=Buffer.from("session.json\0"), comment=Buffer.from("test\0");
  const prefix=Buffer.concat([header,extra,name,comment]), checksum=Buffer.alloc(2);
  checksum.writeUInt16LE(crc32(prefix)&65535);
  const bytes=Buffer.concat([prefix,checksum,goodGzip.subarray(10)]);
  assert.deepEqual((await parseSessionHashAsync(compressedBytes(bytes))).payload,fixture.payload);
  bytes[prefix.length]^=1;
  assertCode(await parseSessionHashAsync(compressedBytes(bytes)),"invalid-compressed-stream");
  for(const flags of [4,8,16,2]) {
    const bad=Buffer.from([31,139,8,flags,0,0,0,0,0,3,255,255,255,255,255,255,255,255,0,0,0,0,0,0,0,0]);
    assertCode(await parseSessionHashAsync(compressedBytes(bad)),"invalid-compressed-stream");
  }
});
test("D1 structural preflight agrees with bounded zlib on 1000 corrupted stream vectors",()=>{
  let seed=4567,accepted=0;
  const source=gzipSync(Buffer.from(JSON.stringify(payload({kata:kata.slice(0,50)}))));
  for(let i=0;i<1000;i++) {
    const bytes=Buffer.from(source);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const position=10+seed%(bytes.length-18);bytes[position]^=1<<(seed%8);
    let frame;try {frame=preflightGzip(bytes,MAX_DECODED_BYTES);} catch {continue;}
    let output;try {output=gunzipSync(bytes,{maxOutputLength:MAX_DECODED_BYTES});} catch {continue;}
    assert.equal(frame.inflatedBytes,output.length);assert.ok(output.length<=MAX_DECODED_BYTES);accepted++;
  }
  assert.ok(accepted>0);
});
