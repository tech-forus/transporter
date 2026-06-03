// src/types/index.ts

// For the main calculator form - Shipment Overview
export interface ShipmentOverviewType { // Renamed for clarity as it's used for state
  // invoiceNumber?: string; // REMOVED (or make optional if strictly needed elsewhere later)
  date: string;
  shipperLocation: string; // Will hold Origin Pincode
  destination: string;   // Will hold Destination Pincode
  modeOfTransport: TransportMode; // Use the TransportMode type
  totalBoxes: number;      // Typically calculated, display-only in this form
  totalWeight: number;     // Typically calculated, display-only in this form
  actualWeight?: number;    // User override for chargeable weight
}

// For individual box entries
export interface BoxDetails {
  id: string; // Unique ID for the box entry (e.g., UUID)
  serialNo: number; // Just for display sequence
  numberOfBoxes: number;
  qtyPerBox: number; // If applicable
  totalQty: number;  // numberOfBoxes * qtyPerBox
  length: number;    // In cm or consistent unit
  width: number;     // In cm or consistent unit
  height: number;    // In cm or consistent unit
  weightPerBox: number; // Actual weight of one box
  totalWeight: number;  // numberOfBoxes * weightPerBox
  description: string;
  uom: string;       // Unit of Measure for dimensions (e.g., "cm", "inch")
  volumetricWeight: number; // Calculated for this box line item
}

// Defines the detailed rate structure for a single vendor
// This needs to align with what admins input and what the backend stores/sends
export interface VendorRateConfig {
  baseFare?: { // Optional per mode
    Road?: number;
    Rail?: number;
    Air?: number;
    Ship?: number;
  };
  perKmCharge?: {
    Road?: number;
    Rail?: number;
    Air?: number;
    Ship?: number;
  };
  perKgCharge?: {
    Road?: number;
    Rail?: number;
    Air?: number;
    Ship?: number;
  };
  volumetricWeightDivisor?: { // e.g., 5000, 6000
    Road?: number;
    Rail?: number;
    Air?: number;
    Ship?: number;
  };
  expressSurchargePercent?: number; // e.g., 0.20 for 20%
  fragileSurchargeAbsolute?: number; // e.g., 50 for a flat fee
  // Add any other specific rate parameters you might need for calculations
  // Example: minChargeableWeight?: { Road?: number; ... }
}

// For the data coming from the backend for each vendor (public listing for calculator)
export interface ApiVendorType {
  id: string; // From database
  name: string;
  rateConfig: VendorRateConfig; // The specific rate structure for this vendor
  serviceablePincodes?: string[]; // List of pincodes they serve
  odaOffered?: boolean;          // Out of Delivery Area assistance offered
  odaDetails?: string;           // Notes about their ODA policy
  // Potentially a logo URL if you have one per vendor:
  // logoUrl?: string; 
}

// For displaying calculated quotes to the user
export interface VendorQuote {
  vendorName: string; // Renamed from 'name' for clarity from ApiVendorType
  deliveryTime: string; // Changed from estimatedDeliveryDays to string for more flexibility (e.g., "2-3 days")
  chargeableWeight: number;
  totalCost: number; // Renamed from totalPrice for consistency
  // Breakdown (optional but good for display)
  baseFare?: number;
  distanceCharge?: number;
  weightCharge?: number;
  handling?: number; // Could represent fragileSurchargeAbsolute or other fixed handling
  surcharges?: number; // Could represent expressSurchargePercent value or other variable surcharges
  // You might remove id and logo if these are just display quotes from ApiVendorType
  // id?: string; // Might not be needed if vendorName is sufficient for display
  // logo?: string; // Path or URL to vendor logo
  // odaOffered?: boolean; // To show alongside the quote
  // odaDetails?: string; // To show alongside the quote
}

export type TransportMode = 'Road' | 'Rail' | 'Air' | 'Ship';

// This Location type might still be used for dropdowns, but pincodes will be key for filtering/distance
export interface Location {
  id: string;      // Could be pincode itself if unique
  name: string;    // City name / Area name
  pincode: string; // Explicit pincode field
  state?: string;
  // code?: string; // If you had an internal code
}