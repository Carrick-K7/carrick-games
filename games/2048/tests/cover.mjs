import { pressSequence } from '../../../tests/support/cover.mjs';
export async function prepare(page) { await pressSequence(page, Array.from({ length: 28 }, (_, i) => ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown'][i % 4]), 120); }
