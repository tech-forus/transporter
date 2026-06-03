import { BoxDetails } from '../types';

// Calculate volumetric weight (L×W×H/5000 for air freight)
export const calculateVolumetricWeight = (length: number, width: number, height: number, mode: string): number => {
  const volumeCubicCm = length * width * height;
  
  // Different divisors based on transport mode
  const divisor = mode === 'Air' ? 5000 : 
                 mode === 'Road' ? 3500 :
                 mode === 'Rail' ? 4000 : 6000; // Ship has the highest divisor
  
  return volumeCubicCm / divisor;
};

// Calculate total boxes and weights from box details
export const calculateTotals = (boxes: BoxDetails[]) => {
  const totalBoxes = boxes.reduce((sum, box) => sum + box.numberOfBoxes, 0);
  const totalWeight = boxes.reduce((sum, box) => sum + box.totalWeight, 0);
  const totalVolumetricWeight = boxes.reduce((sum, box) => sum + box.volumetricWeight, 0);
  
  return {
    totalBoxes,
    totalWeight,
    totalVolumetricWeight,
    chargeableWeight: Math.max(totalWeight, totalVolumetricWeight)
  };
};

// Generate a new box with default values
export const generateNewBox = (boxes: BoxDetails[]): BoxDetails => {
  const nextSerialNo = boxes.length > 0 ? Math.max(...boxes.map(b => b.serialNo)) + 1 : 1;
  
  return {
    id: `box-${Date.now()}`,
    serialNo: nextSerialNo,
    numberOfBoxes: 1,
    qtyPerBox: 1,
    totalQty: 1,
    length: 0,
    width: 0,
    height: 0,
    weightPerBox: 0,
    totalWeight: 0,
    description: '',
    uom: 'pcs',
    volumetricWeight: 0
  };
};

// Format currency
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount);
};

// Format weight
export const formatWeight = (weight: number): string => {
  return `${weight.toFixed(2)} kg`;
};