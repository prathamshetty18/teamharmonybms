from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password
from app.models.user import User, UserRole
from app.schemas.auth import (
    CitizenRegisterRequest,
    GovernmentUserCreateRequest,
)


class AuthService:
    """Service layer handling user authentication, creation, and profile operations."""

    @staticmethod
    def authenticate_user(
        db: Session,
        identifier: str,
        password: str,
    ) -> User:
        """
        Authenticate user by either username or mobile number.
        Returns user on success, raises 401 on bad credentials without leaking user existence.
        """
        clean_identifier = identifier.strip()

        # Query user matching username (case-insensitive) OR mobile number
        user = (
            db.query(User)
            .filter(
                or_(
                    User.username == clean_identifier.lower(),
                    User.mobile_number == clean_identifier,
                )
            )
            .first()
        )

        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username/mobile number or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account has been deactivated. Please contact an administrator.",
            )

        return user

    @staticmethod
    def register_citizen(
        db: Session,
        data: CitizenRegisterRequest,
    ) -> User:
        """
        Register a new Citizen/Farmer.
        Role is strictly locked to CITIZEN.
        """
        # Ensure username is unique
        existing_username = (
            db.query(User).filter(User.username == data.username.lower()).first()
        )
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username is already registered. Please choose another.",
            )

        # Ensure mobile number is unique
        existing_mobile = (
            db.query(User).filter(User.mobile_number == data.mobile_number).first()
        )
        if existing_mobile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile number is already registered.",
            )

        # Hash password securely
        hashed_password = get_password_hash(data.password)

        new_user = User(
            full_name=data.full_name.strip(),
            username=data.username.lower(),
            mobile_number=data.mobile_number,
            password_hash=hashed_password,
            role=UserRole.CITIZEN,
            is_active=True,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user

    @staticmethod
    def create_government_user(
        db: Session,
        data: GovernmentUserCreateRequest,
    ) -> User:
        """
        Create a new government employee account (Admin only operation).
        """
        # Ensure username uniqueness
        if db.query(User).filter(User.username == data.username.lower()).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username is already registered.",
            )

        # Ensure mobile uniqueness
        if db.query(User).filter(User.mobile_number == data.mobile_number).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile number is already registered.",
            )

        # Ensure employee_id uniqueness
        if db.query(User).filter(User.employee_id == data.employee_id.strip()).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID is already registered.",
            )

        hashed_password = get_password_hash(data.password)

        new_govt_user = User(
            full_name=data.full_name.strip(),
            employee_id=data.employee_id.strip(),
            username=data.username.lower(),
            mobile_number=data.mobile_number,
            department=data.department.strip(),
            role=data.role,
            password_hash=hashed_password,
            is_active=True,
        )

        db.add(new_govt_user)
        db.commit()
        db.refresh(new_govt_user)
        return new_govt_user

    @staticmethod
    def change_password(
        db: Session,
        user: User,
        old_password: str,
        new_password: str,
    ) -> None:
        """
        Change user's password after validating current password.
        """
        if not verify_password(old_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password does not match.",
            )

        user.password_hash = get_password_hash(new_password)
        db.commit()

    @staticmethod
    def list_users(
        db: Session,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[User]:
        """
        Retrieve paginated list of users with optional filtering by role and status.
        """
        query = db.query(User)
        if role is not None:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)

        return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_user_by_id(db: Session, user_id: str) -> User:
        """
        Retrieve user by ID or raise 404.
        """
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID '{user_id}' not found.",
            )
        return user

    @staticmethod
    def update_user_status(
        db: Session,
        user_id: str,
        is_active: bool,
    ) -> User:
        """
        Activate or deactivate a user account.
        """
        user = AuthService.get_user_by_id(db, user_id)
        user.is_active = is_active
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def update_user_role(
        db: Session,
        user_id: str,
        new_role: UserRole,
    ) -> User:
        """
        Update the role assigned to a user.
        """
        user = AuthService.get_user_by_id(db, user_id)
        user.role = new_role
        db.commit()
        db.refresh(user)
        return user
