from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone

DATABASE_URL = "sqlite:///./simulator.db"

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
    action_type = Column(String)                   # "SWAP", "ADD_LIQUIDITY", "REMOVE_LIQUIDITY"
    token_in = Column(String, nullable=True)       # "A" or "B" (Only for swaps)
    amount_in = Column(Float)
    amount_out = Column(Float)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
def init_db():
    Base.metadata.create_all(bind=engine)