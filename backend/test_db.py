from database import init_db, SessionLocal, PoolModel

print("Creating database and tables...")
init_db()
print("Database created successfully!")

db = SessionLocal()

if db.query(PoolModel).count() == 0:
    first_pool = PoolModel(reserve_a=1000.0, reserve_b=2000000.0, total_shares=1000.0)
    db.add(first_pool)
    db.commit()
    print("Initial liquidity pool inserted into SQLite!")
    
db.close()