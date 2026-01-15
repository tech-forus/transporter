import { useState, useCallback } from "react";
import { Upload, Copy, Trash2, AlertCircle, CheckCircle2, X } from "lucide-react";
import toast from "react-hot-toast";

interface ZoneRateMatrixProps {
  zoneLabels: string[];
  zoneRates: number[][];
  onRatesChange: (rates: number[][]) => void;
}

export default function ZoneRateMatrix({ zoneLabels, zoneRates, onRatesChange }: ZoneRateMatrixProps) {
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pastePreview, setPastePreview] = useState<number[][] | null>(null);

  const handleCellChange = (i: number, j: number, val: number) => {
    const next = zoneRates.map(r => [...r]);
    next[i][j] = val;
    onRatesChange(next);
  };

  // Parse pasted data - supports tab-separated (Excel) or comma-separated
  const parsePastedData = useCallback((text: string): { data: number[][], error: string | null } => {
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      return { data: [], error: "No data found" };
    }

    // Detect delimiter (tab or comma)
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const parsedData: number[][] = [];
    let hasHeaders = false;

    // Check if first row/column contains zone labels (headers)
    const firstRowCells = firstLine.split(delimiter).map(c => c.trim());
    const firstCellIsEmpty = firstRowCells[0] === '' || firstRowCells[0].toLowerCase() === 'from' || firstRowCells[0].toLowerCase().includes('to');

    // Check if first row looks like headers (matches zone labels)
    if (firstCellIsEmpty || zoneLabels.some(z => firstRowCells.includes(z))) {
      hasHeaders = true;
    }

    const startRow = hasHeaders ? 1 : 0;

    for (let i = startRow; i < lines.length; i++) {
      const cells = lines[i].split(delimiter).map(c => c.trim());
      const startCol = hasHeaders ? 1 : 0; // Skip first column if it's row headers

      const row: number[] = [];
      for (let j = startCol; j < cells.length; j++) {
        const val = parseFloat(cells[j]);
        if (isNaN(val)) {
          row.push(0);
        } else {
          row.push(val);
        }
      }

      if (row.length > 0) {
        parsedData.push(row);
      }
    }

    // Validate dimensions
    const expectedRows = zoneLabels.length;
    const expectedCols = zoneLabels.length;

    if (parsedData.length !== expectedRows) {
      return {
        data: parsedData,
        error: `Row count mismatch: got ${parsedData.length} rows, expected ${expectedRows} (${zoneLabels.join(', ')})`
      };
    }

    for (let i = 0; i < parsedData.length; i++) {
      if (parsedData[i].length !== expectedCols) {
        return {
          data: parsedData,
          error: `Column count mismatch in row ${i + 1}: got ${parsedData[i].length} columns, expected ${expectedCols}`
        };
      }
    }

    return { data: parsedData, error: null };
  }, [zoneLabels]);

  const handlePasteChange = (text: string) => {
    setPasteData(text);
    if (text.trim()) {
      const { data, error } = parsePastedData(text);
      setPasteError(error);
      setPastePreview(data.length > 0 ? data : null);
    } else {
      setPasteError(null);
      setPastePreview(null);
    }
  };

  const applyBulkPaste = () => {
    if (pastePreview && !pasteError) {
      onRatesChange(pastePreview);
      toast.success("Rates updated successfully!");
      setShowBulkPaste(false);
      setPasteData("");
      setPastePreview(null);
    }
  };

  const clearAllRates = () => {
    const cleared = zoneLabels.map(() => zoneLabels.map(() => 0));
    onRatesChange(cleared);
    toast.success("All rates cleared");
  };

  const copyRatesToClipboard = () => {
    const header = ["From \\ To", ...zoneLabels].join('\t');
    const rows = zoneRates.map((row, i) => [zoneLabels[i], ...row].join('\t'));
    const text = [header, ...rows].join('\n');
    navigator.clipboard.writeText(text);
    toast.success("Rates copied to clipboard");
  };

  if (zoneLabels.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <AlertCircle className="mx-auto mb-2" size={24} />
        <p>No zones configured. Please set up zones first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowBulkPaste(!showBulkPaste)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
            showBulkPaste
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
          }`}
        >
          <Upload size={16} />
          Bulk Paste
        </button>
        <button
          type="button"
          onClick={copyRatesToClipboard}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg font-medium hover:bg-slate-100 transition"
        >
          <Copy size={16} />
          Copy All
        </button>
        <button
          type="button"
          onClick={clearAllRates}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition"
        >
          <Trash2 size={16} />
          Clear All
        </button>
      </div>

      {/* Bulk Paste Panel */}
      {showBulkPaste && (
        <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50/50 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">Bulk Paste Data</h3>
              <p className="text-sm text-slate-600 mt-1">
                Paste your rate matrix directly from Excel or any spreadsheet.
                Supports tab-separated or comma-separated values.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkPaste(false)}
              className="p-1 hover:bg-slate-200 rounded"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>

          <div className="bg-slate-100 rounded-lg p-3 text-sm">
            <p className="font-medium text-slate-700 mb-2">Expected format ({zoneLabels.length}x{zoneLabels.length} matrix):</p>
            <div className="overflow-x-auto">
              <table className="text-xs font-mono">
                <thead>
                  <tr>
                    <td className="px-2 py-1 text-slate-400">From\To</td>
                    {zoneLabels.map(z => (
                      <td key={z} className="px-2 py-1 text-slate-500 font-semibold">{z}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zoneLabels.slice(0, 3).map((from, i) => (
                    <tr key={from}>
                      <td className="px-2 py-1 text-slate-500 font-semibold">{from}</td>
                      {zoneLabels.map((_, j) => (
                        <td key={j} className="px-2 py-1 text-slate-400">XX.XX</td>
                      ))}
                    </tr>
                  ))}
                  {zoneLabels.length > 3 && (
                    <tr>
                      <td className="px-2 py-1 text-slate-400">...</td>
                      {zoneLabels.map((_, j) => (
                        <td key={j} className="px-2 py-1 text-slate-400">...</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-slate-500">
              Headers (zone names) are optional - just paste the numbers if your data doesn't have them.
            </p>
          </div>

          <textarea
            value={pasteData}
            onChange={(e) => handlePasteChange(e.target.value)}
            placeholder="Paste your data here...&#10;&#10;Example (tab-separated):&#10;7.80	9.10	9.50&#10;9.10	9.74	9.40&#10;9.50	9.40	10.79"
            className="w-full h-40 p-3 border border-slate-300 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {pasteError && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Warning</p>
                <p className="text-sm">{pasteError}</p>
              </div>
            </div>
          )}

          {pastePreview && !pasteError && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Preview looks good!</p>
                <p className="text-sm">
                  {pastePreview.length} rows × {pastePreview[0]?.length || 0} columns detected
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyBulkPaste}
              disabled={!pastePreview || !!pasteError}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Apply Data
            </button>
            <button
              type="button"
              onClick={() => {
                setPasteData("");
                setPastePreview(null);
                setPasteError(null);
              }}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Matrix Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 sm:p-3 font-semibold text-slate-600 text-left border-r border-slate-200 sticky left-0 bg-slate-100 z-10 min-w-[60px]">
                From \ To
              </th>
              {zoneLabels.map(label => (
                <th
                  key={label}
                  className="p-2 sm:p-3 text-center font-semibold text-slate-600 min-w-[70px] border-r border-slate-200 last:border-r-0"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {zoneRates.map((row, i) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="p-2 sm:p-3 font-semibold text-slate-700 bg-slate-50 sticky left-0 z-10 border-r border-slate-200">
                  {zoneLabels[i]}
                </td>
                {row.map((val, j) => (
                  <td
                    key={j}
                    className={`p-1 border-r border-slate-100 last:border-r-0 ${
                      i === j ? 'bg-slate-50' : ''
                    }`}
                  >
                    <input
                      type="number"
                      step="0.01"
                      value={val || ''}
                      onChange={(e) => handleCellChange(i, j, e.target.valueAsNumber || 0)}
                      className={`w-full p-2 text-center rounded-md border transition-colors
                        ${val ? 'bg-white border-slate-200' : 'bg-slate-50 border-transparent'}
                        hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none
                        ${i === j ? 'bg-slate-100' : ''}
                      `}
                      style={{ minWidth: '60px' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-sm text-slate-500 flex items-center justify-between">
        <span>
          {zoneLabels.length} zones × {zoneLabels.length} zones = {zoneLabels.length * zoneLabels.length} rate cells
        </span>
        <span>
          {zoneRates.flat().filter(v => v > 0).length} rates configured
        </span>
      </div>
    </div>
  );
}
