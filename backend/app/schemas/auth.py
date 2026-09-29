import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from app.models.user import UserRole


class CitizenRegisterRequest(BaseModel):
    """
    Public registration schema for Citizens / Farmers only.
    Government roles cannot be registered through this schema.
    """
    full_name: str = Field(..., min_length=2, max_length=100, description="Full Name of the citizen")
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    mobile_number: str = Field(..., description="10-digit mobile number")
    password: str = Field(..., min_length=6, max_length=128, description="Account password")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(r"^[a-zA-Z0-9_.-]+$", clean):
            raise ValueError("Username can only contain letters, numbers, underscores, dashes, and periods")
        return clean

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        # Strip spaces or hyphens
        clean = re.sub(r"[\s\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        if not re.match(r"^\d{10}$", clean):
            raise ValueError("Mobile number must be a valid 10-digit number")
        return clean


class GovernmentUserCreateRequest(BaseModel):
    """
    Schema for administrator to create government personnel accounts.
    """
    full_name: str = Field(..., min_length=2, max_length=100)
    employee_id: str = Field(..., min_length=2, max_length=50, description="Official government employee ID")
    username: str = Field(..., min_length=3, max_length=50)
    mobile_number: str = Field(..., description="Official mobile contact number")
    password: str = Field(..., min_length=6, max_length=128)
    department: str = Field(..., min_length=2, max_length=150, description="Assigned government department")
    role: UserRole = Field(..., description="Role: VERIFICATION_OFFICER, GOVERNMENT_OFFICER, or ADMIN")

    @field_validator("role")
    @classmethod
    def validate_gov_role(cls, v: UserRole) -> UserRole:
        if v == UserRole.CITIZEN:
            raise ValueError("Cannot assign CITIZEN role through government employee onboarding")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(r"^[a-zA-Z0-9_.-]+$", clean):
            raise ValueError("Username can only contain letters, numbers, underscores, dashes, and periods")
        return clean

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        clean = re.sub(r"[\s\-]", "", v)
        if clean.startswith("+91"):
            clean = clean[3:]
        if not re.match(r"^\d{10}$", clean):
            raise ValueError("Mobile number must be a valid 10-digit number")
        return clean


class LoginRequest(BaseModel):
    """
    Login schema accepting either Username OR Mobile Number along with Password.
    """
    identifier: str = Field(..., min_length=3, max_length=100, description="Username or 10-digit mobile number")
    password: str = Field(..., min_length=1, max_length=128, description="User password")


class UserTokenInfo(BaseModel):
    """
    User details nested within the JWT login response.
    """
    id: str
    name: str
    role: UserRole

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """
    Standard JWT token response.
    """
    access_token: str
    token_type: str = "bearer"
    user: UserTokenInfo


class UserResponse(BaseModel):
    """
    Full user profile response without any sensitive password or hash data.
    """
    id: str
    full_name: str
    username: str
    mobile_number: str
    role: UserRole
    department: Optional[str] = None
    employee_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    """
    Schema for authenticated user password change.
    """
    old_password: str = Field(..., min_length=1, description="Current password")
    new_password: str = Field(..., min_length=6, max_length=128, description="New strong password")


class UserStatusUpdateRequest(BaseModel):
    """
    Admin schema to activate or deactivate user accounts.
    """
    is_active: bool = Field(..., description="Set active (True) or deactivated (False)")


class UserRoleUpdateRequest(BaseModel):
    """
    Admin schema to modify user role.
    """
    role: UserRole = Field(..., description="Updated role")


class MessageResponse(BaseModel):
    """
    Generic message response schema.
    """
    message: str
    detail: Optional[str] = None
