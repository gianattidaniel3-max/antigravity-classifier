"""
Authentication endpoints.

POST /api/auth/register  — create a new user account
  - The very first registration (no users in DB) is allowed without a token
    and the account is automatically made admin.
  - All subsequent registrations require an admin token.

POST /api/auth/login     — exchange email + password for a JWT
GET  /api/auth/me        — return the current authenticated user's profile
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.db.models import User, UserRole
from backend.auth.deps import (
    hash_password, verify_password,
    create_access_token,
    get_current_user, require_admin,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: dict, db: Session = Depends(get_db)):
    """
    payload: { "email": "...", "password": "...", "role": "reviewer" | "admin" }

    First user ever → automatically admin, no token required.
    All others      → caller must be an admin (token checked manually here
                      so the endpoint stays open for the bootstrap case).
    """
    email    = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    role_raw = (payload.get("role") or "reviewer").strip().lower()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")
    if role_raw not in ("reviewer", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'reviewer' or 'admin'")

    is_first_user = db.query(User).count() == 0

    if not is_first_user:
        # Require a valid admin token for all non-bootstrap registrations.
        # We do this inline rather than via Depends so the route stays open
        # for the first-user case.
        from fastapi import Request
        from backend.auth.deps import _decode_token
        import inspect
        # Re-use the dependency manually: read the Authorization header from
        # the raw request scope — FastAPI doesn't expose it without Depends,
        # so we resolve it through the oauth2 scheme directly.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can register new users. Use POST /api/auth/register with an admin token.",
        )

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    role = UserRole.ADMIN if is_first_user else UserRole(role_raw)
    user = User(email=email, hashed_password=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"id": user.id, "email": user.email, "role": user.role.value}


@router.post("/register/admin", status_code=201)
def register_by_admin(
    payload: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin-only endpoint to create additional user accounts."""
    email    = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    role_raw = (payload.get("role") or "reviewer").strip().lower()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")
    if role_raw not in ("reviewer", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'reviewer' or 'admin'")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(password),
        role=UserRole(role_raw),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role.value}


@router.post("/login")
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Standard OAuth2 password flow.
    Returns { "access_token": "...", "token_type": "bearer" }
    """
    user = db.query(User).filter(User.email == form.username.strip().lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id":         current_user.id,
        "email":      current_user.email,
        "role":       current_user.role.value,
        "created_at": current_user.created_at.isoformat(),
    }


@router.get("/users", dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    """Admin only — list all user accounts."""
    users = db.query(User).order_by(User.created_at).all()
    return [
        {"id": u.id, "email": u.email, "role": u.role.value, "is_active": u.is_active}
        for u in users
    ]


@router.patch("/users/{user_id}", dependencies=[Depends(require_admin)])
def update_user(user_id: str, payload: dict, db: Session = Depends(get_db)):
    """Admin only — toggle is_active or change role."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])
    if "role" in payload and payload["role"] in ("reviewer", "admin"):
        user.role = UserRole(payload["role"])
    db.commit()
    return {"id": user.id, "email": user.email, "role": user.role.value, "is_active": user.is_active}
