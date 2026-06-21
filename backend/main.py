from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import SessionLocal, PoolModel, TransactionModel, init_db

app = FastAPI(title="Liquidity Pool Simulator API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], # Allows any frontend location to connect for now
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



@app.get("/pool")
def get_pool_state(db: Session = Depends(get_db)):
    pool = db.query(PoolModel).first()
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not initialized")
    
    price_a = pool.reserve_b / pool.reserve_a
    
    return {
        "reserve_a": pool.reserve_a,
        "reserve_b": pool.reserve_b,
        "total_shares": pool.total_shares,
        "price_a": price_a
    }


@app.post("/swap")
def execute_swap(token_in: str, amount_in: float, db: Session = Depends(get_db)):
    if amount_in <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
        
    pool = db.query(PoolModel).first()
    
    
    if token_in.upper() == "A":
        reserve_in, reserve_out = pool.reserve_a, pool.reserve_b
    elif token_in.upper() == "B":
        reserve_in, reserve_out = pool.reserve_b, pool.reserve_a
    else:
        raise HTTPException(status_code=400, detail="Invalid token selection. Choose 'A' or 'B'.")

    
    fee = amount_in * 0.003
    clean_amount_in = amount_in - fee
    
    new_reserve_in = reserve_in + clean_amount_in
    new_reserve_out = (reserve_in * reserve_out) / new_reserve_in
    amount_out = reserve_out - new_reserve_out
    
    
    if amount_out >= reserve_out:
        raise HTTPException(status_code=400, detail="Inadequate pool depth for this swap scale")

    
    if token_in.upper() == "A":
        pool.reserve_a = pool.reserve_a + amount_in # Entire amount (including fee) stays in pool!
        pool.reserve_b = pool.reserve_b - amount_out
    else:
        pool.reserve_b = pool.reserve_b + amount_in
        pool.reserve_a = pool.reserve_a - amount_out

    
    log_entry = TransactionModel(
        action_type="SWAP",
        token_in=token_in.upper(),
        amount_in=amount_in,
        amount_out=amount_out
    )
    db.add(log_entry)
    db.commit()
    
    return {
        "status": "Success",
        "swapped": token_in.upper(),
        "sent": amount_in,
        "received": amount_out,
        "fee_paid": fee
    }
    

@app.post("/liquidity/add")
def add_liquidity(amount_a: float, db: Session = Depends(get_db)):
    if amount_a <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
        
    pool = db.query(PoolModel).first()
    
    
    current_price_ratio = pool.reserve_b / pool.reserve_a
    required_amount_b = amount_a * current_price_ratio
    
    shares_minted = pool.total_shares * (amount_a / pool.reserve_a)
    
    pool.reserve_a += amount_a
    pool.reserve_b += required_amount_b
    pool.total_shares += shares_minted
    
    log_entry = TransactionModel(
        action_type="ADD_LIQUIDITY",
        amount_in=amount_a,    # Storing amount of Token A added
        amount_out=shares_minted  # Storing the LP shares minted back to them
    )
    db.add(log_entry)
    db.commit()
    
    return {
        "status": "Liquidity Added Successfully",
        "added_token_a": amount_a,
        "required_token_b": required_amount_b,
        "lp_shares_minted": shares_minted,
        "new_total_shares": pool.total_shares
    }

@app.post("/liquidity/remove")
def remove_liquidity(shares_to_burn: float, db: Session = Depends(get_db)):
    pool = db.query(PoolModel).first()
    
    if shares_to_burn <= 0 or shares_to_burn > pool.total_shares:
        raise HTTPException(status_code=400, detail="Invalid share amount to burn")
        
    ownership_percentage = shares_to_burn / pool.total_shares
    
    reclaimed_a = pool.reserve_a * ownership_percentage
    reclaimed_b = pool.reserve_b * ownership_percentage
    
    pool.reserve_a -= reclaimed_a
    pool.reserve_b -= reclaimed_b
    pool.total_shares -= shares_to_burn
    
    log_entry = TransactionModel(
        action_type="REMOVE_LIQUIDITY",
        amount_in=shares_to_burn,
        amount_out=reclaimed_a  # Tracking assets returned
    )
    db.add(log_entry)
    db.commit()
    
    return {
        "status": "Liquidity Removed Successfully",
        "shares_burned": shares_to_burn,
        "returned_token_a": reclaimed_a,
        "returned_token_b": reclaimed_b,
        "remaining_total_shares": pool.total_shares
    }
    

@app.get("/history")
def get_history(db: Session = Depends(get_db)):
    transactions = db.query(TransactionModel).order_by(TransactionModel.id.asc()).all()
    
    history_data = []
    current_price = 2000.0 # Starting spot price
    
    history_data.append({"id": 0, "action": "INITIAL", "price": current_price})
    
    for tx in transactions:
        if tx.action_type == "SWAP":
            pass
            
    return [{
        "id": tx.id,
        "action": tx.action_type,
        "amount_in": tx.amount_in,
        "amount_out": tx.amount_out,
        "timestamp": tx.timestamp.strftime("%H:%M:%S") if tx.timestamp else ""
    } for tx in transactions]