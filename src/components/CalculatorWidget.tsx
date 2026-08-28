import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Calculator, X, Delete, Percent, Coins, Briefcase } from 'lucide-react';

export default function CalculatorWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'standard' | 'fee' | 'salary'>('standard');
  const calcRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Standard Calc state
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [isFinished, setIsFinished] = useState(false);

  // Fee helper state
  const [feeBase, setFeeBase] = useState('5000');
  const [feeTransport, setFeeTransport] = useState('1500');
  const [feeDiscount, setFeeDiscount] = useState('10'); // % discount
  const [applyEduTax, setApplyEduTax] = useState(true); // 1% Nepalese Educational Service Tax
  const [feeResult, setFeeResult] = useState({ subtotal: 0, discountVal: 0, taxVal: 0, total: 0 });

  // Salary helper state
  const [salaryBase, setSalaryBase] = useState('25000');
  const [salaryAllowance, setSalaryAllowance] = useState('3000');
  const [deductPF, setDeductPF] = useState(true); // 10% Provident Fund
  const [deductCIT, setDeductCIT] = useState('1000'); // Citizen Investment Trust fixed
  const [deductSST, setDeductSST] = useState(true); // 1% Social Security Tax
  const [salaryResult, setSalaryResult] = useState({ gross: 0, pfVal: 0, sstVal: 0, totalDeductions: 0, netPay: 0 });

  // Close when clicking outside - not necessary, keep it floatable so admin can copy numbers
  useEffect(() => {
    // Recalculate fee helper output dynamically
    const base = parseFloat(feeBase) || 0;
    const trans = parseFloat(feeTransport) || 0;
    const discPercent = parseFloat(feeDiscount) || 0;
    const sub = base + trans;
    const disc = (sub * discPercent) / 100;
    const taxable = sub - disc;
    const tax = applyEduTax ? (taxable * 0.01) : 0;
    const tot = taxable + tax;

    setFeeResult({
      subtotal: sub,
      discountVal: parseFloat(disc.toFixed(2)),
      taxVal: parseFloat(tax.toFixed(2)),
      total: parseFloat(tot.toFixed(2)),
    });
  }, [feeBase, feeTransport, feeDiscount, applyEduTax]);

  useEffect(() => {
    // Recalculate salary helper output dynamically
    const base = parseFloat(salaryBase) || 0;
    const allow = parseFloat(salaryAllowance) || 0;
    const gross = base + allow;
    
    const pf = deductPF ? (base * 0.10) : 0; // PF is usually calculated on base salary
    const sst = deductSST ? (gross * 0.01) : 0; // Social security tax on gross
    const cit = parseFloat(deductCIT) || 0;
    const deductionsSum = pf + sst + cit;
    const net = gross - deductionsSum;

    setSalaryResult({
      gross,
      pfVal: parseFloat(pf.toFixed(2)),
      sstVal: parseFloat(sst.toFixed(2)),
      totalDeductions: parseFloat(deductionsSum.toFixed(2)),
      netPay: parseFloat((net > 0 ? net : 0).toFixed(2)),
    });
  }, [salaryBase, salaryAllowance, deductPF, deductCIT, deductSST]);

  // Handle keyboard inputs for standard calculator
  useEffect(() => {
    if (!isOpen || activeSubTab !== 'standard') return;

    function handleKeyDown(e: KeyboardEvent) {
      const { key } = e;
      if (key >= '0' && key <= '9') {
        handleDigit(key);
      } else if (key === '.') {
        handleDecimal();
      } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        handleOperator(key === '*' ? '×' : key === '/' ? '÷' : key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEvaluate();
      } else if (key === 'Backspace') {
        handleBackspace();
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        handleClear();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeSubTab, display, equation, isFinished]);

  const handleDigit = (digit: string) => {
    if (display === '0' || isFinished) {
      setDisplay(digit);
      setIsFinished(false);
    } else {
      setDisplay(display + digit);
    }
  };

  const handleDecimal = () => {
    if (isFinished) {
      setDisplay('0.');
      setIsFinished(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setIsFinished(false);
  };

  const handleBackspace = () => {
    if (isFinished) {
      handleClear();
      return;
    }
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const handleOperator = (op: string) => {
    let currentVal = display;
    if (currentVal.endsWith('.')) {
      currentVal = currentVal.slice(0, -1);
    }
    
    setEquation(`${currentVal} ${op}`);
    setDisplay('0');
    setIsFinished(false);
  };

  const handleEvaluate = () => {
    if (!equation) return;

    const parts = equation.split(' ');
    const num1 = Number(parts[0]);
    const operator = parts[1];
    const num2 = Number(display);

    if (isNaN(num1) || isNaN(num2)) return;

    let result = 0;
    switch (operator) {
      case '+':
        result = num1 + num2;
        break;
      case '-':
        result = num1 - num2;
        break;
      case '×':
        result = num1 * num2;
        break;
      case '÷':
        if (num2 === 0) {
          setDisplay('Error');
          setEquation('');
          setIsFinished(true);
          return;
        }
        result = num1 / num2;
        break;
      default:
        return;
    }

    const formattedResult = parseFloat(result.toFixed(8)).toString();
    setDisplay(formattedResult);
    setEquation('');
    setIsFinished(true);
  };

  const handlePercent = () => {
    const num = Number(display);
    if (!isNaN(num)) {
      setDisplay((num / 100).toString());
      setIsFinished(true);
    }
  };

  const handleToggleSign = () => {
    const num = Number(display);
    if (!isNaN(num) && num !== 0) {
      setDisplay((num * -1).toString());
    }
  };

  const sendToCalculator = (val: number) => {
    setDisplay(val.toString());
    setEquation('');
    setIsFinished(true);
    setActiveSubTab('standard');
  };

  return (
    <motion.div
      ref={calcRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      className="fixed bottom-6 left-6 md:left-[244px] z-50 font-sans print:hidden touch-none"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, scale: 0.9, filter: 'blur(4px)' }}
            transition={{ type: 'spring', damping: 20, stiffness: 250 }}
            className="mb-4 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col"
          >
            {/* Title Bar */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-700 shrink-0 cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">School Admin Calculator</span>
              </div>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Unique Segmented Sub-Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1.5 border-b border-slate-800/80">
              <button
                onClick={() => setActiveSubTab('standard')}
                className={`py-1 px-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex flex-col items-center gap-1 ${
                  activeSubTab === 'standard'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Standard</span>
              </button>
              <button
                onClick={() => setActiveSubTab('fee')}
                className={`py-1 px-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex flex-col items-center gap-1 ${
                  activeSubTab === 'fee'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Fee helper</span>
              </button>
              <button
                onClick={() => setActiveSubTab('salary')}
                className={`py-1 px-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex flex-col items-center gap-1 ${
                  activeSubTab === 'salary'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Salary helper</span>
              </button>
            </div>

            {/* TAB CONTENT: STANDARD CALCULATOR */}
            {activeSubTab === 'standard' && (
              <div className="animate-in fade-in duration-200">
                {/* Display Area */}
                <div className="p-4 bg-slate-950 text-right">
                  <div className="text-slate-400 text-xs font-mono h-5 overflow-hidden truncate">
                    {equation}
                  </div>
                  <div className="text-3xl font-black font-mono tracking-tight text-white overflow-hidden text-ellipsis truncate h-10 mt-1">
                    {display}
                  </div>
                </div>

                {/* Keyboard Layout */}
                <div className="p-3 grid grid-cols-4 gap-2 bg-slate-900">
                  {/* Row 1 */}
                  <button
                    onClick={handleClear}
                    className="py-3 text-xs font-black uppercase tracking-wider rounded-xl bg-slate-800 hover:bg-slate-700 text-red-400 transition-all active:scale-95"
                  >
                    C
                  </button>
                  <button
                    onClick={handleToggleSign}
                    className="py-3 text-sm font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-95"
                  >
                    ±
                  </button>
                  <button
                    onClick={handlePercent}
                    className="py-3 text-sm font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-95"
                  >
                    %
                  </button>
                  <button
                    onClick={() => handleOperator('÷')}
                    className="py-3 text-lg font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95"
                  >
                    ÷
                  </button>

                  {/* Row 2 */}
                  <button
                    onClick={() => handleDigit('7')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    7
                  </button>
                  <button
                    onClick={() => handleDigit('8')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    8
                  </button>
                  <button
                    onClick={() => handleDigit('9')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    9
                  </button>
                  <button
                    onClick={() => handleOperator('×')}
                    className="py-3 text-lg font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95"
                  >
                    ×
                  </button>

                  {/* Row 3 */}
                  <button
                    onClick={() => handleDigit('4')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    4
                  </button>
                  <button
                    onClick={() => handleDigit('5')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    5
                  </button>
                  <button
                    onClick={() => handleDigit('6')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    6
                  </button>
                  <button
                    onClick={() => handleOperator('-')}
                    className="py-3 text-lg font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95"
                  >
                    -
                  </button>

                  {/* Row 4 */}
                  <button
                    onClick={() => handleDigit('1')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    1
                  </button>
                  <button
                    onClick={() => handleDigit('2')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    2
                  </button>
                  <button
                    onClick={() => handleDigit('3')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    3
                  </button>
                  <button
                    onClick={() => handleOperator('+')}
                    className="py-3 text-lg font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95"
                  >
                    +
                  </button>

                  {/* Row 5 */}
                  <button
                    onClick={() => handleDigit('0')}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    0
                  </button>
                  <button
                    onClick={handleDecimal}
                    className="py-3 text-lg font-bold rounded-xl bg-slate-800/60 hover:bg-slate-800 text-white transition-all active:scale-95 font-mono"
                  >
                    .
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="py-3 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-95"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleEvaluate}
                    className="py-3 text-lg font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95"
                  >
                    =
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: UNIQUE FEE HELPER */}
            {activeSubTab === 'fee' && (
              <div className="p-4 bg-slate-900 space-y-3 max-h-[360px] overflow-y-auto animate-in fade-in duration-200">
                <div className="text-center pb-1 border-b border-slate-800">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Quick Fee Calculator</h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Estimate total dues with preset scholarships & tax rules</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Base Tuition</label>
                    <input
                      type="number"
                      value={feeBase}
                      onChange={(e) => setFeeBase(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Transport / Other</label>
                    <input
                      type="number"
                      value={feeTransport}
                      onChange={(e) => setFeeTransport(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {/* Scholarship preset buttons */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Scholarship / Discount ({feeDiscount}%)</label>
                  <div className="grid grid-cols-5 gap-1">
                    {['0', '10', '25', '50', '100'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setFeeDiscount(p)}
                        className={`py-1 text-[10px] font-bold rounded-md font-mono ${
                          feeDiscount === p ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Educational Service Tax Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-2 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={applyEduTax}
                    onChange={(e) => setApplyEduTax(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <div className="text-left">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-300">Edu Service Fee (1%)</div>
                    <div className="text-[8px] text-slate-500">Standard Nepalese educational service levy</div>
                  </div>
                </label>

                {/* Calculation Outputs */}
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400 text-[10px]">
                    <span>Subtotal:</span>
                    <span>Rs. {feeResult.subtotal}</span>
                  </div>
                  <div className="flex justify-between text-red-400 text-[10px]">
                    <span>Scholarship ({feeDiscount}%):</span>
                    <span>- Rs. {feeResult.discountVal}</span>
                  </div>
                  {applyEduTax && (
                    <div className="flex justify-between text-amber-400 text-[10px]">
                      <span>Edu Service Fee (1%):</span>
                      <span>+ Rs. {feeResult.taxVal}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-extrabold border-t border-slate-800 pt-1 text-sm">
                    <span className="text-emerald-400 font-sans uppercase font-black text-[10px] tracking-wider">Total Payable:</span>
                    <span>Rs. {feeResult.total}</span>
                  </div>
                </div>

                <button
                  onClick={() => sendToCalculator(feeResult.total)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-emerald-950/40 uppercase tracking-wider"
                >
                  Send Total to Calculator
                </button>
              </div>
            )}

            {/* TAB CONTENT: UNIQUE SALARY/DEDUCTION HELPER */}
            {activeSubTab === 'salary' && (
              <div className="p-4 bg-slate-900 space-y-3 max-h-[360px] overflow-y-auto animate-in fade-in duration-200">
                <div className="text-center pb-1 border-b border-slate-800">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-400">Quick Salary Planner</h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Calculate net salary with Nepalese PF, CIT & SST rules</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Base Monthly Pay</label>
                    <input
                      type="number"
                      value={salaryBase}
                      onChange={(e) => setSalaryBase(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Allowances</label>
                    <input
                      type="number"
                      value={salaryAllowance}
                      onChange={(e) => setSalaryAllowance(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                {/* Deductions inputs */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[9px] font-black uppercase text-slate-400">Deduction Presets</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deductPF}
                        onChange={(e) => setDeductPF(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <div className="text-left">
                        <div className="text-[9px] font-black uppercase text-slate-300">Provident Fund</div>
                        <div className="text-[7px] text-slate-500">10% of base salary</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deductSST}
                        onChange={(e) => setDeductSST(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <div className="text-left">
                        <div className="text-[9px] font-black uppercase text-slate-300">Social Sec. Tax</div>
                        <div className="text-[7px] text-slate-500">1% of gross income</div>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">CIT Contribution (Rs.)</label>
                    <input
                      type="number"
                      value={deductCIT}
                      onChange={(e) => setDeductCIT(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono focus:border-amber-500 outline-none text-xs"
                    />
                  </div>
                </div>

                {/* Calculation Outputs */}
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400 text-[10px]">
                    <span>Gross Salary:</span>
                    <span>Rs. {salaryResult.gross}</span>
                  </div>
                  {deductPF && (
                    <div className="flex justify-between text-red-400 text-[10px]">
                      <span>PF Deduction (10%):</span>
                      <span>- Rs. {salaryResult.pfVal}</span>
                    </div>
                  )}
                  {deductSST && (
                    <div className="flex justify-between text-red-400 text-[10px]">
                      <span>Social Security Tax (1%):</span>
                      <span>- Rs. {salaryResult.sstVal}</span>
                    </div>
                  )}
                  {(parseFloat(deductCIT) > 0) && (
                    <div className="flex justify-between text-red-400 text-[10px]">
                      <span>CIT Contribution:</span>
                      <span>- Rs. {parseFloat(deductCIT) || 0}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-extrabold border-t border-slate-800 pt-1 text-sm">
                    <span className="text-amber-400 font-sans uppercase font-black text-[10px] tracking-wider">Estimated Net Pay:</span>
                    <span>Rs. {salaryResult.netPay}</span>
                  </div>
                </div>

                <button
                  onClick={() => sendToCalculator(salaryResult.netPay)}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-amber-950/40 uppercase tracking-wider"
                >
                  Send Net Pay to Calculator
                </button>
              </div>
            )}

            <div className="px-4 py-2 bg-slate-950 text-[8px] text-slate-500 text-center uppercase tracking-widest font-black border-t border-slate-800">
              Unique contextual billing companion
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Trigger Button */}
      <motion.button
        id="calculator_floating_widget"
        onPointerDown={(e) => dragControls.start(e)}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 px-5 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm shadow-xl hover:shadow-2xl transition-all border border-slate-700/50 active:scale-95 group cursor-grab active:cursor-grabbing select-none"
      >
        <Calculator className="w-5 h-5 text-emerald-400 shrink-0 group-hover:rotate-6 transition-transform pointer-events-none" />
        <span className="pointer-events-none">Calculator</span>
      </motion.button>
    </motion.div>
  );
}
