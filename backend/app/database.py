from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Engine configuration with automatic handling for PostgreSQL and SQLite
engine_kwargs = {"pool_pre_ping": True}
if "sqlite" in settings.DATABASE_URL:
    engine_kwargs = {"connect_args": {"check_same_thread": False}}

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator:
    """
    FastAPI dependency that provides a transactional database session.
    Closes the session cleanly after the request finishes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
