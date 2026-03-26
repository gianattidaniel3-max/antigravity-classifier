from sqlalchemy import Column, String, DateTime, Enum, Boolean, Float, JSON, ForeignKey, Text, Index
from sqlalchemy.orm import declarative_base, relationship
import enum
import datetime
import uuid

Base = declarative_base()

class DocumentStatus(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    TEMP_CLASSIFIED = "temp_classified"   # OCR page 1 done; awaiting LLM vision pass
    NEEDS_REVIEW = "needs_review"
    VERIFIED = "verified"
    FAILED = "failed"

class CaseStatus(enum.Enum):
    OPEN = "open"
    CLOSED = "closed"
    ARCHIVED = "archived"

class UserRole(enum.Enum):
    REVIEWER = "reviewer"
    ADMIN    = "admin"

class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email           = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    role            = Column(Enum(UserRole), default=UserRole.REVIEWER, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.datetime.utcnow)

    documents = relationship("Document", back_populates="uploaded_by_user")
    cases     = relationship("Case", back_populates="created_by_user")

class Case(Base):
    __tablename__ = "cases"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name         = Column(String, nullable=False)
    description  = Column(Text, nullable=True)
    client_name  = Column(String, nullable=True)
    status       = Column(Enum(CaseStatus), default=CaseStatus.OPEN)
    created_at   = Column(DateTime, default=datetime.datetime.utcnow)

    # nullable so existing cases (before auth) are not broken
    created_by   = Column(String, ForeignKey("users.id"), nullable=True)

    documents        = relationship("Document", back_populates="case")
    runs             = relationship("AnalysisRun", back_populates="case", cascade="all, delete-orphan")
    created_by_user  = relationship("User", back_populates="cases")

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)

    # nullable so existing documents (before auth) are not broken
    uploaded_by      = Column(String, ForeignKey("users.id"), nullable=True)
    uploaded_by_user = relationship("User", back_populates="documents")

    # Case assignment
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    case    = relationship("Case", back_populates="documents")

    # Storage Pointers
    minio_pdf_path = Column(String, nullable=False)
    minio_ocr_text_path = Column(String, nullable=True)

    # Phase 1 – Zero-shot OCR classification (page 1, keyword matcher)
    temp_label    = Column(String, nullable=True)
    temp_category = Column(String, nullable=True)
    temp_score    = Column(Float,  nullable=True)

    # Phase 2 – OpenAI GPT-4o Vision extraction
    llm_label                = Column(String,  nullable=True)
    llm_category             = Column(String,  nullable=True)
    llm_fields               = Column(JSON,    nullable=True)
    llm_classification_match = Column(Boolean, nullable=True)  # True if OCR label == LLM label
    llm_notes                = Column(Text,    nullable=True)

    # Authoritative result (populated from LLM; overwritten on human verification)
    extracted_label    = Column(String, nullable=True)
    extracted_category = Column(String, nullable=True)
    extracted_date     = Column(String, nullable=True)
    confidence_score   = Column(Float,  nullable=True)
    extracted_fields   = Column(JSON,   nullable=True)

    # State tracking
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING)

    # The active learning verification marker
    human_verified = Column(Boolean, default=False)
    verification_suspicious = Column(Boolean, default=False)

class AnalysisTemplate(Base):
    __tablename__ = "analysis_templates"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    # rules: list of {field, op, value, flag_label}
    # field: "label" | "category" | "date" | any extracted_fields key
    # op: "eq" | "neq" | "contains" | "gt" | "lt" | "is_null" | "not_null" | "in"
    rules       = Column(JSON, nullable=False, default=list)
    # List of {name: str, prompt: str}
    global_prompts = Column(JSON, nullable=True)
    created_at  = Column(DateTime, default=datetime.datetime.utcnow)

    runs = relationship("AnalysisRun", back_populates="template", cascade="all, delete-orphan")

class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id     = Column(String, ForeignKey("cases.id"), nullable=False)
    template_id = Column(String, ForeignKey("analysis_templates.id"), nullable=False)
    run_at      = Column(DateTime, default=datetime.datetime.utcnow)
    # results: list of {document_id, filename, label, triggered_rules: [...]}
    results     = Column(JSON, nullable=False, default=list)
    summary     = Column(JSON, nullable=True)  # {total, flagged, by_rule: {...}}
    # List of {name: str, insight: str}
    global_insights = Column(JSON, nullable=True)

    case     = relationship("Case", back_populates="runs")
    template = relationship("AnalysisTemplate", back_populates="runs")


class VerificationLog(Base):
    """
    One row per human verification event.
    Records who verified, when, what the model originally predicted,
    what the user set as the final label, and which fields were changed.
    Feeds the audit trail and accuracy stats.
    """
    __tablename__ = "verification_logs"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id    = Column(String, ForeignKey("documents.id"), nullable=False)
    user_id        = Column(String, ForeignKey("users.id"), nullable=True)
    verified_at    = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    original_label = Column(String, nullable=True)   # model's prediction before verification
    final_label    = Column(String, nullable=True)   # label after user edits
    label_changed  = Column(Boolean, default=False)  # True if user corrected the label

    # {"importo": {"from": "1.000,00", "to": "2.500,00"}, ...}
    fields_changed = Column(JSON, nullable=True)

    document = relationship("Document")
    user     = relationship("User")
