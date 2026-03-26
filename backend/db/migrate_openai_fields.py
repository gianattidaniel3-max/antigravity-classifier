"""
Migration: add OpenAI Vision columns + TEMP_CLASSIFIED status to existing DB.

Run once from the project root:
    python -m backend.db.migrate_openai_fields

Safe to run multiple times — each ALTER is wrapped in a try/except that
ignores "column already exists" errors from PostgreSQL (duplicate_column / 42701).
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://classifier:secretpassword@localhost:5432/file_classifier",
)

_ALTERS = [
    # Phase-1 zero-shot OCR classification
    "ALTER TABLE documents ADD COLUMN temp_label    VARCHAR",
    "ALTER TABLE documents ADD COLUMN temp_category VARCHAR",
    "ALTER TABLE documents ADD COLUMN temp_score    FLOAT",
    # Phase-2 GPT-4o Vision result
    "ALTER TABLE documents ADD COLUMN llm_label                VARCHAR",
    "ALTER TABLE documents ADD COLUMN llm_category             VARCHAR",
    "ALTER TABLE documents ADD COLUMN llm_fields               JSONB",
    "ALTER TABLE documents ADD COLUMN llm_classification_match BOOLEAN",
    "ALTER TABLE documents ADD COLUMN llm_notes                TEXT",
    # Extend the documentstatus enum with the new value (PostgreSQL stores enum names uppercase)
    "ALTER TYPE documentstatus ADD VALUE IF NOT EXISTS 'TEMP_CLASSIFIED'",
]


def run():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        for stmt in _ALTERS:
            try:
                conn.execute(text(stmt))
                conn.commit()
                print(f"OK  : {stmt[:80]}")
            except Exception as exc:
                conn.rollback()
                # 42701 = duplicate_column; enum value already present raises
                # different codes — both are safe to skip.
                msg = str(exc)
                if "already exists" in msg or "42701" in msg:
                    print(f"SKIP: {stmt[:80]}")
                else:
                    raise
    print("\nMigration complete.")


if __name__ == "__main__":
    run()
