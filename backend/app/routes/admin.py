from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies.auth import require_admin
from app.models.user import User, UserRole
from app.schemas.auth import (
    GovernmentUserCreateRequest,
    UserResponse,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/admin", tags=["Admin User Management"])


@router.post(
    "/government-users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Government Employee Account",
    description="Admin-only endpoint to onboard verification officers, government officers, or additional admins.",
)
def create_government_user(
    data: GovernmentUserCreateRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new government employee account."""
    new_user = AuthService.create_government_user(db, data)
    return new_user


@router.get(
    "/users",
    response_model=List[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="List All Users",
    description="Admin-only endpoint to list users with optional filtering by role and active status.",
)
def list_users(
    role: Optional[UserRole] = Query(None, description="Filter by user role"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Limit per page"),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List users in the system."""
    return AuthService.list_users(
        db=db,
        role=role,
        is_active=is_active,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/users/{id}",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get User By ID",
    description="Admin-only endpoint to retrieve detailed information about any specific user.",
)
def get_user_by_id(
    id: str,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get single user by ID."""
    return AuthService.get_user_by_id(db=db, user_id=id)


@router.patch(
    "/users/{id}/status",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Activate or Deactivate User Account",
    description="Admin-only endpoint to toggle account active status.",
)
def update_user_status(
    id: str,
    data: UserStatusUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Activate or deactivate user account."""
    return AuthService.update_user_status(
        db=db,
        user_id=id,
        is_active=data.is_active,
    )


@router.patch(
    "/users/{id}/role",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Change User Role",
    description="Admin-only endpoint to change the role of an employee or user.",
)
def update_user_role(
    id: str,
    data: UserRoleUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Change role of a user."""
    return AuthService.update_user_role(
        db=db,
        user_id=id,
        new_role=data.role,
    )
