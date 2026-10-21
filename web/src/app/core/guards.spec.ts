import { describe, expect, it } from 'vitest';
import { mayLeave } from './guards';

describe('leaving a page with unsaved edits', () => {
  const page = (unsaved: boolean) => ({ hasUnsaved: () => unsaved });

  it('does not ask when nothing is unsaved', () => {
    let asked = false;
    expect(mayLeave(page(false), () => ((asked = true), false))).toBe(true);
    expect(asked).toBe(false);
  });
  it('asks when there are unsaved edits and follows the answer', () => {
    expect(mayLeave(page(true), () => false)).toBe(false);
    expect(mayLeave(page(true), () => true)).toBe(true);
  });
});
