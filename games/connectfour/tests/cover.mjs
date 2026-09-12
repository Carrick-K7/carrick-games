import { pressSequence } from '../../../tests/support/cover.mjs';
export async function prepare(page) { await pressSequence(page, ['4','3','5','3'], 800); }
