# BhoomiSetu Authentication Backend Service

A high-performance, modular, and production-oriented Authentication and Role-Based Access Control (RBAC) microservice built with **FastAPI**, **PostgreSQL**, **SQLAlchemy**, and **JWT**.

This backend powers identity management for the **BhoomiSetu** Land Verification and Disaster Relief platform. It is engineered as a standalone service designed for seamless integration with the existing React frontend and future modules (Land Claims, Ground Verification, Disaster Relief, and Blockchain Audit Logs).

---

## 🏛️ System Architecture & Highlights

- **FastAPI 0.110+**: Asynchronous, auto-generating OpenAPI 3.0 documentation (`/docs` and `/redoc`).
- **PostgreSQL + SQLAlchemy 2.0**: Relational persistence with indexes on unique identifiers (`username`, `mobile_number`, `employee_id`).
- **Alembic Database Migrations**: Safe, version-controlled database schema evolution.
- **Identifier-Agnostic Login**: Authenticate seamlessly using either **10-digit Mobile Number** OR **Username** + **Password**.
- **Role-Based Access Control (RBAC)**: Reusable FastAPI dependencies enforcing strict role authorization:
  - `CITIZEN`: Farmers and landowners applying for land verification and disaster relief.
  - `VERIFICATION_OFFICER`: Field agents conducting physical inspections and ground surveys.
  - `GOVERNMENT_OFFICER`: Administrative officers issuing approvals, land classifications, and relief packages.
  - `ADMIN`: Master administrators managing staff accounts, roles, and platform status.
- **Zero-Email Architecture**: No email dependencies, links, or verification emails.
- **Enterprise Password Security**: Bcrypt / Argon2 salted hashing. Plaintext passwords or hashes are **never** returned or stored.
- **Stateless Bearer JWT**: Standard RFC 7519 JSON Web Tokens for cross-origin authorization with configurable expiration.

---

## 📁 Project Structure

```
backend/
├── alembic/                         # Database migration scripts
│   ├── env.py                       # Alembic database context loader
│   ├── script.py.mako               # Migration template
│   └── versions/                    # Schema revision history
│       └── 001_initial_users.py     # Initial users table migration
├── app/                             # Core application package
│   ├── core/                        # Core configuration & cryptographic utilities
│   │   ├── config.py                # Pydantic BaseSettings & CORS configuration
│   │   └── security.py              # Password hashing & JWT token generation
│   ├── database.py                  # SQLAlchemy engine, session maker, get_db()
│   ├── dependencies/                # Reusable FastAPI dependency injection
│   │   └── auth.py                  # JWT validation & role-checking guards
│   ├── models/                      # SQLAlchemy ORM models
│   │   └── user.py                  # User entity & UserRole enum definition
│   ├── routes/                      # API endpoint definitions
│   │   ├── admin.py                 # Admin user management & onboarding routes
│   │   └── auth.py                  # Public registration, login, profile routes
│   ├── schemas/                     # Pydantic v2 validation & response schemas
│   │   └── auth.py                  # Request/response data transfer models
│   ├── services/                    # Business logic isolation layer
│   │   └── auth_service.py          # Authentication, user creation & query methods
│   └── main.py                      # FastAPI application entrypoint & middleware
├── .env                             # Local environment variables (do not commit)
├── .env.example                     # Sample template for configuration variables
├── .gitignore                       # Git exclusion rules
├── alembic.ini                      # Alembic configuration file
├── README.md                        # Service documentation & API guide
├── requirements.txt                 # Python project dependencies
└── seed.py                          # Development database initialization script
```

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- **Python 3.10+** (Python 3.11 recommended)
- **PostgreSQL 14+** (running locally or on a remote server/Docker)

> **Note for Quick Testing:** The application automatically supports SQLite if you set `DATABASE_URL=sqlite:///./bhoomisetu_auth.db` in your `.env` file!

### 2. Create and Activate Virtual Environment

**On Windows (PowerShell):**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On macOS / Linux:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env` (already done by default) and update the credentials as needed:
```bash
cp .env.example .env
```

Key variables in `.env`:
```ini
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/bhoomisetu_auth
JWT_SECRET_KEY=bhoomisetu_super_secret_jwt_key_2026_dev_env_auth_system_jwt_secure
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173
```

### 5. Initialize Database & Run Migrations
Run Alembic to apply the latest database schema:
```bash
alembic upgrade head
```

### 6. Seed Demo Accounts
Run the seed script to populate default development accounts:
```bash
python seed.py
```

### 7. Start the Development Server
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- API Base URL: `http://127.0.0.1:8000`
- Interactive Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc UI: `http://127.0.0.1:8000/redoc`

---

## 🔑 Demo Credentials (Development & Testing Only)

> ⚠️ **DISCLAIMER**: These accounts are provided exclusively for local testing and feature evaluation. **Never** deploy or use these credentials in a staging or production environment.

| Role | Username | Mobile Number | Password | Notes / Department |
| :--- | :--- | :--- | :--- | :--- |
| **CITIZEN** | `demo_farmer` | `9876543210` | `Demo@123` | Registered Citizen / Landowner |
| **VERIFICATION_OFFICER** | `demo_verifier` | `9876543211` | `Demo@123` | Revenue & Ground Survey (`VO-SURVEY-2024-01`) |
| **GOVERNMENT_OFFICER** | `demo_gov` | `9876543212` | `Demo@123` | Disaster Relief Cell (`GOV-RELIEF-2024-01`) |
| **ADMIN** | `admin` | `9876543200` | `Admin@123` | BhoomiSetu Master Administrator (`ADM-HQ-001`) |

---

## 📡 API Reference & Endpoints

### 1. Authentication Endpoints (`/api/auth`)

#### `POST /api/auth/register`
Public registration endpoint. Exclusively for **CITIZEN** accounts. The `role` field cannot be modified by the caller.

- **Request Body:**
```json
{
  "full_name": "Ramesh Kumar",
  "username": "ramesh_k",
  "mobile_number": "9876543299",
  "password": "SecurePassword@123"
}
```
- **Response (201 Created):**
```json
{
  "id": "USR-4B82A9C10D",
  "full_name": "Ramesh Kumar",
  "username": "ramesh_k",
  "mobile_number": "9876543299",
  "role": "CITIZEN",
  "department": null,
  "employee_id": null,
  "is_active": true,
  "created_at": "2026-09-29T01:25:00.000Z",
  "updated_at": "2026-09-29T01:25:00.000Z"
}
```

---

#### `POST /api/auth/login`
Authenticates a user via either **Username** OR **10-digit Mobile Number** along with password.

- **Request Body (using Mobile Number):**
```json
{
  "identifier": "9876543210",
  "password": "Demo@123"
}
```
- **Request Body (using Username):**
```json
{
  "identifier": "demo_farmer",
  "password": "Demo@123"
}
```
- **Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "USR-CITIZEN-001",
    "name": "Demo Farmer",
    "role": "CITIZEN"
  }
}
```
- **Response (401 Unauthorized):**
```json
{
  "detail": "Invalid username/mobile number or password"
}
```

---

#### `GET /api/auth/me`
Retrieves current authenticated user's profile. Requires `Authorization: Bearer <token>`.

- **Headers:**
```http
Authorization: Bearer <token>
```
- **Response (200 OK):**
```json
{
  "id": "USR-CITIZEN-001",
  "full_name": "Demo Farmer",
  "username": "demo_farmer",
  "mobile_number": "9876543210",
  "role": "CITIZEN",
  "department": null,
  "employee_id": null,
  "is_active": true,
  "created_at": "2026-09-29T01:00:00.000Z",
  "updated_at": "2026-09-29T01:00:00.000Z"
}
```

---

#### `POST /api/auth/logout`
Acknowledges client session logout. Requires `Authorization: Bearer <token>`.

- **Response (200 OK):**
```json
{
  "message": "Successfully logged out. Please discard your access token on the client.",
  "detail": null
}
```

---

#### `POST /api/auth/change-password`
Allows an authenticated user to change their password by validating their old password first.

- **Request Body:**
```json
{
  "old_password": "Demo@123",
  "new_password": "NewStrongPassword@2026"
}
```
- **Response (200 OK):**
```json
{
  "message": "Password successfully updated.",
  "detail": null
}
```

---

### 2. Admin User Management Endpoints (`/api/admin`)

> 🔒 **Access Restriction:** All `/api/admin/*` endpoints strictly require an active account with the `ADMIN` role. Requests by any other role or unauthenticated callers return `403 Forbidden` or `401 Unauthorized`.

#### `POST /api/admin/government-users`
Onboards official government personnel. Accepts `VERIFICATION_OFFICER`, `GOVERNMENT_OFFICER`, or `ADMIN`.

- **Request Body:**
```json
{
  "full_name": "Inspector Suresh Rao",
  "employee_id": "VO-KA-2024-88",
  "username": "suresh_officer",
  "mobile_number": "9876543277",
  "password": "OfficerSecure@2026",
  "department": "Land Revenue & Field Inspection",
  "role": "VERIFICATION_OFFICER"
}
```
- **Response (201 Created):**
```json
{
  "id": "USR-99E8F21A3B",
  "full_name": "Inspector Suresh Rao",
  "username": "suresh_officer",
  "mobile_number": "9876543277",
  "role": "VERIFICATION_OFFICER",
  "department": "Land Revenue & Field Inspection",
  "employee_id": "VO-KA-2024-88",
  "is_active": true,
  "created_at": "2026-09-29T01:30:00.000Z",
  "updated_at": "2026-09-29T01:30:00.000Z"
}
```

---

#### `GET /api/admin/users`
Lists all users with optional filtering and pagination.

- **Query Parameters:**
  - `role`: Filter by role (`CITIZEN`, `VERIFICATION_OFFICER`, `GOVERNMENT_OFFICER`, `ADMIN`)
  - `is_active`: Filter by boolean status (`true` / `false`)
  - `skip`: Pagination offset (default: `0`)
  - `limit`: Pagination limit (default: `50`, max: `100`)
- **Response (200 OK):**
```json
[
  {
    "id": "USR-CITIZEN-001",
    "full_name": "Demo Farmer",
    "username": "demo_farmer",
    "mobile_number": "9876543210",
    "role": "CITIZEN",
    "department": null,
    "employee_id": null,
    "is_active": true,
    "created_at": "2026-09-29T01:00:00.000Z",
    "updated_at": "2026-09-29T01:00:00.000Z"
  }
]
```

---

#### `GET /api/admin/users/{id}`
Retrieves a specific user's details by their unique user ID.

- **Response (200 OK):** User object.

---

#### `PATCH /api/admin/users/{id}/status`
Activates or deactivates a user account. Deactivated accounts immediately lose API access.

- **Request Body:**
```json
{
  "is_active": false
}
```
- **Response (200 OK):** Updated user object with `"is_active": false`.

---

#### `PATCH /api/admin/users/{id}/role`
Updates a user's role.

- **Request Body:**
```json
{
  "role": "GOVERNMENT_OFFICER"
}
```
- **Response (200 OK):** Updated user object.

---

## 🛡️ Role-Based Access Control (RBAC) Matrix

| Endpoint | CITIZEN | VERIFICATION_OFFICER | GOVERNMENT_OFFICER | ADMIN | Public |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `POST /api/auth/register` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `POST /api/auth/login` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `GET /api/auth/me` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `POST /api/auth/logout` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `POST /api/auth/change-password` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `POST /api/admin/government-users` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `GET /api/admin/users` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `GET /api/admin/users/{id}` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `PATCH /api/admin/users/{id}/status` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `PATCH /api/admin/users/{id}/role` | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 🔗 Connecting to the Existing Frontend

The backend comes pre-configured with CORS for development origins (`http://localhost:3000`, `http://localhost:5173`).

### Frontend Integration Example (`api.js`)

```javascript
const API_BASE_URL = 'http://127.0.0.1:8000/api';

// 1. Login function (accepts username or 10-digit mobile)
export async function loginUser(identifier, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }

  const data = await response.json();
  // Store token and user
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

// 2. Authenticated request helper
export async function fetchWithAuth(endpoint, options = {}) {
  const token = localStorage.getItem('access_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

// 3. Get current authenticated user
export async function getCurrentUser() {
  const response = await fetchWithAuth('/auth/me');
  return response.json();
}
```

---

## 🔮 Future Architecture & Extensibility Roadmap

The authentication system issues a permanent, stable `user.id` (`USR-...`). This ID will serve as the foreign key anchor across the platform's upcoming modules:

```
┌─────────────────────────────────────────────────────────────┐
│                 BhoomiSetu Platform Lifecycle               │
└─────────────────────────────────────────────────────────────┘
                              │
                    [Authentication (Current)]
                      user_id: "USR-001"
                              │
                              ▼
                    [Farmer Land Claims]
             claim_id ──> foreign_key: user_id
                              │
                              ▼
                   [Document Verification]
           verified_by ──> foreign_key: user_id (VERIFICATION_OFFICER)
                              │
                              ▼
                    [Ground Verification]
           surveyor_id ──> foreign_key: user_id (VERIFICATION_OFFICER)
                              │
                              ▼
                   [Land Classification]
           classified_by ──> foreign_key: user_id (GOVERNMENT_OFFICER)
                              │
                              ▼
                  [Government Approval & QR]
           approved_by ──> foreign_key: user_id (GOVERNMENT_OFFICER)
                              │
                              ▼
                     [Disaster Relief]
           applicant_id ──> foreign_key: user_id (CITIZEN)
           disbursed_by ──> foreign_key: user_id (GOVERNMENT_OFFICER)
                              │
                              ▼
               [Blockchain Audit / Verification]
           immutable tx log with cryptographic signer: user_id
```
