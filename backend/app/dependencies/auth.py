from typing import Callable, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import User, UserRole

# Standard HTTP Bearer scheme for Authorization: Bearer <token>
bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate the incoming JWT Bearer token and retrieve the corresponding active user.
    Enforces active status on every authenticated request.
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload["sub"]
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator.",
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Alias for current authenticated and active user."""
    return current_user


def require_role(allowed_role: UserRole) -> Callable:
    """
    Factory dependency to enforce a single specific role.
    Usage: Depends(require_role(UserRole.ADMIN))
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != allowed_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires '{allowed_role.value}' role.",
            )
        return current_user

    return role_checker


def require_roles(*allowed_roles: UserRole) -> Callable:
    """
    Factory dependency to enforce that the user has at least one of the specified roles.
    Usage: Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT_OFFICER))
    """
    def roles_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            role_names = ", ".join([r.value for r in allowed_roles])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: required role is one of [{role_names}].",
            )
        return current_user

    return roles_checker


# Convenient pre-configured role dependencies
require_admin = require_role(UserRole.ADMIN)
require_citizen = require_role(UserRole.CITIZEN)
require_verification_officer = require_role(UserRole.VERIFICATION_OFFICER)
require_government_officer = require_role(UserRole.GOVERNMENT_OFFICER)
require_government_or_admin = require_roles(
    UserRole.ADMIN,
    UserRole.GOVERNMENT_OFFICER,
    UserRole.VERIFICATION_OFFICER,
)
