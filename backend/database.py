from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime, timezone
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./simulator.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class PoolModel(Base):
    __tablename__ = "pools"

    id = Column(Integer, primary_key=True, index=True)
    reserve_a = Column(Float, default=1000.0)      # Starting amount of Token A
    reserve_b = Column(Float, default=2000000.0)   # Starting amount of Token B
    total_shares = Column(Float, default=1000.0)   # Initial LP ownership shares


class TransactionModel(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    action_type = Column(String)                    # "SWAP", "ADD_LIQUIDITY", "REMOVE_LIQUIDITY"
    token_in = Column(String, nullable=True)        # "A" or "B" (only for swaps)
    amount_in = Column(Float)
    amount_out = Column(Float)
    
    reserve_a_after = Column(Float)
    reserve_b_after = Column(Float)
    total_shares_after = Column(Float)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PositionModel(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)          
    shares = Column(Float, default=0.0)             
    
    deposited_amount_a = Column(Float, default=0.0)
    deposited_amount_b = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        if db.query(PoolModel).first() is None:
            db.add(PoolModel())
            db.commit()
    finally:
        db.close()