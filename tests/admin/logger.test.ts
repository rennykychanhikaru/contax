import { describe, expect, it, vi } from 'vitest';
import { log } from '@/lib/utils/logger';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('logger', () => {
  it('logs info with structured context', () => {
    log.info('test message', { action: 'unit', userId: '123' });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('test message'));
  });
});
