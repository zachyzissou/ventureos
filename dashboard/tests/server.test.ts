import { describe, it, expect } from 'vitest';
import { PORT } from '../server/server.js';

describe('dashboard scaffold', () => {
  it('exports a default port', () => {
    expect(PORT).toBe(8001);
  });
});
