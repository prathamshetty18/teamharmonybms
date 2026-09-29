import enum
import uuid
from sqlalchemy import Boolean, Column, DateTime, Enum, String, func
from app.database import Base


class UserRole(str, enum.Enum):
    CITIZEN = "CITIZEN"
    VERIFICATION_OFFICER = "VERIFICATION_OFFICER"
    GOVERNMENT_OFFICER = "GOVERNMENT_OFFICER"
    ADMIN = "ADMIN"


def generate_user_id() -> str:
    """Generate a clean, unique, stable identifier for users (e.g., USR-B7E29F1A4C)."""
    return f"USR-{uuid.uuid4().hex[:10].upper()}"


class User(Base):
    __tablename__ = "users"

    id = Column(
        String(64),
        primary_key=True,
        default=generate_user_id,
        index=True,
        nullable=False,
    )
    full_name = Column(String(255), nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    mobile_number = Column(String(20), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum(UserRole, name="user_role_enum", native_enum=False),
        default=UserRole.CITIZEN,
        nullable=False,
        index=True,
    )
    department = Column(String(150), nullable=True)
    employee_id = Column(String(100), unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username} role={self.role}>"
