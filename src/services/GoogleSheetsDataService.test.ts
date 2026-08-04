import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsDataService } from './GoogleSheetsDataService';

describe('servicio remoto', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reintenta cuando Apps Script devuelve un error HTTP temporal', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { token: 'token', expiresAt: 123, role: 'staff' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const pending = new GoogleSheetsDataService('https://example.test/exec').authenticate('2627', 'staff');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ role: 'staff' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
