import { useState, useEffect, ChangeEvent, FormEvent } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  ChevronDown,
  Percent,
  Truck,
  Weight,
  SlidersHorizontal,
  Package,
  Cog,
  BotMessageSquare,
  Save,
  Loader2,
  Scale // New icon for threshold weight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Cookies from "js-cookie";

// --- Type Definitions ---
interface VariableFixed { variable: number; fixed: number; }
// ✨ NEW: Extended type specifically for handling charges
interface VariableFixedThreshold extends VariableFixed { thresholdWeight?: number; }

type PriceRate = {
  minWeight: number;
  docketCharges: number;
  fuel: number;
  rovCharges: VariableFixed;
  insuranceCharges: VariableFixed;
  odaCharges: VariableFixed;
  codCharges: VariableFixed;
  prepaidCharges: VariableFixed;
  topayCharges: VariableFixed;
  handlingCharges: VariableFixedThreshold; // ✨ Use the new type here
  fmCharges: VariableFixed;
  appointmentCharges: VariableFixed;
  divisor: number;
  minCharges: number;
  greenTax: number;
  daccCharges: number;
  miscellanousCharges: number;
};

// --- Styled & Reusable Components ---
const Card = ({ children, className }: { children: React.ReactNode; className?: string; }) => ( <div className={`bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8 ${className}`}>{children}</div> );
const InputField = ({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode; }) => ( <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400">{icon}</span><input {...props} className={`w-full ${icon ? "pl-10" : "px-3"} py-2.5 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}/></div> );
const AccordionItem = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode; }) => { const [isOpen, setIsOpen] = useState(false); return (<div className="border border-slate-200 rounded-lg"><button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 text-left"><div className="flex items-center gap-3"><span className="text-blue-600">{icon}</span><h3 className="font-semibold text-slate-800">{title}</h3></div><ChevronDown size={20} className={`text-slate-500 transition-transform ${ isOpen ? "rotate-180" : "" }`}/></button><AnimatePresence><motion.div initial={false} animate={isOpen ? { height: "auto", opacity: 1, marginTop: "1rem" } : { height: 0, opacity: 0, marginTop: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="overflow-hidden px-4 pb-4">{children}</motion.div></AnimatePresence></div>); };

// Standard 2-input group
const ChargeInputGroup = ({ section, value, handler }: { section: keyof PriceRate; value: VariableFixed; handler: (s: keyof PriceRate, f: keyof VariableFixed, e: ChangeEvent<HTMLInputElement>) => void }) => (<div className="grid grid-cols-2 gap-4"><InputField type="number" step="0.01" icon={<Percent size={14} />} placeholder="Variable (%)" value={value.variable || ""} onChange={e => handler(section, "variable", e)}/><InputField type="number" icon={<DollarSign size={14} />} placeholder="Fixed (₹)" value={value.fixed || ""} onChange={e => handler(section, "fixed", e)} /></div>);

// ✨ NEW: 3-input group specifically for Handling Charges
const HandlingChargeInputGroup = ({ value, handler }: { value: VariableFixedThreshold; handler: (s: 'handlingCharges', f: keyof VariableFixedThreshold, e: ChangeEvent<HTMLInputElement>) => void}) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InputField type="number" step="0.01" icon={<Percent size={14} />} placeholder="Variable (%)" value={value.variable || ""} onChange={e => handler('handlingCharges', "variable", e)}/>
        <InputField type="number" icon={<DollarSign size={14} />} placeholder="Fixed (₹)" value={value.fixed || ""} onChange={e => handler('handlingCharges', "fixed", e)}/>
        <InputField type="number" icon={<Scale size={14} />} placeholder="Threshold Wt. (Kg)" value={value.thresholdWeight || ""} onChange={e => handler('handlingCharges', "thresholdWeight", e)}/>
    </div>
);

export default function AddPrice() {
  const navigate = useNavigate();
  // State initialization with the new field for handlingCharges
  const [priceRate, setPriceRate] = useState<PriceRate>({
    minWeight: 0, docketCharges: 0, fuel: 0,
    rovCharges: { variable: 0, fixed: 0 },
    insuranceCharges: { variable: 0, fixed: 0 },
    odaCharges: { variable: 0, fixed: 0 },
    codCharges: { variable: 0, fixed: 0 },
    prepaidCharges: { variable: 0, fixed: 0 },
    topayCharges: { variable: 0, fixed: 0 },
    handlingCharges: { variable: 0, fixed: 0, thresholdWeight: 0 }, // ✨ Initialized here
    fmCharges: { variable: 0, fixed: 0 },
    appointmentCharges: { variable: 0, fixed: 0 },
    divisor: 1, minCharges: 0, greenTax: 0, daccCharges: 0, miscellanousCharges: 0,
  });
  
  // Other states remain the same...
  const [transporterName, setTransporterName] = useState("");
  const [zoneLabels, setZoneLabels] = useState<string[]>([]);
  const [zoneRates, setZoneRates] = useState<number[][]>([]);
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // Robust handler function now supports VariableFixed and VariableFixedThreshold
  const handleRateChange = (
    section: keyof PriceRate,
    field: keyof VariableFixed | keyof VariableFixedThreshold | null,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const val = e.target.valueAsNumber || 0;
    setPriceRate(prev =>
      field
        ? { ...prev, [section]: { ...(typeof prev[section] === "object" && prev[section] !== null ? prev[section] : {}), [field]: val } }
        : { ...prev, [section]: val }
    );
  };
  
  // All other handlers and useEffects remain unchanged...
  const handleCellChange = (i: number, j: number, val: number) => { setZoneRates(prev => { const next = prev.map(r => [...r]); next[i][j] = val; return next; }); };
  const handleAddUnitPrice = () => { if (!manualFrom || !manualTo || manualPrice === undefined) { toast.error("Please select zones and enter a price."); return; } const i = zoneLabels.indexOf(manualFrom); const j = zoneLabels.indexOf(manualTo); if (i >= 0 && j >= 0) { handleCellChange(i, j, manualPrice); toast.success(`Set rate from ${manualFrom} to ${manualTo} as ₹${manualPrice}`); setManualPrice(undefined); } };
  useEffect(() => { const savedName = sessionStorage.getItem("companyName"); const savedZones = sessionStorage.getItem("zones"); if (savedName) setTransporterName(savedName); if (savedZones) { try { const arr = JSON.parse(savedZones); if (Array.isArray(arr)) { setZoneLabels(arr); setZoneRates(arr.map(() => arr.map(() => 0))); } } catch {} } }, []);
  const token = Cookies.get("authToken");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!transporterName.trim()) { toast.error("Transporter name is missing."); return; }
    const zr: Record<string, Record<string, number>> = {};
    zoneLabels.forEach((from, i) => { zr[from] = {}; zoneLabels.forEach((to, j) => (zr[from][to] = zoneRates[i]?.[j] || 0)); });
    const payload = { companyName: transporterName, priceRate, zoneRates: zr, };
    setLoading(true);
    try {
      console.log(payload);
      await axios.post("https://backend-bcxr.onrender.com/api/transporter/auth/addprice", payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Price configuration saved successfully!");
      navigate("/compare");
    } catch (err: any) { toast.error( err.response?.data?.message || "Save failed."); console.error(err);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans py-12">
      <div className="container mx-auto px-4 max-w-5xl space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Price Configuration</h1>
          <p className="mt-2 text-lg text-slate-600">Set up rates and surcharges for <span className="font-bold text-blue-600">{transporterName || "your new transporter"}</span>.</p>
        </motion.div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Transporter Name and Basic Rates Cards remain unchanged */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}><Card><div className="flex items-center gap-3"><Truck size={22} className="text-blue-600" /><h2 className="text-xl font-bold text-slate-800">Transporter</h2></div><input type="text" className="mt-4 w-full bg-slate-100 p-3 rounded-lg border text-lg font-semibold" value={transporterName} disabled /></Card></motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}><Card><div className="flex items-center gap-3"><DollarSign size={22} className="text-blue-600" /><h2 className="text-xl font-bold text-slate-800">Basic Rates & Fuel</h2></div><p className="text-sm text-slate-500 mt-1 mb-4">Set the foundational rates for this transporter's pricing.</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><InputField icon={<Weight size={14}/>} type="number" placeholder="Min. Chargeable Weight" value={priceRate.minWeight || ""} onChange={(e) => handleRateChange("minWeight", null, e)}/><InputField icon={<Package size={14}/>} type="number" placeholder="Docket Charges (₹)" value={priceRate.docketCharges || ""} onChange={(e) => handleRateChange("docketCharges", null, e)}/><InputField icon={<Percent size={14}/>} type="number" placeholder="Fuel Surcharge (%)" value={priceRate.fuel || ""} onChange={(e) => handleRateChange("fuel", null, e)}/></div></Card></motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <div className="flex items-center gap-3"><Cog size={22} className="text-blue-600" /><h2 className="text-xl font-bold text-slate-800">Surcharge Configuration</h2></div>
              <p className="text-sm text-slate-500 mt-1 mb-6">Define variable and fixed costs for various additional charges.</p>
              <div className="space-y-4">
                 <AccordionItem title="Risk & Value Charges" icon={<SlidersHorizontal size={18} />}><div className="space-y-4"><label className="font-medium text-sm text-slate-600">ROV Charges</label><ChargeInputGroup section="rovCharges" value={priceRate.rovCharges} handler={handleRateChange}/><label className="font-medium text-sm text-slate-600">Insurance Charges</label><ChargeInputGroup section="insuranceCharges" value={priceRate.insuranceCharges} handler={handleRateChange}/></div></AccordionItem>
                 <AccordionItem title="Delivery & Service Charges" icon={<Package size={18} />}><div className="space-y-4"><label className="font-medium text-sm text-slate-600">ODA Charges</label><ChargeInputGroup section="odaCharges" value={priceRate.odaCharges} handler={handleRateChange}/><label className="font-medium text-sm text-slate-600">Appointment Charges</label><ChargeInputGroup section="appointmentCharges" value={priceRate.appointmentCharges} handler={handleRateChange}/></div></AccordionItem>
                <AccordionItem title="Payment & Handling Charges" icon={<BotMessageSquare size={18} />}>
                  <div className="space-y-4">
                     {/* ✨ MODIFICATION: Replaced ChargeInputGroup with HandlingChargeInputGroup for Handling Charges */}
                    <label className="font-medium text-sm text-slate-600">Handling Charges</label>
                    <HandlingChargeInputGroup value={priceRate.handlingCharges} handler={handleRateChange} />
                    
                    <label className="font-medium text-sm text-slate-600">COD Charges</label><ChargeInputGroup section="codCharges" value={priceRate.codCharges} handler={handleRateChange}/>
                    <label className="font-medium text-sm text-slate-600">To-Pay Charges</label><ChargeInputGroup section="topayCharges" value={priceRate.topayCharges} handler={handleRateChange}/>
                    <label className="font-medium text-sm text-slate-600">Prepaid Charges</label><ChargeInputGroup section="prepaidCharges" value={priceRate.prepaidCharges} handler={handleRateChange}/>
                    <label className="font-medium text-sm text-slate-600">FM Charges</label><ChargeInputGroup section="fmCharges" value={priceRate.fmCharges} handler={handleRateChange}/>
                  </div>
                </AccordionItem>
                <AccordionItem title="Other Parameters" icon={<SlidersHorizontal size={18} />}><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"><InputField type="number" placeholder="Divisor Coefficient" value={priceRate.divisor || ""} onChange={(e) => handleRateChange("divisor", null, e)}/><InputField type="number" placeholder="Min. Overall Charges" value={priceRate.minCharges || ""} onChange={(e) => handleRateChange("minCharges", null, e)}/><InputField type="number" placeholder="Green Tax" value={priceRate.greenTax || ""} onChange={(e) => handleRateChange("greenTax", null, e)}/><InputField type="number" placeholder="DACC Charges" value={priceRate.daccCharges || ""} onChange={(e) => handleRateChange("daccCharges", null, e)}/><InputField type="number" placeholder="Misc. Charges" value={priceRate.miscellanousCharges || ""} onChange={(e) =>handleRateChange("miscellanousCharges", null, e)}/></div></AccordionItem>
              </div>
            </Card>
          </motion.div>
          
          {/* Zone-to-Zone Rates Card and Save button remain unchanged */}
           <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.4}}><Card><div className="flex items-center gap-3"><SlidersHorizontal size={22} className="text-blue-600"/><h2 className="text-xl font-bold text-slate-800">Zone-to-Zone Rates</h2></div><p className="text-sm text-slate-500 mt-1 mb-6">Enter the per-kilogram rate for shipping between each zone. Use the fields below to quickly add/update rates.</p><div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6"><div><label className="block mb-1 text-sm font-medium">From</label><select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg" value={manualFrom} onChange={e=>setManualFrom(e.target.value)}><option value="">--</option>{zoneLabels.map(z=><option key={`f-${z}`} value={z}>{z}</option>)}</select></div><div><label className="block mb-1 text-sm font-medium">To</label><select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg" value={manualTo} onChange={e=>setManualTo(e.target.value)}><option value="">--</option>{zoneLabels.map(z=><option key={`t-${z}`} value={z}>{z}</option>)}</select></div><div><label className="block mb-1 text-sm font-medium">Unit Price</label><InputField type="number" placeholder='e.g., 25' value={manualPrice === undefined ? '' : manualPrice} onChange={e=>setManualPrice(e.target.valueAsNumber)} /></div><div className="flex items-end"><button type="button" className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700" onClick={handleAddUnitPrice}>Add Rate</button></div></div>{zoneLabels.length > 0 && ( <div className="overflow-x-auto border border-slate-200 rounded-lg"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 font-semibold text-slate-600 text-left">From \ To</th>{zoneLabels.map(l=><th key={l} className="p-3 text-center font-semibold text-slate-600">{l}</th>)}</tr></thead><tbody className='bg-white divide-y divide-slate-200'>{zoneRates.map((row,i)=><tr key={i}><td className="p-3 font-semibold text-slate-700 bg-slate-50 sticky left-0">{zoneLabels[i]}</td>{row.map((v,j)=><td key={j} className="p-1"><input type="number" step="0.01" className="w-full p-2 text-center rounded-md border border-transparent hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={v||''} onChange={e=>handleCellChange(i,j,e.target.valueAsNumber||0)} /></td>)}</tr>)}</tbody></table></div>)}</Card></motion.div>
          <div className="pt-4 text-center"><button type="submit" disabled={loading} className="w-full max-w-xs inline-flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white text-base font-semibold rounded-lg shadow-lg shadow-blue-500/50 hover:bg-blue-700 disabled:opacity-50">{loading ? <><Loader2 className="animate-spin" size={20}/>Saving...</> : <><Save size={20}/> Save Configuration</>}</button></div>
        </form>
      </div>
    </div>
  );
}