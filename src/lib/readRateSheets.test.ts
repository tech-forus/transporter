import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tryParse: vi.fn(), run: vi.fn(), parseOut: vi.fn(), rows: vi.fn() }));
vi.mock('./clientExcelParser', () => ({ tryParseExcelClientSide: h.tryParse, readWorkbookRows: h.rows }));
vi.mock('./standaloneUtsfExtraction', async (orig) => ({ ...(await orig<typeof import('./standaloneUtsfExtraction')>()), runUtsfExtraction: h.run, parseUtsfOutput: h.parseOut }));
import { readRateSheets } from './readRateSheets';

const file = (name: string, size = 100) => new File([new Uint8Array(size)], name);
const result = (tag: string) => ({ tag }) as never;

beforeEach(() => { h.tryParse.mockReset(); h.run.mockReset(); h.parseOut.mockReset(); h.rows.mockReset(); h.rows.mockResolvedValue([[['Charge', 'Value'], ['Docket', 50]]]); });

describe('readRateSheets (the sign-up readers, reused for an updated sheet)', () => {
  it('reads a plain Excel in the browser when the account already has its zones: no server call', async () => {
    h.tryParse.mockResolvedValue({ handled: true, result: result('local') });
    const out = await readRateSheets([file('rates.xlsx')], ['N1', 'W1'], 'Acme');
    expect(out.sheets).toEqual([result('local')]);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('sends a PDF or photo, and an Excel it could not read, to the document processor', async () => {
    h.tryParse.mockResolvedValue({ handled: false });
    h.run.mockResolvedValue({ utsf: true });
    h.parseOut.mockReturnValue(result('server'));
    const out = await readRateSheets([file('card.pdf'), file('odd.xlsx')], ['N1', 'W1'], 'Acme');
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.run.mock.calls[0][0].map((i: { file: File }) => i.file.name)).toEqual(['card.pdf', 'odd.xlsx']);
    expect(out.sheets).toEqual([result('server')]);
  });

  it('refuses too many files, a file that is too big, and a type it cannot read, before anything is sent', async () => {
    await expect(readRateSheets(Array.from({ length: 6 }, (_, i) => file(`r${i}.xlsx`)), [], 'A')).rejects.toThrow(/up to 5 files at a time/i);
    await expect(readRateSheets([file('big.xlsx', 11 * 1024 * 1024)], [], 'A')).rejects.toThrow(/10 MB/i);
    await expect(readRateSheets([file('virus.exe')], [], 'A')).rejects.toThrow(/can't open .exe files/i);
    expect(h.run).not.toHaveBeenCalled();
    expect(h.tryParse).not.toHaveBeenCalled();
  });

  it('says so when nothing could be read', async () => {
    h.tryParse.mockResolvedValue({ handled: false });
    h.run.mockRejectedValue(new Error('processor down'));
    await expect(readRateSheets([file('a.xlsx')], ['N1', 'W1'], 'A')).rejects.toThrow(/could not read your files/i);
  });

  it('reads a "delivery pincode + price" Excel right in the browser, with no server call and no waiting', async () => {
    h.rows.mockResolvedValue([[['PINCODE', 'Zone', 'ODA', 'Unit Price'], [110001, 'N1', 'No', 7.5], [400001, 'W1', 'Yes', 11.3]]]);
    h.tryParse.mockResolvedValue({ handled: false });
    const out = await readRateSheets([file('Delivery pin and price.xlsx')], ['N1', 'N2'], 'Acme');
    expect(out.pincodePrices).toHaveLength(1);
    expect(out.pincodePrices[0].destinationPrices).toEqual({ N1: 7.5, W1: 11.3 });
    expect(out.sheets).toEqual([]);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('a pincode + price sheet is not an error just because the usual readers found no charges in it', async () => {
    h.rows.mockResolvedValue([[['pincode', 'zone', 'price'], [110001, 'N1', 8]]]);
    h.tryParse.mockResolvedValue({ handled: false });
    await expect(readRateSheets([file('p.csv')], [], 'A')).resolves.toMatchObject({ sheets: [] });
  });
});
