import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import SessionLocal, PoolModel, TransactionModel, PositionModel, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    

app = FastAPI(title="Liquidity Pool Simulator API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://bitpool-tz4i.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_pool_or_404(db: Session) -> PoolModel:
    pool = db.query(PoolModel).first()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not initialized")
    return pool


def log_transaction(
    db: Session,
    pool: PoolModel,
    action_type: str,
    amount_in: float,
    amount_out: float,
    token_in: str | None = None,
) -> None:
    db.add(
        TransactionModel(
            action_type=action_type,
            token_in=token_in,
            amount_in=amount_in,
            amount_out=amount_out,
            reserve_a_after=pool.reserve_a,
            reserve_b_after=pool.reserve_b,
            total_shares_after=pool.total_shares,
        )
    )


@app.get("/pool")
def get_pool_state(db: Session = Depends(get_db)):
    pool = get_pool_or_404(db)
    price_a = pool.reserve_b / pool.reserve_a

    return {
        "reserve_a": pool.reserve_a,
        "reserve_b": pool.reserve_b,
        "total_shares": pool.total_shares,
        "price_a": price_a,
    }


@app.post("/swap")
def execute_swap(token_in: str, amount_in: float, db: Session = Depends(get_db)):
    if amount_in <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    pool = get_pool_or_404(db)
    token_in_clean = token_in.strip().upper()

    if token_in_clean == "A":
        reserve_in, reserve_out = pool.reserve_a, pool.reserve_b
    elif token_in_clean == "B":
        reserve_in, reserve_out = pool.reserve_b, pool.reserve_a
    else:
        raise HTTPException(status_code=400, detail="Invalid token selection. Choose 'A' or 'B'.")

    fee = amount_in * 0.003
    pricing_amount_in = amount_in - fee

    new_reserve_in = reserve_in + pricing_amount_in
    new_reserve_out = (reserve_in * reserve_out) / new_reserve_in
    amount_out = reserve_out - new_reserve_out

    if amount_out >= reserve_out:
        raise HTTPException(status_code=400, detail="Inadequate pool depth for this swap scale")

    if token_in_clean == "A":
        pool.reserve_a = pool.reserve_a + amount_in  # full amount, fee included, stays in pool
        pool.reserve_b = pool.reserve_b - amount_out
    else:
        pool.reserve_b = pool.reserve_b + amount_in
        pool.reserve_a = pool.reserve_a - amount_out

    log_transaction(db, pool, "SWAP", amount_in, amount_out, token_in=token_in_clean)
    db.commit()

    return {
        "status": "Success",
        "swapped": token_in_clean,
        "sent": amount_in,
        "received": amount_out,
        "fee_paid": fee,
    }


@app.post("/liquidity/add")
def add_liquidity(amount_a: float, user_id: str, db: Session = Depends(get_db)):
    if amount_a <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required to track your position")

    pool = get_pool_or_404(db)

    if pool.reserve_a <= 0 or pool.total_shares <= 0:
        raise HTTPException(
            status_code=400,
            detail="Pool reserves are empty and cannot be reseeded through this endpoint.",
        )

    current_price_ratio = pool.reserve_b / pool.reserve_a
    required_amount_b = amount_a * current_price_ratio
    shares_minted = pool.total_shares * (amount_a / pool.reserve_a)

    pool.reserve_a += amount_a
    pool.reserve_b += required_amount_b
    pool.total_shares += shares_minted

    position = (
        db.query(PositionModel)
        .filter(PositionModel.user_id == user_id)
        .first()
    )
    if position is None:
        position = PositionModel(
            user_id=user_id,
            shares=shares_minted,
            deposited_amount_a=amount_a,
            deposited_amount_b=required_amount_b,
        )
        db.add(position)
    else:
        position.shares += shares_minted
        position.deposited_amount_a += amount_a
        position.deposited_amount_b += required_amount_b

    log_transaction(db, pool, "ADD_LIQUIDITY", amount_a, shares_minted)
    db.commit()

    return {
        "status": "Liquidity Added Successfully",
        "added_token_a": amount_a,
        "required_token_b": required_amount_b,
        "lp_shares_minted": shares_minted,
        "new_total_shares": pool.total_shares,
    }


@app.post("/liquidity/remove")
def remove_liquidity(shares_to_burn: float, user_id: str, db: Session = Depends(get_db)):
    pool = get_pool_or_404(db)

    if shares_to_burn <= 0 or shares_to_burn >= pool.total_shares:
        raise HTTPException(status_code=400, detail="Invalid share amount to burn")

    position = (
        db.query(PositionModel)
        .filter(PositionModel.user_id == user_id)
        .first()
    )
    if position is None or position.shares < shares_to_burn:
        raise HTTPException(status_code=400, detail="You do not hold enough shares to remove this amount")

    ownership_percentage = shares_to_burn / pool.total_shares
    reclaimed_a = pool.reserve_a * ownership_percentage
    reclaimed_b = pool.reserve_b * ownership_percentage

    pool.reserve_a -= reclaimed_a
    pool.reserve_b -= reclaimed_b
    pool.total_shares -= shares_to_burn

    burn_fraction = shares_to_burn / position.shares
    position.deposited_amount_a -= position.deposited_amount_a * burn_fraction
    position.deposited_amount_b -= position.deposited_amount_b * burn_fraction
    position.shares -= shares_to_burn

    log_transaction(db, pool, "REMOVE_LIQUIDITY", shares_to_burn, reclaimed_a)
    db.commit()

    return {
        "status": "Liquidity Removed Successfully",
        "shares_burned": shares_to_burn,
        "returned_token_a": reclaimed_a,
        "returned_token_b": reclaimed_b,
        "remaining_total_shares": pool.total_shares,
    }


@app.get("/position/{user_id}")
def get_position(user_id: str, db: Session = Depends(get_db)):
    
    pool = get_pool_or_404(db)
    position = (
        db.query(PositionModel)
        .filter(PositionModel.user_id == user_id)
        .first()
    )
    if position is None or position.shares <= 0:
        raise HTTPException(status_code=404, detail="No active position for this user")

    price_a_now = pool.reserve_b / pool.reserve_a
    ownership_now = position.shares / pool.total_shares

    current_value_a = pool.reserve_a * ownership_now
    current_value_b = pool.reserve_b * ownership_now
    
    current_value_in_b = current_value_a * price_a_now + current_value_b


    hold_value_in_b = position.deposited_amount_a * price_a_now + position.deposited_amount_b

    impermanent_loss_pct = (
        ((current_value_in_b - hold_value_in_b) / hold_value_in_b) * 100
        if hold_value_in_b > 0
        else 0.0
    )

    return {
        "user_id": user_id,
        "shares": position.shares,
        "ownership_pct": ownership_now * 100,
        "deposited_amount_a": position.deposited_amount_a,
        "deposited_amount_b": position.deposited_amount_b,
        "current_value_a": current_value_a,
        "current_value_b": current_value_b,
        "current_value_in_b": current_value_in_b,
        "hold_value_in_b": hold_value_in_b,
        "impermanent_loss_pct": impermanent_loss_pct,
    }


@app.get("/history")
def get_history(db: Session = Depends(get_db)):
    
    transactions = db.query(TransactionModel).order_by(TransactionModel.id.asc()).all()

    history = []
    for tx in transactions:
        price_a = (
            tx.reserve_b_after / tx.reserve_a_after
            if tx.reserve_a_after else None
        )
        history.append({
            "id": tx.id,
            "action": tx.action_type,
            "token_in": tx.token_in,
            "amount_in": tx.amount_in,
            "amount_out": tx.amount_out,
            "reserve_a_after": tx.reserve_a_after,
            "reserve_b_after": tx.reserve_b_after,
            "price_a": price_a,
            "timestamp": tx.timestamp.strftime("%H:%M:%S") if tx.timestamp else "",
        })

    return history