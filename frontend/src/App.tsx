import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import {
  ArrowDownUp,
  RefreshCw,
  Layers,
  TrendingUp,
  History,
  LineChart as ChartIcon,
  AlertTriangle,
  Droplets,
  Wallet,
  Plus,
  Minus,
  User,
  Code,
  Cpu,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface PoolState {
  reserve_a: number;
  reserve_b: number;
  total_shares: number;
  price_a: number;
}

interface PricePoint {
  time: string;
  timestamp: number;
  price: number;
}

interface SwapResponse {
  status: string;
  sent: number;
  swapped: string;
  received: number;
  fee_paid: number;
}

interface AddLiquidityResponse {
  status: string;
  added_token_a: number;
  required_token_b: number;
  lp_shares_minted: number;
  new_total_shares: number;
}

interface RemoveLiquidityResponse {
  status: string;
  shares_burned: number;
  returned_token_a: number;
  returned_token_b: number;
  remaining_total_shares: number;
}

interface PositionResponse {
  user_id: string;
  shares: number;
  ownership_pct: number;
  deposited_amount_a: number;
  deposited_amount_b: number;
  current_value_a: number;
  current_value_b: number;
  current_value_in_b: number;
  hold_value_in_b: number;
  impermanent_loss_pct: number;
}

type WorkstationTab = "swap" | "liquidity" | "position";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL;
const SWAP_FEE_BPS = 30;
const MAX_PRICE_HISTORY = 200;
const USER_ID_KEY = "amm_sim_user_id";

function quoteOutput(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
): number {
  if (!amountIn || amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0;
  const amountInAfterFee = amountIn * (1 - SWAP_FEE_BPS / 10000);
  return (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);
}

function formatNumber(value: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "---";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatSigned(value: number, maxFractionDigits = 4): string {
  if (!Number.isFinite(value)) return "---";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, maxFractionDigits)}`;
}

function getOrCreateUserId(): string {
  const fresh = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `user-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  try {
    const existing = window.localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const generated = fresh();
    window.localStorage.setItem(USER_ID_KEY, generated);
    return generated;
  } catch {
    return fresh();
  }
}

function describeRequestError(error: unknown, fallbackAction: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item: { msg?: string; loc?: unknown[] }) => {
          const field = Array.isArray(item.loc)
            ? item.loc[item.loc.length - 1]
            : undefined;
          return field && item.msg ? `${field}: ${item.msg}` : item.msg;
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
    if (error.response) {
      return `Server returned ${error.response.status} with no error detail. Check the backend logs.`;
    }
    return "Could not reach the backend. Check that the server is running and CORS allows this origin.";
  }
  return `Could not ${fallbackAction} — an unexpected error occurred.`;
}

export default function App() {
  const [userId] = useState<string>(getOrCreateUserId);

  const [pool, setPool] = useState<PoolState | null>(null);
  const [activeTab, setActiveTab] = useState<WorkstationTab>("swap");

  // --- swap state ---
  const [tokenIn, setTokenIn] = useState<"A" | "B">("A");
  const [amountIn, setAmountIn] = useState<string>("");
  const [slippagePct, setSlippagePct] = useState<string>("0.5");
  const [swapReceipt, setSwapReceipt] = useState<SwapResponse | null>(null);
  const [swapLoading, setSwapLoading] = useState<boolean>(false);
  const [swapError, setSwapError] = useState<string>("");

  // --- liquidity state ---
  const [liquidityMode, setLiquidityMode] = useState<"add" | "remove">("add");
  const [depositAmountA, setDepositAmountA] = useState<string>("");
  const [sharesToBurn, setSharesToBurn] = useState<string>("");
  const [liquidityLoading, setLiquidityLoading] = useState<boolean>(false);
  const [liquidityError, setLiquidityError] = useState<string>("");
  const [liquidityReceipt, setLiquidityReceipt] = useState<
    AddLiquidityResponse | RemoveLiquidityResponse | null
  >(null);

  // --- position / IL state ---
  const [position, setPosition] = useState<PositionResponse | null>(null);
  const [positionLoading, setPositionLoading] = useState<boolean>(true);
  const [positionError, setPositionError] = useState<string>("");
  const [hasPosition, setHasPosition] = useState<boolean>(false);

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [poolError, setPoolError] = useState<string>("");

  const [priceHistory, setPriceHistory] = useState<PricePoint[]>(() => [
    { time: "Init", timestamp: Date.now(), price: 2000.0 },
  ]);

  const fetchSeqRef = useRef(0);

  const fetchPoolState = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const response = await axios.get<PoolState>(`${BACKEND_URL}/pool`);
      if (seq !== fetchSeqRef.current) return;

      setPool(response.data);
      setPoolError("");

      const now = Date.now();
      const label = new Date(now).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setPriceHistory((prev) => {
        const next = [
          ...prev,
          { time: label, timestamp: now, price: response.data.price_a },
        ];
        return next.length > MAX_PRICE_HISTORY
          ? next.slice(-MAX_PRICE_HISTORY)
          : next;
      });
    } catch (error) {
      if (seq !== fetchSeqRef.current) return;
      console.error("Backend connection error:", error);
      setPoolError("Could not connect to your Python server.");
    }
  }, []);

  const fetchPosition = useCallback(
    async (showLoadingState: boolean = true) => {
      if (showLoadingState) {
        setPositionLoading(true);
        setPositionError("");
      }
      try {
        const response = await axios.get<PositionResponse>(
          `${BACKEND_URL}/position/${userId}`,
        );
        setPosition(response.data);
        setHasPosition(true);
        setPositionError("");
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setPosition(null);
          setHasPosition(false);
        } else {
          console.error("Position fetch error:", error);
          setPositionError("Could not load your position.");
        }
      } finally {
        setPositionLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialData() {
      const results = await Promise.allSettled([
        fetchPoolState(),
        fetchPosition(false),
      ]);
      if (isCancelled) return;
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Initial data load failed:", result.reason);
        }
      }
    }

    void loadInitialData();

    return () => {
      isCancelled = true;
    };
  }, [fetchPoolState, fetchPosition]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPoolState(), fetchPosition()]);
    setRefreshing(false);
  };

  // --- swap logic ---
  const parsedAmount = parseFloat(amountIn);
  const estimate = useMemo(() => {
    if (!pool || !Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return null;
    const [reserveIn, reserveOut] =
      tokenIn === "A"
        ? [pool.reserve_a, pool.reserve_b]
        : [pool.reserve_b, pool.reserve_a];
    const out = quoteOutput(parsedAmount, reserveIn, reserveOut);
    const slip = parseFloat(slippagePct);
    const minReceived = Number.isFinite(slip) ? out * (1 - slip / 100) : out;
    return { estimatedOut: out, minReceived, reserveIn, reserveOut };
  }, [pool, parsedAmount, tokenIn, slippagePct]);

  const insufficientLiquidity =
    Number.isFinite(parsedAmount) && parsedAmount > 0 && estimate
      ? parsedAmount > estimate.reserveIn * 0.5
      : false;

  const amountIsValid =
    amountIn.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountIsValid || !pool) return;

    setSwapLoading(true);
    setSwapError("");
    try {
      const response = await axios.post<SwapResponse>(
        `${BACKEND_URL}/swap`,
        null,
        { params: { token_in: tokenIn, amount_in: parsedAmount } },
      );

      if (estimate) {
        const slip = parseFloat(slippagePct);
        const minAcceptable = Number.isFinite(slip)
          ? estimate.estimatedOut * (1 - slip / 100)
          : 0;
        if (response.data.received < minAcceptable) {
          setSwapError(
            `Trade executed but received less than your ${slippagePct}% slippage tolerance allowed. Received ${formatNumber(response.data.received, 4)}, expected at least ${formatNumber(minAcceptable, 4)}.`,
          );
        }
      }

      setSwapReceipt(response.data);
      setAmountIn("");
      await Promise.all([fetchPoolState(), fetchPosition()]);
    } catch (error: unknown) {
      console.error("Transaction failed:", error);
      setSwapError(describeRequestError(error, "execute the swap"));
    } finally {
      setSwapLoading(false);
    }
  };

  // --- liquidity logic ---
  const parsedDepositA = parseFloat(depositAmountA);
  const depositIsValid =
    depositAmountA.trim() !== "" &&
    Number.isFinite(parsedDepositA) &&
    parsedDepositA > 0;

  const depositPreview = useMemo(() => {
    if (!pool || !depositIsValid) return null;
    const ratio = pool.reserve_b / pool.reserve_a;
    const requiredB = parsedDepositA * ratio;
    const sharesMinted = pool.total_shares * (parsedDepositA / pool.reserve_a);
    return { requiredB, sharesMinted };
  }, [pool, depositIsValid, parsedDepositA]);

  const parsedSharesToBurn = parseFloat(sharesToBurn);
  const myShares = position?.shares ?? 0;
  const burnIsValid =
    sharesToBurn.trim() !== "" &&
    Number.isFinite(parsedSharesToBurn) &&
    parsedSharesToBurn > 0 &&
    parsedSharesToBurn <= myShares;

  const removePreview = useMemo(() => {
    if (!pool || !burnIsValid) return null;
    const ownershipPct = parsedSharesToBurn / pool.total_shares;
    return {
      returnedA: pool.reserve_a * ownershipPct,
      returnedB: pool.reserve_b * ownershipPct,
    };
  }, [pool, burnIsValid, parsedSharesToBurn]);

  const handleAddLiquidity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositIsValid) return;

    setLiquidityLoading(true);
    setLiquidityError("");
    try {
      const response = await axios.post<AddLiquidityResponse>(
        `${BACKEND_URL}/liquidity/add`,
        null,
        { params: { amount_a: parsedDepositA, user_id: userId } },
      );
      setLiquidityReceipt(response.data);
      setDepositAmountA("");
      await Promise.all([fetchPoolState(), fetchPosition()]);
    } catch (error: unknown) {
      console.error("Add liquidity failed:", error);
      setLiquidityError(describeRequestError(error, "add liquidity"));
    } finally {
      setLiquidityLoading(false);
    }
  };

  const handleRemoveLiquidity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!burnIsValid) return;

    setLiquidityLoading(true);
    setLiquidityError("");
    try {
      const response = await axios.post<RemoveLiquidityResponse>(
        `${BACKEND_URL}/liquidity/remove`,
        null,
        { params: { shares_to_burn: parsedSharesToBurn, user_id: userId } },
      );
      setLiquidityReceipt(response.data);
      setSharesToBurn("");
      await Promise.all([fetchPoolState(), fetchPosition()]);
    } catch (error: unknown) {
      console.error("Remove liquidity failed:", error);
      setLiquidityError(describeRequestError(error, "remove liquidity"));
    } finally {
      setLiquidityLoading(false);
    }
  };

  const tabs: {
    id: WorkstationTab;
    label: string;
    icon: typeof ArrowDownUp;
  }[] = [
    { id: "swap", label: "Swap", icon: ArrowDownUp },
    { id: "liquidity", label: "Liquidity", icon: Droplets },
    { id: "position", label: "My Position", icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8">
        {/* 1. APPLICATION HEADER */}
        <header className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-50 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-4">
            
            {/* Logo & Platform Name */}
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-md font-bold tracking-tight text-white leading-none">Practice Hub</h1>
                <span className="text-[10px] text-slate-500 font-medium font-mono uppercase tracking-wider">AMM Simulator v1.0.0</span>
              </div>
            </div>

            {/* Right Action Bar & Network Status */}
            <div className="flex items-center gap-3">
              {/* Live Environment Simulation Badge */}
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-400 font-mono font-medium">Local-Sandbox Engine</span>
              </div>

              {/* Simulated Active Account Identity Key */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs font-mono flex items-center gap-2 max-w-35 sm:max-w-none">
                <User size={13} className="text-blue-400 shrink-0" />
                <span className="text-slate-300 truncate">
                  {userId ? `ID: ${userId.substring(0, 8)}` : "Connecting..."}
                </span>
              </div>
            </div>

          </div>
        </header>
        <header className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-linear-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Liquidity Pool Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Constant Product AMM Engine (x · y = k)
            </p>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-all flex items-center gap-2 text-sm text-slate-300 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />{" "}
            Refresh
          </button>
        </header>

        {poolError && (
          <div className="bg-red-950 border border-red-500/50 text-red-200 p-4 rounded-xl text-sm flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" /> {poolError}
          </div>
        )}

        {/* STATISTICS GRID */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
              <span className="truncate">Token A Reserve</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">
              {pool ? formatNumber(pool.reserve_a) : "---"}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="truncate">Token B Reserve</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">
              {pool ? formatNumber(pool.reserve_b) : "---"}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Layers size={14} className="text-purple-400 shrink-0" />
              <span className="truncate">Total LP Shares</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold">
              {pool ? formatNumber(pool.total_shares) : "---"}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl bg-linear-to-br from-slate-900 to-blue-950/20">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <TrendingUp size={14} className="text-blue-400 shrink-0" />
              <span className="truncate">Spot Price (B/A)</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-400">
              {pool ? `${pool.price_a.toFixed(2)} B` : "---"}
            </div>
          </div>
        </section>

        {/* LIVE GRAPH VISUALIZER */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-3 sm:p-6 shadow-xl">
          <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
            <ChartIcon size={18} className="text-emerald-400 shrink-0" />
            <span>Token A Price Chart (Denominated in B)</span>
          </h2>
          <div className="h-48 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={priceHistory}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "12px",
                    color: "#f8fafc",
                  }}
                  labelStyle={{ color: "#94a3b8", fontSize: "12px" }}
                  formatter={(value) => [
                    value === undefined ||
                    value === null ||
                    Array.isArray(value)
                      ? ""
                      : Number(value).toFixed(4),
                    "Price",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPrice)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* WORKSTATION TABS */}
        <div className="flex gap-1 overflow-y-hidden sm:gap-2 border-b border-slate-800 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer -mb-px whitespace-nowrap ${
                  isActive
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon size={16} />
                <span className="hidden xs:inline sm:inline">{tab.label}</span>
                <span className="xs:hidden sm:hidden">{tab.label}</span>
                {tab.id === "position" && hasPosition && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* SWAP TAB */}
        {activeTab === "swap" && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl">
              <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
                <ArrowDownUp size={18} className="text-blue-400" /> Swap
                Interface
              </h2>

              {swapError && (
                <div className="bg-red-950 border border-red-500/50 text-red-200 p-3 rounded-xl text-sm mb-4 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />{" "}
                  <span>{swapError}</span>
                </div>
              )}

              <form onSubmit={handleSwap} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">
                    From
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTokenIn("A")}
                      className={`p-3 rounded-xl font-semibold border text-sm transition-all cursor-pointer ${
                        tokenIn === "A"
                          ? "bg-blue-600/20 border-blue-500 text-blue-400"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      Token A
                    </button>
                    <button
                      type="button"
                      onClick={() => setTokenIn("B")}
                      className={`p-3 rounded-xl font-semibold border text-sm transition-all cursor-pointer ${
                        tokenIn === "B"
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      Token B
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">
                    Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={amountIn}
                      onChange={(e) => setAmountIn(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-lg font-medium focus:outline-none focus:border-blue-500 text-white pr-24"
                      required
                    />
                    <span className="absolute right-4 top-4 font-bold text-slate-500 text-sm">
                      Token {tokenIn}
                    </span>
                  </div>
                  {amountIn.trim() !== "" && !amountIsValid && (
                    <p className="text-xs text-red-400 mt-1.5">
                      Enter a valid positive amount.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">
                    Max slippage
                  </label>
                  {/* FIX: 2-col on mobile, 4-col on sm+ */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["0.1", "0.5", "1.0"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSlippagePct(preset)}
                        className={`p-2.5 rounded-xl font-medium text-sm border transition-all cursor-pointer ${
                          slippagePct === preset
                            ? "bg-blue-600/20 border-blue-500 text-blue-400"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={slippagePct}
                      onChange={(e) => setSlippagePct(e.target.value)}
                      placeholder="Custom"
                      className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-center font-medium focus:outline-none focus:border-blue-500 text-white"
                    />
                  </div>
                </div>

                {estimate && amountIsValid && (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">
                        Estimated received
                      </span>
                      <span className="font-semibold text-white text-right">
                        ≈ {formatNumber(estimate.estimatedOut, 4)} Token{" "}
                        {tokenIn === "A" ? "B" : "A"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">
                        Min received ({slippagePct || "0"}%)
                      </span>
                      <span className="font-medium text-slate-300 text-right">
                        {formatNumber(estimate.minReceived, 4)} Token{" "}
                        {tokenIn === "A" ? "B" : "A"}
                      </span>
                    </div>
                    {insufficientLiquidity && (
                      <div className="flex items-start gap-1.5 text-amber-400 text-xs pt-1">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>
                          This trade is large relative to pool reserves — expect
                          significant price impact.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={swapLoading || !amountIsValid || !pool}
                  className="w-full bg-linear-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer text-center"
                >
                  {swapLoading ? "Executing Trade..." : "Swap Tokens"}
                </button>
              </form>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-4 sm:p-6 md:flex md:flex-col md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4 flex items-center gap-1.5">
                  <History size={14} /> Transaction Result
                </h3>

                {swapReceipt ? (
                  <div className="space-y-4">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-center">
                      <span className="text-xs text-emerald-400 font-bold uppercase tracking-wide">
                        Status: {swapReceipt.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between border-b border-slate-800 pb-2">
                        <span className="text-slate-400">Deposited</span>
                        <span className="font-semibold text-white">
                          {formatNumber(swapReceipt.sent, 4)} Token{" "}
                          {swapReceipt.swapped}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-2">
                        <span className="text-slate-400">Received</span>
                        <span className="font-bold text-emerald-400">
                          +{formatNumber(swapReceipt.received, 4)} Token{" "}
                          {swapReceipt.swapped === "A" ? "B" : "A"}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-slate-500 text-xs font-mono">
                          AMM protocol fee (0.3%)
                        </span>
                        <span className="text-slate-400 text-xs">
                          {formatNumber(swapReceipt.fee_paid, 4)}{" "}
                          {swapReceipt.swapped}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 sm:py-12 text-slate-600 text-sm border border-dashed border-slate-800 rounded-2xl">
                    Run a swap execution to stream a ledger entry block.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* LIQUIDITY TAB */}
        {activeTab === "liquidity" && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl">
              <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
                <Droplets size={18} className="text-blue-400" /> Liquidity
              </h2>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setLiquidityMode("add")}
                  className={`p-3 rounded-xl font-semibold border text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    liquidityMode === "add"
                      ? "bg-blue-600/20 border-blue-500 text-blue-400"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Plus size={14} /> Add liquidity
                </button>
                <button
                  type="button"
                  onClick={() => setLiquidityMode("remove")}
                  className={`p-3 rounded-xl font-semibold border text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    liquidityMode === "remove"
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Minus size={14} /> Remove liquidity
                </button>
              </div>

              {liquidityError && (
                <div className="bg-red-950 border border-red-500/50 text-red-200 p-3 rounded-xl text-sm mb-4 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />{" "}
                  <span>{liquidityError}</span>
                </div>
              )}

              {liquidityMode === "add" ? (
                <form onSubmit={handleAddLiquidity} className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">
                      Deposit Token A
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={depositAmountA}
                        onChange={(e) => setDepositAmountA(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-lg font-medium focus:outline-none focus:border-blue-500 text-white pr-24"
                        required
                      />
                      <span className="absolute right-4 top-4 font-bold text-slate-500 text-sm">
                        Token A
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      Pools need both tokens at the current ratio — the matching
                      Token B amount is calculated automatically.
                    </p>
                  </div>

                  {depositPreview && (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 shrink-0">
                          Required Token B
                        </span>
                        <span className="font-semibold text-white text-right">
                          {formatNumber(depositPreview.requiredB, 4)} Token B
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 shrink-0">
                          LP shares minted
                        </span>
                        <span className="font-medium text-slate-300 text-right">
                          ≈ {formatNumber(depositPreview.sharesMinted, 4)}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={liquidityLoading || !depositIsValid || !pool}
                    className="w-full bg-linear-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer text-center"
                  >
                    {liquidityLoading ? "Depositing..." : "Add liquidity"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRemoveLiquidity} className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase">
                      Shares to remove
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max={myShares}
                        value={sharesToBurn}
                        onChange={(e) => setSharesToBurn(e.target.value)}
                        placeholder="0.00"
                        disabled={!hasPosition}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-lg font-medium focus:outline-none focus:border-blue-500 text-white disabled:opacity-40 pr-24"
                        required
                      />
                      <span className="absolute right-4 top-4 font-bold text-slate-500 text-sm">
                        Shares
                      </span>
                    </div>
                    {!hasPosition ? (
                      <p className="text-xs text-slate-500 mt-1.5">
                        You don't have a liquidity position yet — add liquidity
                        first.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1.5">
                        You hold {formatNumber(myShares, 4)} shares.{" "}
                        <button
                          type="button"
                          onClick={() => setSharesToBurn(String(myShares))}
                          className="text-blue-400 hover:text-blue-300 cursor-pointer underline"
                        >
                          Use max
                        </button>
                      </p>
                    )}
                  </div>

                  {removePreview && (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 shrink-0">
                          You'll receive
                        </span>
                        <span className="font-semibold text-white text-right">
                          {formatNumber(removePreview.returnedA, 4)} A +{" "}
                          {formatNumber(removePreview.returnedB, 4)} B
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={liquidityLoading || !burnIsValid}
                    className="w-full bg-linear-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer text-center"
                  >
                    {liquidityLoading ? "Withdrawing..." : "Remove liquidity"}
                  </button>
                </form>
              )}
            </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-4 sm:p-6 md:flex md:flex-col md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4 flex items-center gap-1.5">
                  <History size={14} /> Result
                </h3>

                {liquidityReceipt ? (
                  "lp_shares_minted" in liquidityReceipt ? (
                    <div className="space-y-2 text-sm">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-center mb-2">
                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-wide">
                          {liquidityReceipt.status}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-2">
                        <span className="text-slate-400">Token A in</span>
                        <span className="font-semibold text-white">
                          {formatNumber(liquidityReceipt.added_token_a, 4)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-2">
                        <span className="text-slate-400">Token B in</span>
                        <span className="font-semibold text-white">
                          {formatNumber(liquidityReceipt.required_token_b, 4)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-slate-400">Shares minted</span>
                        <span className="font-bold text-emerald-400">
                          +{formatNumber(liquidityReceipt.lp_shares_minted, 4)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-center mb-2">
                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-wide">
                          {liquidityReceipt.status}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-2">
                        <span className="text-slate-400">Shares burned</span>
                        <span className="font-semibold text-white">
                          {formatNumber(liquidityReceipt.shares_burned, 4)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-2">
                        <span className="text-slate-400">Token A back</span>
                        <span className="font-bold text-emerald-400">
                          +{formatNumber(liquidityReceipt.returned_token_a, 4)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-slate-400">Token B back</span>
                        <span className="font-bold text-emerald-400">
                          +{formatNumber(liquidityReceipt.returned_token_b, 4)}
                        </span>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center py-8 sm:py-12 text-slate-600 text-sm border border-dashed border-slate-800 rounded-2xl">
                    Deposit or withdraw to see a ledger entry here.
                  </div>
                )}


              </div>
            </div>
          </section>
        )}

        {/* POSITION TAB */}
        {activeTab === "position" && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl">
            <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
              <Wallet size={18} className="text-purple-400" /> My Position
            </h2>

            {positionError && (
              <div className="bg-red-950 border border-red-500/50 text-red-200 p-3 rounded-xl text-sm mb-4 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />{" "}
                <span>{positionError}</span>
              </div>
            )}

            {positionLoading && !position && (
              <div className="text-center py-12 text-slate-500 text-sm">
                Loading your position...
              </div>
            )}

            {!positionLoading && !hasPosition && (
              <div className="text-center py-12 text-slate-600 text-sm border border-dashed border-slate-800 rounded-2xl">
                You haven't added liquidity yet. Switch to the Liquidity tab to
                become a pool provider and start tracking your position.
              </div>
            )}

            {position && (
              <div className="space-y-6">
                {/* FIX: 1-col → 2-col → 3-col */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      Pool ownership
                    </div>
                    <div className="text-2xl font-bold">
                      {formatNumber(position.ownership_pct, 4)}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {formatNumber(position.shares, 4)} LP shares
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      Current value (in B)
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {formatNumber(position.current_value_in_b, 2)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {formatNumber(position.current_value_a, 4)} A +{" "}
                      {formatNumber(position.current_value_b, 4)} B
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border sm:col-span-2 md:col-span-1 ${
                      position.impermanent_loss_pct < 0
                        ? "bg-red-950/40 border-red-500/30"
                        : "bg-emerald-950/40 border-emerald-500/30"
                    }`}
                  >
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      Impermanent loss
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        position.impermanent_loss_pct < 0
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {formatSigned(position.impermanent_loss_pct, 4)}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      vs. holding the original deposit
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">
                    What this means
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2 flex-wrap">
                      <span className="text-slate-400">
                        Deposited originally
                      </span>
                      <span className="text-slate-300 text-right">
                        {formatNumber(position.deposited_amount_a, 4)} A +{" "}
                        {formatNumber(position.deposited_amount_b, 4)} B
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 flex-wrap">
                      <span className="text-slate-400">
                        Worth today if held (not pooled)
                      </span>
                      <span className="text-slate-300 text-right">
                        {formatNumber(position.hold_value_in_b, 2)} (in B)
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 flex-wrap border-t border-slate-800 pt-2">
                      <span className="text-slate-400">
                        Worth today, pooled
                      </span>
                      <span className="text-slate-300 text-right">
                        {formatNumber(position.current_value_in_b, 2)} (in B)
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                    Impermanent loss compares pooling against simply holding
                    your original tokens — it isn't your total profit or loss.
                    Trading fees you've earned as a liquidity provider are baked
                    into the pool's reserves and aren't broken out separately
                    here, so a negative IL doesn't necessarily mean you're worse
                    off overall once fees are counted.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* EXPLANATORY DOCUMENT BLOCK (BUILT-IN APP GUIDE) */}
        <section className="bg-linear-to-b from-slate-900 to-slate-950 border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-2xl mt-12">
          <div className="border-b border-slate-800 pb-4 mb-4">
            <h3 className="text-md font-bold tracking-wide text-blue-400 uppercase flex items-center gap-2">
              💡 Simulator Core Mechanics Explainer
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">How this Automated Market Maker calculates values dynamically in real-time</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
                1. The Constant Product Invariant
              </h4>
              <p className="text-slate-400 leading-relaxed text-xs">
                This pool uses Vitalik Buterin's classic equation: <code className="text-blue-400 bg-slate-950 px-1 py-0.5 rounded font-mono">x * y = k</code>. 
                The total liquidity constant multiplier (<code className="text-slate-300 font-mono">k</code>) must remain fixed during trades. When you buy Token A, its reserve decreases, causing its price to go up automatically to satisfy the system formula.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
                2. Symmetrical LP Provision
              </h4>
              <p className="text-slate-400 leading-relaxed text-xs">
                When adding liquidity, assets must match the exact pre-existing ratio of the pool (<code className="text-slate-300 font-mono">reserve_b / reserve_a</code>). 
                This ensures your deposit changes the size of the pool without creating structural price spikes or arbitrage extraction paths for trading bots.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
                3. Impermanent Loss Risk
              </h4>
              <p className="text-slate-400 leading-relaxed text-xs">
                If the price of assets diverges heavily from the ratio when you deposited them, your portfolio balance changes as traders swap against the pool. 
                Your total value inside the pool might become lower than if you had simply held the individual tokens inside a cold-storage wallet.
              </p>
            </div>
          </div>
        </section>

        {/* 3. APPLICATION FOOTER */}
        <footer className="w-full border-t border-slate-800/50 mt-16 px-4 py-8 text-xs text-slate-500">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start justify-between gap-6">

            <div className="max-w-xs">
              <p className="text-slate-300 font-semibold text-sm mb-1">BitPool</p>
              <p className="leading-relaxed">
                A constant product AMM simulator. Swap tokens, provide liquidity, and watch impermanent loss play out in real time — built with React, TypeScript & Python.
              </p>
            </div>

            <p className="text-slate-600 sm:self-end">© Lara 2026. All rights reserved.</p>

          </div>
        </footer>
      
      </div>
    </div>
  );
}
