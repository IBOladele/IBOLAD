import { describe, expect, it } from 'vitest';
import { createUserSchema } from './index';

describe('createUserSchema', () => {
  it('accepts valid payloads', () => {
    const parsed = createUserSchema.safeParse({
      name: 'Linus Torvalds',
      email: 'linus@example.com',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects invalid payloads', () => {
    const parsed = createUserSchema.safeParse({
      name: '',
      email: 'not-an-email',
    });

    expect(parsed.success).toBe(false);
  });
});
