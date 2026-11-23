// Reads uploaded rate documents with the SAME readers the sign-up uses (AddPrice.tsx): a plain Excel/CSV is read in the browser when the
// account already has its zones to match against; PDFs, photos, and anything the browser could not read go to the document processor.
import { tryParseExcelClientSide, readWorkbookRows } from './clientExcelParser';
import { parsePincodePriceRows, type PincodePriceSheet } from './pincodePriceSheet';
import {
  ACCEPTED_EXTENSIONS, MAX_UPLOAD_FILES, MAX_FILE_SIZE, guessCategory, runUtsfExtraction, parseUtsfOutput,
  type ParsedUtsfResult, type UploadItem,
} from './standaloneUtsfExtraction';

const EXCEL = new Set(['.xlsx', '.xls', '.csv']);
const extOf = (name: string) => `.${name.split('.').pop() || ''}`.toLowerCase();

export interface RateSheetsRead {
  /** Charges / zone-matrix sheets (the sign-up readers). */
  sheets: ParsedUtsfResult[];
  /** "Delivery pincode + price" sheets, read in the browser with no waiting. */
  pincodePrices: PincodePriceSheet[];
}

export async function readRateSheets(files: File[], zoneLabels: string[], companyName: string, onLog: (line: string) => void = () => {}): Promise<RateSheetsRead> {
  if (files.length > MAX_UPLOAD_FILES) throw new Error(`You can upload up to ${MAX_UPLOAD_FILES} files at a time.`);
  for (const f of files) {
    if (!ACCEPTED_EXTENSIONS.has(extOf(f.name))) throw new Error(`We can't open ${extOf(f.name)} files. Please upload an Excel, CSV, PDF or a photo.`);
    if (f.size > MAX_FILE_SIZE) throw new Error(`"${f.name}" is bigger than ${MAX_FILE_SIZE / 1024 / 1024} MB. Please use a smaller file.`);
  }

  const results: ParsedUtsfResult[] = [];
  const pincodePrices: PincodePriceSheet[] = [];
  const toServer: UploadItem[] = [];
  for (const [i, file] of files.entries()) {
    const item: UploadItem = { file, id: `${Date.now()}-${i}`, category: guessCategory(file.name) };
    if (!EXCEL.has(extOf(file.name))) { toServer.push(item); continue; }
    onLog(`[INFO] Checking "${file.name}" in your browser...`);
    // A pincode + price list is read here and now: no document processor, no waiting.
    let pincodeSheets: PincodePriceSheet[] = [];
    try { pincodeSheets = (await readWorkbookRows(file)).map(parsePincodePriceRows).filter((x): x is PincodePriceSheet => !!x); } catch { /* not a readable workbook: the usual readers decide */ }
    if (pincodeSheets.length) { pincodePrices.push(...pincodeSheets); continue; }
    const outcome = await tryParseExcelClientSide(file, zoneLabels);
    // The browser can only match zones the account already has, so without at least two the server reads it too.
    if (outcome.handled && outcome.result && zoneLabels.length >= 2) results.push(outcome.result);
    else toServer.push(item);
  }
  if (toServer.length) {
    try { results.push(parseUtsfOutput(await runUtsfExtraction(toServer, companyName || 'transporter', onLog))); }
    catch { throw new Error('We could not read your files. Please try again.'); }
  }
  if (!results.length && !pincodePrices.length) throw new Error('We could not read your files. Please try again.');
  return { sheets: results, pincodePrices };
}
