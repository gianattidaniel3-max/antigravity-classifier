"""
Run once to add Global Prompt and Case Insight columns.
Usage: python -m backend.db.migrate_analysis_v2
"""
from backend.db.session import engine
from sqlalchemy import text

SQL = [
    """
    ALTER TABLE analysis_templates
        ADD COLUMN IF NOT EXISTS global_prompt TEXT
    """,
    """
    ALTER TABLE analysis_runs
        ADD COLUMN IF NOT EXISTS case_insight TEXT
    """,
]

if __name__ == "__main__":
    with engine.connect() as conn:
        for stmt in SQL:
            conn.execute(text(stmt))
        conn.commit()
    print("Migration v2 complete.")
