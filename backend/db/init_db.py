from backend.db.session import engine
from backend.db.models import Base

def init_db():
    print("Initializing the database...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")

if __name__ == "__main__":
    init_db()
