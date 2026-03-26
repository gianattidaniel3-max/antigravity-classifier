"""
Run once to add Case Analysis Engine tables to the existing DB.
Usage: python -m backend.db.migrate_cases
"""
from backend.db.session import engine
from sqlalchemy import text

SQL = [
    """
    CREATE TABLE IF NOT EXISTS cases (
        id          VARCHAR PRIMARY KEY,
        name        VARCHAR NOT NULL,
        description TEXT,
        client_name VARCHAR,
        status      VARCHAR NOT NULL DEFAULT 'open',
        created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
    """,
    """
    ALTER TABLE documents
        ADD COLUMN IF NOT EXISTS case_id VARCHAR REFERENCES cases(id) ON DELETE SET NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS analysis_templates (
        id          VARCHAR PRIMARY KEY,
        name        VARCHAR NOT NULL UNIQUE,
        description TEXT,
        rules       JSONB NOT NULL DEFAULT '[]',
        created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS analysis_runs (
        id          VARCHAR PRIMARY KEY,
        case_id     VARCHAR NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        template_id VARCHAR NOT NULL REFERENCES analysis_templates(id) ON DELETE CASCADE,
        run_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
        results     JSONB NOT NULL DEFAULT '[]',
        summary     JSONB
    )
    """,
]

if __name__ == "__main__":
    with engine.connect() as conn:
        for stmt in SQL:
            conn.execute(text(stmt))
        conn.commit()
    print("Migration complete.")
