import { tapPainted } from '../../../tests/support/cover.mjs';
export async function prepare(page) { await tapPainted(page, /^Easy$/); }
export const settleMs = 300;
