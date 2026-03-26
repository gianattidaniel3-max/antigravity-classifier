from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

# Uses environment variable if inside docker, otherwise localhost for local testing
DATABASE_URL = os.getenv("DATABASE_URL")

# Check if we should use SQLite (default for local windows/mac without docker)
if not DATABASE_URL or DATABASE_URL.startswith("sqlite"):
    DB_PATH = os.path.join(os.path.dirname(__file__), "..", "app.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    # SQLite needs a different engine setup for concurrency
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # PostgreSQL setup
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Dependency injection to get DB session inline per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
