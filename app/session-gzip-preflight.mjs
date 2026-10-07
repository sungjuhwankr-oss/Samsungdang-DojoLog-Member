// Session Share byte transport only (RFC 1951/1952), not a general gzip API.
// Preflight counts output without allocating it. The fallback reuses the same
// walk with an exact, preflight-bounded output buffer; no growing output/dictionary.
export class GzipFrameError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const invalid = () => { throw new GzipFrameError('invalid-compressed-stream'); };
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function huffman(lengths, kind = "codes") {
  const counts = Array(16).fill(0), next = Array(16).fill(0), table = new Map();
  for (const length of lengths) { if (length < 0 || length > 15) invalid(); if (length) counts[length]++; }
  let available = 1, code = 0, max = 0;
  for (let length = 1; length <= 15; length++) {
    available = available * 2 - counts[length];
    if (available < 0) invalid();
    code = (code + counts[length - 1]) * 2;
    next[length] = code;
    if (counts[length]) max = length;
  }
  // Match native/zlib validity: complete code-length trees; literal/distance
  // trees may use a single one-bit symbol. An unused empty distance tree is legal.
  if (available > 0 && !(kind !== "codes" && max === 1) && !(kind === "distance" && max === 0)) invalid();
  lengths.forEach((length, symbol) => {
    if (length) table.set(length * 65536 + next[length]++, symbol);
  });
  return {table, max};
}
const fixedLiteral = huffman(Array.from({length:288}, (_, i) => i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));
const fixedDistance = huffman(Array(32).fill(5));
const codeLengthOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
const lengthBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const lengthExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const distanceBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const distanceExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

function walkGzip(bytes, limit, output = null) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8 || (bytes[3] & 224)) invalid();
  const end = bytes.length - 8;
  const trailer = new DataView(bytes.buffer, bytes.byteOffset + end, 8);
  const declaredSize = trailer.getUint32(4, true);
  if (declaredSize > limit) throw new GzipFrameError('inflated-too-large');
  let start = 10;
  const flags = bytes[3];
  if (flags & 4) {
    if (start + 2 > end) invalid();
    const length = bytes[start] | (bytes[start + 1] << 8); start += 2 + length;
    if (start > end) invalid();
  }
  for (const flag of [8,16]) {
    if (flags & flag) {
      while (start < end && bytes[start] !== 0) start++;
      if (start >= end) invalid(); start++;
    }
  }
  if (flags & 2) {
    if (start + 2 > end || (crc32(bytes.subarray(0,start)) & 65535) !== (bytes[start] | (bytes[start+1] << 8))) invalid();
    start += 2;
  }
  if (start >= end) invalid();
  let position = start * 8, size = 0;
  function bits(count) {
    if (position + count > end * 8) invalid();
    let value = 0;
    for (let i = 0; i < count; i++, position++) value |= ((bytes[position >>> 3] >>> (position & 7)) & 1) << i;
    return value;
  }
  function symbol(tree) {
    let code = 0;
    for (let length = 1; length <= tree.max; length++) {
      code = code * 2 + bits(1);
      const value = tree.table.get(length * 65536 + code);
      if (value !== undefined) return value;
    }
    invalid();
  }
  function add(count) {
    size += count;
    if (size > limit) throw new GzipFrameError('inflated-too-large');
    if (output && size > output.length) invalid();
  }
  let final;
  do {
    final = bits(1); const type = bits(2);
    if (type === 0) {
      position = Math.ceil(position / 8) * 8;
      const length = bits(16), inverse = bits(16);
      if ((length ^ inverse) !== 65535 || position + length * 8 > end * 8) invalid();
      add(length);
      if (output) output.set(bytes.subarray(position >>> 3, (position >>> 3) + length), size - length);
      position += length * 8; continue;
    }
    if (type === 3) invalid();
    let literalTree = fixedLiteral, distanceTree = fixedDistance;
    if (type === 2) {
      const literalCount = bits(5) + 257, distanceCount = bits(5) + 1, codeCount = bits(4) + 4;
      if (literalCount > 286 || distanceCount > 30) invalid();
      const codeLengths = Array(19).fill(0);
      for (let i = 0; i < codeCount; i++) codeLengths[codeLengthOrder[i]] = bits(3);
      const codeTree = huffman(codeLengths), lengths = [];
      while (lengths.length < literalCount + distanceCount) {
        const value = symbol(codeTree);
        if (value <= 15) lengths.push(value);
        else {
          let repeated = 0, count;
          if (value === 16) { if (!lengths.length) invalid(); repeated = lengths.at(-1); count = bits(2) + 3; }
          else if (value === 17) count = bits(3) + 3;
          else if (value === 18) count = bits(7) + 11;
          else invalid();
          if (lengths.length + count > literalCount + distanceCount) invalid();
          for (let i = 0; i < count; i++) lengths.push(repeated);
        }
      }
      if (lengths[256] === 0) invalid();
      literalTree = huffman(lengths.slice(0, literalCount), "literal");
      distanceTree = huffman(lengths.slice(literalCount), "distance");
    }
    while (true) {
      const value = symbol(literalTree);
      if (value < 256) { add(1); if (output) output[size - 1] = value; continue; }
      if (value === 256) break;
      if (value > 285) invalid();
      const lengthIndex = value - 257;
      const length = lengthBase[lengthIndex] + bits(lengthExtra[lengthIndex]);
      const distanceIndex = symbol(distanceTree);
      if (distanceIndex > 29) invalid();
      const distance = distanceBase[distanceIndex] + bits(distanceExtra[distanceIndex]);
      if (distance > size) invalid();
      const start = size;
      add(length);
      // Forward copy is required: an LZ77 match may overlap its own output.
      if (output) for (let index = start; index < size; index++) output[index] = output[index - distance];
    }
  } while (!final);
  if (Math.ceil(position / 8) !== end || size !== declaredSize) invalid();
  return {inflatedBytes:size, checksum:trailer.getUint32(0,true)};
}

export function preflightGzip(bytes, limit) { return walkGzip(bytes, limit); }
export function inflateGzipBounded(bytes, limit) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 12_285 ||
      !Number.isSafeInteger(limit) || limit < 0 || limit > 8_192) invalid();
  const frame = preflightGzip(bytes, limit);
  const output = new Uint8Array(frame.inflatedBytes);
  walkGzip(bytes, limit, output);
  if (crc32(output) !== frame.checksum) invalid();
  return output;
}
