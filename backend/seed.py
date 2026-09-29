"""
Database Seeding Script for BhoomiSetu Authentication Service.

DISCLAIMER:
The accounts created by this script are STRICTLY for local development,
demonstration, and automated testing purposes.
NEVER deploy these default demo credentials in a production environment!
"""

import sys
from app.core.security import get_password_hash
from app.database import Base, SessionLocal, engine
from app.models.user import User, UserRole


DEMO_ACCOUNTS = [
    {
        "id": "USR-CITIZEN-001",
        "username": "demo_farmer",
        "password": "Demo@123",
        "full_name": "Demo Farmer",
        "mobile_number": "9876543210",
        "role": UserRole.CITIZEN,
        "department": None,
        "employee_id": None,
    },
    {
        "id": "USR-VERIFIER-001",
        "username": "demo_verifier",
        "password": "Demo@123",
        "full_name": "Demo Ground Verification Officer",
        "mobile_number": "9876543211",
        "role": UserRole.VERIFICATION_OFFICER,
        "department": "Revenue & Ground Survey",
        "employee_id": "VO-SURVEY-2024-01",
    },
    {
        "id": "USR-GOVOFF-001",
        "username": "demo_gov",
        "password": "Demo@123",
        "full_name": "Demo Disaster Relief Officer",
        "mobile_number": "9876543212",
        "role": UserRole.GOVERNMENT_OFFICER,
        "department": "Disaster Relief & Land Classification",
        "employee_id": "GOV-RELIEF-2024-01",
    },
    {
        "id": "USR-ADMIN-001",
        "username": "admin",
        "password": "Admin@123",
        "full_name": "BhoomiSetu Master Administrator",
        "mobile_number": "9876543200",
        "role": UserRole.ADMIN,
        "department": "System Administration",
        "employee_id": "ADM-HQ-001",
    },
]


def seed_database():
    """Populate database with demo accounts if not already present."""
    print("=" * 70)
    print(">> Initializing BhoomiSetu Database & Seeding Demo Accounts...")
    print("=" * 70)

    try:
        # Create database tables if they do not exist
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"[ERROR] Failed to connect to database: {exc}")
        print("[HINT] Ensure database is accessible or verify DATABASE_URL in backend/.env")
        sys.exit(1)

    db = SessionLocal()
    try:
        seeded_count = 0
        updated_count = 0

        for item in DEMO_ACCOUNTS:
            existing = (
                db.query(User).filter(User.username == item["username"]).first()
            )
            password_hash = get_password_hash(item["password"])

            if not existing:
                new_user = User(
                    id=item["id"],
                    username=item["username"],
                    full_name=item["full_name"],
                    mobile_number=item["mobile_number"],
                    password_hash=password_hash,
                    role=item["role"],
                    department=item["department"],
                    employee_id=item["employee_id"],
                    is_active=True,
                )
                db.add(new_user)
                seeded_count += 1
                print(f"  [+] Created {item['role'].value:<20}: {item['username']} ({item['mobile_number']})")
            else:
                # Update demo credentials to ensure known state
                existing.password_hash = password_hash
                existing.is_active = True
                updated_count += 1
                print(f"  [*] Refreshed {item['role'].value:<18}: {item['username']}")

        db.commit()

        print("-" * 70)
        print(f"[SUCCESS] Seeding Complete: {seeded_count} created, {updated_count} refreshed.")
        print("=" * 70)
        print("DEMO CREDENTIALS (DEVELOPMENT ONLY):")
        print("=" * 70)
        print(f"{'Role':<22} | {'Username':<15} | {'Mobile':<12} | {'Password':<10}")
        print("-" * 70)
        for acc in DEMO_ACCOUNTS:
            print(f"{acc['role'].value:<22} | {acc['username']:<15} | {acc['mobile_number']:<12} | {acc['password']:<10}")
        print("=" * 70)
        print("WARNING: DO NOT USE THESE CREDENTIALS IN PRODUCTION ENVIRONMENTS.")
        print("=" * 70)

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Error during seeding: {exc}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
