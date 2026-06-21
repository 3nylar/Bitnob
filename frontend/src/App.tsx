import { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowDownUp, RefreshCw, Layers, TrendingUp, History, LineChart as ChartIcon } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface PoolState {
  reserve_a: number;
  reserve_b: number;
  total_shares: number;
  price_a: number;
}

interface PricePoint {
  time: string;
  price: number;
}

export default function App() {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [tokenIn, setTokenIn] = useState<string>('A');
  const [amountIn, setAmountIn] = useState<string>('');
  const [swapReceipt, setSwapReceipt] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // Dynamic history state for the graph
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([
    { time: 'Init', price: 2000.00 }
  ]);

  const BACKEND_URL = 'http://127.0.0.1:8000';

  const fetchPoolState = async () => {
    try {
      setErrorMessage('');
      const response = await axios.get(`${BACKEND_URL}/pool`);
      setPool(response.data);
      
      // Append new price point to chart data timeline
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setPriceHistory(prev => {
        // Prevent duplicate initial points
        if (prev.length > 0 && prev[prev.length - 1].price === response.data.price_a) return prev;
        return [...prev, { time: currentTime, price: response.data.price_a }];
      });
    } catch (error) {
      console.error("Backend connection error:", error);
      setErrorMessage("Could not connect to your Python server.");
    }
  };

  useEffect(() => {
    fetchPoolState();
  }, []);

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountIn || parseFloat(amountIn) <= 0) return;

    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axios.post(
        `${BACKEND_URL}/swap?token_in=${tokenIn}&amount_in=${amountIn}`
      );
      setSwapReceipt(response.data);
      setAmountIn('');
      await fetchPoolState(); 
    } catch (error: any) {
      console.error("Transaction failed:", error);
      setErrorMessage(error.response?.data?.detail || "An execution error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Liquidity Pool Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">Constant Product AMM Engine ($x \cdot y = k$)</p>
          </div>
          <button 
            onClick={fetchPoolState}
            className="p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-all flex items-center gap-2 text-sm text-slate-300 cursor-pointer"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        {/* ERROR BOX */}
        {errorMessage && (
          <div className="bg-red-950 border border-red-500/50 text-red-200 p-4 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}

        {/* STATISTICS GRID */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Token A Reserve
            </div>
            <div className="text-2xl font-bold">
              {pool ? pool.reserve_a.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '---'}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Token B Reserve
            </div>
            <div className="text-2xl font-bold">
              {pool ? pool.reserve_b.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '---'}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Layers size={14} className="text-purple-400" /> Total LP Shares
            </div>
            <div className="text-2xl font-bold">
              {pool ? pool.total_shares.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '---'}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950/20">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <TrendingUp size={14} className="text-blue-400" /> Spot Price (B/A)
            </div>
            <div className="text-2xl font-bold text-blue-400">
              {pool ? `${pool.price_a.toFixed(2)} B` : '---'}
            </div>
          </div>
        </section>

        {/* --- LIVE GRAPH VISUALIZER SECTION --- */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
            <ChartIcon size={18} className="text-emerald-400" /> Token A Price Chart (Denominated in B)
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis domain={['auto', 'auto']} stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* WORKSTATION */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* SWAP CARD */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
              <ArrowDownUp size={18} className="text-blue-400" /> Swap Interface
            </h2>
            
            <form onSubmit={handleSwap} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">From</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTokenIn('A')}
                    className={`p-3 rounded-xl font-semibold border text-sm transition-all cursor-pointer ${
                      tokenIn === 'A' 
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Token A
                  </button>
                  <button
                    type="button"
                    onClick={() => setTokenIn('B')}
                    className={`p-3 rounded-xl font-semibold border text-sm transition-all cursor-pointer ${
                      tokenIn === 'B' 
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Token B
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-lg font-medium focus:outline-none focus:border-blue-500 text-white"
                    required
                  />
                  <span className="absolute right-4 top-4 font-bold text-slate-500">
                    Token {tokenIn}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer text-center"
              >
                {loading ? 'Executing Trade...' : 'Swap Tokens'}
              </button>
            </form>
          </div>

          {/* RECEIPT SIDEBAR */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4 flex items-center gap-1.5">
                <History size={14} /> Transaction Result
              </h3>
              
              {swapReceipt ? (
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-center">
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wide">Status: {swapReceipt.status}</span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Deposited</span>
                      <span className="font-semibold text-white">{swapReceipt.sent} Token {swapReceipt.swapped}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Received</span>
                      <span className="font-bold text-emerald-400">+{swapReceipt.received.toFixed(4)} Token {swapReceipt.swapped === 'A' ? 'B' : 'A'}</span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-slate-500 text-xs font-mono">AMM Protocol Fee (0.3%)</span>
                      <span className="text-slate-400 text-xs">{swapReceipt.fee_paid.toFixed(4)} {swapReceipt.swapped}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-600 text-sm border border-dashed border-slate-800 rounded-2xl">
                  Run a swap execution to stream a ledger entry block.
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}