import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from sqlalchemy import text
from backend.db.session import SessionLocal

def migrate():
    db = SessionLocal()
    try:
        print("Migrating analysis_templates...")
        # Add column if not exists
        db.execute(text("ALTER TABLE analysis_templates ADD COLUMN IF NOT EXISTS global_prompts JSONB"))
        
        # Migrate data
        # Check if old column exists first
        res = db.execute(text("SELECT id, global_prompt FROM analysis_templates"))
        for row in res:
            tid, prompt = row
            if prompt:
                # new format: list of {name, prompt}
                new_val = [{"name": "Analisi Principale", "prompt": prompt}]
                db.execute(
                    text("UPDATE analysis_templates SET global_prompts = :val WHERE id = :id"),
                    {"val": json.dumps(new_val), "id": tid}
                )

        print("Migrating analysis_runs...")
        db.execute(text("ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS global_insights JSONB"))
        
        res = db.execute(text("SELECT id, case_insight FROM analysis_runs"))
        for row in res:
            rid, insight = row
            if insight:
                # new format: list of {name, insight}
                new_val = [{"name": "Analisi Principale", "insight": insight}]
                db.execute(
                    text("UPDATE analysis_runs SET global_insights = :val WHERE id = :id"),
                    {"val": json.dumps(new_val), "id": rid}
                )

        db.commit()
        print("Migration complete.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
