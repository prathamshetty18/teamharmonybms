from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.security import create_access_token
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    CitizenRegisterRequest,
    LoginRequest,
    MessageResponse,
    TokenResponse,
    UserResponse,
    UserTokenInfo,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Citizen / Farmer",
    description="Public registration for Citizens and Farmers only. Role is permanently assigned as CITIZEN.",
)
def register_citizen(
    data: CitizenRegisterRequest,
    db: Session = Depends(get_db),
):
    """Register a new citizen/farmer."""
    new_user = AuthService.register_citizen(db, data)
    return new_user


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate User (Username or Mobile + Password)",
    description="Login using either username or mobile number along with password. Returns JWT access token.",
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    """Authenticate and obtain JWT bearer token."""
    user = AuthService.authenticate_user(
        db=db,
        identifier=data.identifier,
        password=data.password,
    )

    token = create_access_token(
        subject=user.id,
        role=user.role.value,
        name=user.full_name,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserTokenInfo(
            id=user.id,
            name=user.full_name,
            role=user.role,
        ),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Current User Profile",
    description="Retrieve the profile of the currently authenticated user. Never exposes password or password_hash.",
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Return authenticated user profile."""
    return current_user


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Log Out User",
    description="Acknowledge client logout. The client should discard the local JWT token.",
)
def logout(
    current_user: User = Depends(get_current_user),
):
    """Client logout acknowledgement."""
    return MessageResponse(
        message="Successfully logged out. Please discard your access token on the client."
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Change Password",
    description="Update the current user's password after validating the existing password.",
)
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user password."""
    AuthService.change_password(
        db=db,
        user=current_user,
        old_password=data.old_password,
        new_password=data.new_password,
    )
    return MessageResponse(message="Password successfully updated.")
