
from backend.db.session import engine
from sqlalchemy import text

SQL = [
    # 1. Users Table
    """
    CREATE TABLE IF NOT EXISTS users (
        id              VARCHAR PRIMARY KEY,
        email           VARCHAR NOT NULL UNIQUE,
        hashed_password VARCHAR NOT NULL,
        role            VARCHAR NOT NULL DEFAULT 'reviewer',
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
    """,
    # 2. Documents Table additions
    """
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL
    """,
    """
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS human_verified BOOLEAN DEFAULT FALSE
    """,
    """
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS verification_suspicious BOOLEAN DEFAULT FALSE
    """,
    # 3. Verification Logs Table
    """
    CREATE TABLE IF NOT EXISTS verification_logs (
        id             VARCHAR PRIMARY KEY,
        document_id    VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_id        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        verified_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        original_label VARCHAR,
        final_label    VARCHAR,
        label_changed  BOOLEAN DEFAULT FALSE,
        fields_changed JSONB
    )
    """,
]

def migrate():
    with engine.connect() as conn:
        for stmt in SQL:
            conn.execute(text(stmt))
        conn.commit()
    print("Active learning and Auth tables/columns added.")

if __name__ == "__main__":
    migrate()
