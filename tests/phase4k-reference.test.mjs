import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';

const read=name=>readFileSync(new URL(`../reference/${name}`,import.meta.url));
test('Phase 4K-A shared reference bytes match the approved generated artifacts',()=>{
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash(read('kata-catalog.v2.json')),'77931dd1303a526fc31bd2fef1d910ca319f9ea70f4eb56a03040e832a84c629');
 assert.equal(hash(read('beginner-videos.v1.json')),'0420880d90728692539fa8069838128a0ceb4029b5ae523623ab1d15c95ee361');
});
test('v2 reference preserves v1 identities and exact catalog/exam/video counts',()=>{
 const old=JSON.parse(read('kata-catalog.v1.json')),current=JSON.parse(read('kata-catalog.v2.json'));
 const kata=current.kata;assert.equal(current.catalogVersion,2);assert.equal(kata.length,97);assert.equal(new Set(kata.map(k=>k.id)).size,97);
 assert.deepEqual(kata.slice(0,77).map(k=>[k.id,k.nameKo]),old.kata.map(k=>[k.id,k.nameKo]));
 assert.equal(kata.filter(k=>k.examEntries.length).length,79);assert.equal(kata.filter(k=>k.examEntries.some(e=>e.track==='kyu')).length,77);assert.equal(kata.filter(k=>k.examEntries.some(e=>e.track==='dan')).length,2);
 assert.equal(kata.filter(k=>k.links.length).length,79);assert.equal(kata.reduce((n,k)=>n+k.links.length,0),113);
 assert.ok(kata.filter(k=>k.nameKo.includes('아와세')).every(k=>k.links.length===0));
 assert.equal(JSON.parse(read('beginner-videos.v1.json')).videos.length,53);
});
