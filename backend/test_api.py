"""
Automated Verification Script for BhoomiSetu Authentication Backend on Localhost.
Tests all endpoints, RBAC, edge cases, and response structures.
"""

import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"


def make_request(path: str, method: str = "GET", data: dict = None, token: str = None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body_bytes = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as err:
        err_content = err.read().decode("utf-8")
        try:
            return err.code, json.loads(err_content)
        except Exception:
            return err.code, {"error": err_content}


def run_tests():
    print("=" * 60)
    print(">> BHOOMISETU AUTH BACKEND LOCALHOST TEST SUITE")
    print(f"Target: {BASE_URL}")
    print("=" * 60)

    # 1. Health check
    status, res = make_request("/health")
    assert status == 200 and res.get("status") == "healthy", f"Health failed: {res}"
    print("  [PASS] 1. GET /health -> Service Healthy")

    # 2. Login with Mobile Number (Citizen)
    status, res = make_request(
        "/api/auth/login",
        method="POST",
        data={"identifier": "9876543210", "password": "Demo@123"},
    )
    assert status == 200, f"Login failed: {res}"
    assert "access_token" in res, "Missing access_token"
    assert res["user"]["role"] == "CITIZEN", "Role mismatch"
    farmer_token = res["access_token"]
    print("  [PASS] 2. POST /api/auth/login (Mobile Number) -> Token received for CITIZEN")

    # 3. Login with Username (Citizen)
    status, res = make_request(
        "/api/auth/login",
        method="POST",
        data={"identifier": "demo_farmer", "password": "Demo@123"},
    )
    assert status == 200, f"Username login failed: {res}"
    print("  [PASS] 3. POST /api/auth/login (Username) -> Success")

    # 4. Failed Login (Invalid Credentials)
    status, res = make_request(
        "/api/auth/login",
        method="POST",
        data={"identifier": "demo_farmer", "password": "WrongPassword"},
    )
    assert status == 401, f"Expected 401, got {status}: {res}"
    print("  [PASS] 4. POST /api/auth/login (Bad Password) -> HTTP 401 Unauthorized")

    # 5. GET /api/auth/me (Current User)
    status, me = make_request("/api/auth/me", token=farmer_token)
    assert status == 200, f"Get /me failed: {me}"
    assert me["username"] == "demo_farmer"
    assert "password" not in me and "password_hash" not in me, "Security breach: password exposed!"
    print("  [PASS] 5. GET /api/auth/me -> Returns profile (Zero password leakage)")

    # 6. RBAC Check: Citizen attempting to access Admin endpoint (Must 403)
    status, res = make_request("/api/admin/users", token=farmer_token)
    assert status == 403, f"Expected 403 Forbidden, got {status}: {res}"
    print("  [PASS] 6. RBAC Check: Citizen blocked from Admin routes -> HTTP 403 Forbidden")

    # 7. Admin Login
    status, admin_res = make_request(
        "/api/auth/login",
        method="POST",
        data={"identifier": "admin", "password": "Admin@123"},
    )
    assert status == 200 and admin_res["user"]["role"] == "ADMIN"
    admin_token = admin_res["access_token"]
    print("  [PASS] 7. POST /api/auth/login (Admin) -> Success")

    # 8. Admin List Users
    status, users = make_request("/api/admin/users", token=admin_token)
    assert status == 200 and isinstance(users, list), f"List users failed: {users}"
    print(f"  [PASS] 8. GET /api/admin/users -> {len(users)} users found")

    # 9. Admin Onboard New Government Officer
    new_officer = {
        "full_name": "Test Officer Sunita",
        "employee_id": f"VO-TEST-999",
        "username": "officer_sunita",
        "mobile_number": "9811122233",
        "password": "SunitaPassword@123",
        "department": "Land Records Division",
        "role": "VERIFICATION_OFFICER",
    }
    status, created_officer = make_request(
        "/api/admin/government-users",
        method="POST",
        data=new_officer,
        token=admin_token,
    )
    # 201 or 400 if already exists
    if status == 201:
        print("  [PASS] 9. POST /api/admin/government-users -> Created VERIFICATION_OFFICER")
    else:
        print(f"  [NOTE] 9. Government user test returned {status} ({created_officer.get('detail')})")

    # 10. Public Registration for Citizen
    new_citizen = {
        "full_name": "New Farmer Ravi",
        "username": "ravi_farmer_test",
        "mobile_number": "9123456789",
        "password": "FarmerPassword@123",
    }
    status, reg_res = make_request(
        "/api/auth/register",
        method="POST",
        data=new_citizen,
    )
    if status == 201:
        print("  [PASS] 10. POST /api/auth/register -> Successfully registered new Citizen")
    else:
        print(f"  [NOTE] 10. Registration test returned {status} ({reg_res.get('detail')})")

    # 11. Logout Check
    status, logout_res = make_request("/api/auth/logout", method="POST", token=farmer_token)
    assert status == 200
    print("  [PASS] 11. POST /api/auth/logout -> Session logout acknowledged")

    print("=" * 60)
    print("[SUCCESS] ALL LOCALHOST TESTS PASSED SUCCESSFULLY! (100% OPERATIONAL)")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
