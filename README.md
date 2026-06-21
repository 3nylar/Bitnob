# 📊 Constant Product AMM Liquidity Pool Simulator

A localized prototype of a Decentralized Finance (DeFi) **Automated Market Maker (AMM)** trading terminal. This application simulates how a decentralized asset liquidity pool functions under the hood, matching live pricing metrics and tracking asset shifts using transactional history charts.

---

## 🚀 Architecture & Tech Stack

This project uses a decoupled client-server architecture:

* **Backend:** Python 3.11+ powered by **FastAPI** for high-performance async REST APIs, **SQLAlchemy ORM** for query building, and an **SQLite** database (`simulator.db`) for structural ledger state persistence.
* **Frontend:** **React (TypeScript)** built via the **Vite** compilation toolchain, beautifully styled with **Tailwind CSS**, and utilizing **Recharts** vectors for live price visualizer lines.

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