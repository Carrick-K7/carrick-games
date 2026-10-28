import { BinaryReader, RA2_LIMITS, fail } from './binary.js';

/** Independently implemented LZO1X v0 instruction decoder. Format facts:
 * https://www.kernel.org/doc/html/latest/staging/lzo.html
 * No miniLZO/Linux library implementation is included. LZO-RLE v1 is not supported.
 * Requires the exact expected size and EOF marker; rejects unconsumed input.
 */
export function decodeLzo1x(bytes: Uint8Array, expectedSize: number): Uint8Array {
  const reader = new BinaryReader(bytes, 'LZO1X', RA2_LIMITS.maxLzoInputBytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) fail('LZO1X', 'INVALID_INPUT', 'Expected size must be a nonnegative integer');
  if (expectedSize > RA2_LIMITS.maxLzoOutputBytes) fail('LZO1X', 'LIMIT_EXCEEDED', 'LZO output limit exceeded');
  const output = new Uint8Array(expectedSize);
  let input = 0, written = 0, state = 0;
  const byte = (): number => { reader.range(input, 1); return bytes[input++]; };
  const word = (): number => { const lo = byte(); return lo | (byte() << 8); };
  const reserve = (count: number): void => {
    if (count > expectedSize - written) fail('LZO1X', 'INVALID_FORMAT', 'Instruction exceeds declared output size', input);
  };
  const literals = (count: number): void => {
    reserve(count);
    reader.range(input, count);
    output.set(bytes.subarray(input, input + count), written);
    input += count; written += count;
  };
  const match = (distance: number, count: number): void => {
    if (distance <= 0 || distance > written) fail('LZO1X', 'INVALID_OFFSET', 'LZO lookbehind is outside produced output', input);
    reserve(count);
    // Forward copying is essential: LZO matches may overlap their own growing output.
    for (let i = 0; i < count; i++) { output[written] = output[written - distance]; written++; }
  };
  const length = (encoded: number, mask: number, base: number): number => {
    let count = encoded;
    if (count === 0) {
      count = mask;
      let next = byte();
      while (next === 0) {
        count += 255;
        if (count + base > expectedSize - written) fail('LZO1X', 'INVALID_FORMAT', 'LZO extended length exceeds output budget', input - 1);
        next = byte();
      }
      count += next;
    }
    return count + base;
  };
  const first = byte();
  if (first === 17 && bytes.length >= 5) fail('LZO1X', 'UNSUPPORTED', 'Version-prefixed LZO-RLE streams are not supported', 0);
  if (first > 17) {
    const count = first - 17;
    literals(count);
    state = Math.min(count, 4);
  } else input = 0;
  for (;;) {
    const opcode = byte();
    let distance: number, count: number, tail: number;
    if (opcode < 16) {
      if (state === 0) {
        literals(length(opcode, 15, 3));
        state = 4;
        continue;
      }
      distance = (byte() << 2) + (opcode >>> 2) + (state === 4 ? 2049 : 1);
      count = state === 4 ? 3 : 2;
      tail = opcode & 3;
    } else if (opcode < 32) {
      count = length(opcode & 7, 7, 2);
      const operand = word();
      const far = (opcode & 8) << 11;
      const lowDistance = operand >>> 2;
      if (far === 0 && lowDistance === 0) {
        if (count !== 3 || (operand & 3) !== 0) fail('LZO1X', 'INVALID_FORMAT', 'Invalid end-of-stream marker', input - 3);
        if (written !== expectedSize) fail('LZO1X', 'INVALID_FORMAT', 'LZO output does not match declared size', input);
        if (input !== bytes.length) fail('LZO1X', 'INVALID_FORMAT', 'Trailing bytes after LZO end marker', input);
        return output;
      }
      distance = 16384 + far + lowDistance;
      tail = operand & 3;
    } else if (opcode < 64) {
      count = length(opcode & 31, 31, 2);
      const operand = word();
      distance = 1 + (operand >>> 2);
      tail = operand & 3;
    } else {
      count = (opcode >>> 5) + 1;
      distance = 1 + ((opcode >>> 2) & 7) + (byte() << 3);
      tail = opcode & 3;
    }
    match(distance, count);
    literals(tail);
    state = tail;
  }
}
