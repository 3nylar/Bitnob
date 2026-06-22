# 📊 Constant Product AMM Liquidity Pool Simulator

A localized prototype of a Decentralized Finance (DeFi) **Automated Market Maker (AMM)** trading terminal. This application simulates how a decentralized asset liquidity pool functions under the hood, matching live pricing metrics and tracking asset shifts using transactional history charts.

---

## 🚀 Architecture & Tech Stack

This project uses a decoupled client-server architecture:

* **Backend:** Python 3.11+ powered by **FastAPI** for high-performance async REST APIs, **SQLAlchemy ORM** for query building, and an **SQLite** database (`simulator.db`) for structural ledger state persistence.
* **Frontend:** **React (TypeScript)** built via the **Vite** compilation toolchain, beautifully styled with **Tailwind CSS**, and u# BitPool — Constant Product AMM Liquidity Pool Simulator

BitPool is a localized prototype of a Decentralized Finance (DeFi) **Automated Market Maker (AMM)** trading terminal. The application simulates how a decentralized asset liquidity pool functions under the hood, matching live pricing metrics and tracking asset shifts using transactional history charts.

---

## Scope decision: simulation only, no real assets (please read)

This prototype models pool mechanics as a **simulation, not a custodied exchange**. Reserve balances and swap outputs are calculated using the constant-product invariant (`x · y = k`) with a 0.3% protocol fee, and all state is persisted locally in SQLite - **no real tokens, wallets, private keys, or on-chain transactions are involved**. Building real asset custody, transaction signing, and on-chain broadcasting safely is out of scope for this delivery window; the value of the system is in a correct, well-tested **AMM math engine**, a real REST API, and a real-time UI. This is an intentional cut, not an oversight.

### Known tradeoff: price impact grows non-linearly with trade size

Because the pool enforces `x · y = k` strictly, large trades cause **disproportionate slippage** compared to small ones - this is correct AMM behaviour, not a bug. The spot price before and after a swap will differ; the UI displays both the expected output and the effective execution price so the user can observe price impact directly. The 0.3% fee is re-injected into reserves after every swap, so `k` grows over time as volume accumulates.

---

## Tech stack

| Layer | Choice |
|---|---|
| Backend | **FastAPI** (Python 3.11+) - async REST API with a lifespan context manager for DB init |
| ORM | **SQLAlchemy** (declarative models, `create_all()` on startup) |
| Database | **SQLite** (`simulator.db`) - local ledger for pool state and swap history |
| Frontend | **React (TypeScript)** compiled via **Vite** |
| Styling | **Tailwind CSS** |
| Charts | **Recharts** - live price and reserve visualizer |

---

## Features

- Initialize a liquidity pool with custom Token A and Token B reserve amounts.
- Swap tokens in either direction - pool reserves update instantly.
- Automatic **0.3% protocol fee** deducted from input and re-injected into reserves.
- Live **spot price** and **price impact** calculation per trade.
- **Swap history** chart tracking reserve shifts and execution prices over time.
- REST API for all pool operations - inspect and interact with the pool programmatically.

---

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- (Recommended) A Python virtual environment tool (`venv`)

### Project structure

```text
bitpool/
├── backend/
│   ├── main.py            # FastAPI application routes, CORS, & lifespan context
│   ├── database.py        # SQLAlchemy engine configs and model schemas
│   └── simulator.db       # SQLite transactional local database binary
└── frontend/
    ├── src/
    │   ├── App.tsx        # Main trading dashboard layout and state hub
    │   ├── index.css      # Tailwind core directives and global overrides
    │   └── main.tsx       # React client entry injection point
    ├── package.json       # Node package configurations
    └── vite.config.ts     # Vite compilation rules
```

### Step 1 — Run the backend (FastAPI)

Navigate to the backend directory, activate your virtual environment, and start the Uvicorn server:

```powershell
cd backend

# Activate the virtual environment (Windows)
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& .\venv\Scripts\Activate.ps1)

# Start the live-reload server
python -m uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

### Step 2 — Run the frontend (React + Vite)

In a second terminal, launch the Vite dev server:

```powershell
cd frontend
npm run dev
```

The trading dashboard will be available at `http://localhost:5173`.

---

## REST API

All endpoints return JSON. The base URL in development is `http://127.0.0.1:8000`.

| Method | Route | Notes |
|---|---|---|
| GET | `/pool` | current reserve state and spot price |
| POST | `/pool/init` | initialize pool with Token A and Token B reserves |
| POST | `/swap` | execute a swap; returns output amount and price impact |
| GET | `/history` | full swap transaction history |
| DELETE | `/pool/reset` | wipe pool state and history |

Example:

```bash
# Initialize a pool with 1000 Token A and 500 Token B
curl -X POST http://127.0.0.1:8000/pool/init \
  -H "Content-Type: application/json" \
  -d '{"reserve_a": 1000, "reserve_b": 500}'

# Swap 50 Token A for Token B
curl -X POST http://127.0.0.1:8000/swap \
  -H "Content-Type: application/json" \
  -d '{"token_in": "A", "amount_in": 50}'
```

---

## Schema changes

Since SQLite table schemas mapped via SQLAlchemy's `create_all()` are additive-only, structural modifications to models (e.g. adding columns to the swap log) require clearing the stale database binary:

```powershell
cd backend
del simulator.db
```

The FastAPI lifespan context manager will detect the missing file and generate a clean, seeded database layout on the next server start.

---

## Notable design decisions

- **Fee re-injection grows k** - the 0.3% fee is added back to reserves after every swap rather than extracted, so the invariant constant `k` increases with volume. This mirrors how liquidity providers earn yield in production AMMs.
- **Integer-safe math** - all reserve arithmetic uses Python's `Decimal` type internally to avoid floating-point drift across sequential swaps.
- **Additive-only schema** - `create_all()` never drops tables; destructive migrations are manual (delete `simulator.db`) to keep the dev loop fast.
- **CORS open in development** - the FastAPI app allows all origins in development mode. Restrict this before any public deployment.tilizing **Recharts** vectors for live price visualizer lines.

---

## 🧮 Core AMM Math Engine

The liquidity pool engine enforces the canonical **Constant Product Market Maker** invariant model popularized by decentralized protocols like Uniswap v2:

$$x \cdot y = k$$

Where:
* $x$ = `reserve_a` (The reserve balance of Token A)
* $y$ = `reserve_b` (The reserve balance of Token B)
* $k$ = The fixed geometric pool invariant constant

### ⚙️ Transaction Mechanics
* **Protocol Fee:** Every swap deducts a flat **0.3% structural execution fee** from the incoming token before calculating the trade output. This fee is automatically re-injected back into pool reserves, growing $k$ dynamically over time for liquidity providers.
* **Slippage & Price Impact:** Trade sizes shift pool reserves along the hyperbolic constant-product curve, dynamically causing the asset spot price to appreciate or depreciate depending on order size and depth.

---

## 📂 Project Directory Structure

```text
bitnob/
├── backend/
│   ├── main.py            # FastAPI application routes, CORS, & lifespan context
│   ├── database.py        # SQLAlchemy engine configs and model schemas
│   └── simulator.db       # SQLite transactional local database binary
└── frontend/
    ├── src/
    │   ├── App.tsx        # Main trading dashboard layout and state hub
    │   ├── index.css      # Tailwind core directives and number arrow global overrides
    │   └── main.tsx       # React client entry injection point
    ├── package.json       # Node package configurations
    └── vite.config.ts     # Vite compilation rules
```

---

## 🏁 Step-by-Step Installation & Setup

To run both modules simultaneously, open two independent terminals in your workspace:

### 🐍 Step 1: Run the Backend (FastAPI)

Navigate to the backend directory, activate your isolated virtual environment shell, and initialize the live Uvicorn engine:

```powershell
cd backend
# Activate the Virtual Environment
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& .\venv\Scripts\Activate.ps1)

# Start the live-reload Uvicorn server
python -m uvicorn main:app --reload
```

*The API gateway will establish connection lines locally at `http://127.0.0.1:8000`.*

### ⚛️ Step 2: Run the Frontend (React + Vite)

In your second terminal window, launch the Vite development compiler server to host the interactive trading console:

```powershell
cd frontend
# Launch the client dev pipeline
npm run dev
```

*The local development dashboard will launch at `http://localhost:5173`.*

---

## 🛠️ Schema Synchronization & Maintenance

Since SQLite table schemas mapped via SQLAlchemy's `create_all()` are additive-only, any upstream additions or structural modifications to models require clearing out stale dev artifacts:

If you modify structural schemas (e.g., adding column metrics to log tables), safely wipe the state with:

```powershell
cd backend
del simulator.db
```

The FastAPI lifespan context manager will automatically intercept missing bindings and generate a clean, seeded relational database layout on the next server reboot!