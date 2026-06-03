import { useState, useCallback, useRef, KeyboardEvent } from "react";
import { Upload, Copy, Trash2, AlertCircle, CheckCircle2, X, Plus } from "lucide-react";
import toast from "react-hot-toast";

interface ZoneRateMatrixProps {
  zoneLabels: string[];
  zoneRates: number[][];
  onRatesChange: (rates: number[][]) => void;
  onZoneLabelsChange?: (labels: string[]) => void;
}

export default function ZoneRateMatrix({ zoneLabels, zoneRates, onRatesChange, onZoneLabelsChange }: ZoneRateMatrixProps) {
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pastePreview, setPastePreview] = useState<number[][] | null>(null);
  const [newZoneName, setNewZoneName] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const handleCellChange = (i: number, j: number, val: number) => {
    const next = zoneRates.map(r => [...r]);
    next[i][j] = val;
    onRatesChange(next);
  };

  const handleKeyDown = (i: number, j: number, e: KeyboardEvent<HTMLInputElement>) => {
    const rows = zoneLabels.length;
    const cols = zoneLabels.length;

    let nextI = i;
    let nextJ = j;

    switch (e.key) {
      case 'ArrowUp':
        nextI = Math.max(0, i - 1);
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'Enter':
        nextI = Math.min(rows - 1, i + 1);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if ((e.target as HTMLInputElement).selectionStart === 0) {
          nextJ = Math.max(0, j - 1);
          e.preventDefault();
        }
        break;
      case 'ArrowRight':
        if ((e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) {
          nextJ = Math.min(cols - 1, j + 1);
          e.preventDefault();
        }
        break;
      default:
        return;
    }

    if (inputRefs.current[nextI]?.[nextJ]) {
      inputRefs.current[nextI][nextJ]?.focus();
      inputRefs.current[nextI][nextJ]?.select();
    }
  };

  const parsePastedData = useCallback((text: string): { data: number[][], error: string | null } => {
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      return { data: [], error: "No data found" };
    }

    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const parsedData: number[][] = [];
    let hasHeaders = false;

    const firstRowCells = firstLine.split(delimiter).map(c => c.trim());
    const firstCellIsEmpty = firstRowCells[0] === '' || firstRowCells[0].toLowerCase() === 'from' || firstRowCells[0].toLowerCase().includes('to');

    if (firstCellIsEmpty || zoneLabels.some(z => firstRowCells.includes(z))) {
      hasHeaders = true;
    }

    const startRow = hasHeaders ? 1 : 0;

    for (let i = startRow; i < lines.length; i++) {
      const cells = lines[i].split(delimiter).map(c => c.trim());
      const startCol = hasHeaders ? 1 : 0;

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

  const handleAddZone = () => {
    if (!newZoneName.trim() || !onZoneLabelsChange) return;
    if (zoneLabels.includes(newZoneName.trim())) {
      toast.error("Zone already exists");
      return;
    }
    const newLabels = [...zoneLabels, newZoneName.trim()];
    const newRates = zoneRates.map(row => [...row, 0]);
    newRates.push(new Array(newLabels.length).fill(0));
    
    onZoneLabelsChange(newLabels);
    onRatesChange(newRates);
    setNewZoneName("");
    toast.success(`Zone ${newZoneName.trim()} added`);
  };

  if (zoneLabels.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <AlertCircle className="mx-auto mb-2" size={24} />
        <p>No zones configured. Please set up zones first.</p>
        {onZoneLabelsChange && (
          <div className="mt-4 flex justify-center items-center gap-2 max-w-sm mx-auto">
            <input
              type="text"
              value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddZone())}
              placeholder="E.g., North Zone"
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
            <button
              type="button"
              onClick={handleAddZone}
              disabled={!newZoneName.trim()}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={20} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Ensure inputRefs matches dimensions
  if (inputRefs.current.length !== zoneLabels.length) {
    inputRefs.current = Array(zoneLabels.length).fill(null).map(() => Array(zoneLabels.length).fill(null));
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
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
        {onZoneLabelsChange && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddZone())}
              placeholder="Add New Zone..."
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
            <button
              type="button"
              onClick={handleAddZone}
              disabled={!newZoneName.trim()}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={18} />
            </button>
          </div>
        )}
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
                      ref={el => {
                        if (!inputRefs.current[i]) inputRefs.current[i] = [];
                        inputRefs.current[i][j] = el;
                      }}
                      type="number"
                      step="0.01"
                      value={val || ''}
                      onChange={(e) => handleCellChange(i, j, e.target.valueAsNumber || 0)}
                      onKeyDown={(e) => handleKeyDown(i, j, e)}
                      onFocus={(e) => e.target.select()}
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
