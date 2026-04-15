#!/usr/bin/env python3
"""
RBAC Test Script - Demonstrates the email-based role assignment system

This script shows how the RBAC system works:
1. Users register with email addresses from mapped domains
2. Their default_role is automatically assigned based on email domain
3. Superadmins can view users and their roles
4. Superadmins can assign users to projects with specific roles
"""

import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import Settings
from app.models.entities import DepartmentRole


def test_email_domain_mapping():
    """Test the email domain to role mapping"""
    print("=" * 60)
    print("Testing Email Domain to Role Mapping")
    print("=" * 60)
    
    # Create settings instance
    settings = Settings()
    
    test_cases = [
        ("user@contracts.com", "contracts"),
        ("user@design.com", "design"),
        ("user@qs.com", "qs"),
        ("user@unknown.com", None),  # Should return None (default to contracts)
        ("admin@company.org", None),  # Should return None (default to contracts)
    ]
    
    for email, expected_role in test_cases:
        actual_role = settings.get_role_for_email(email)
        status = "✓" if (actual_role == expected_role or (expected_role is None and actual_role is None)) else "✗"
        print(f"{status} Email: {email:<30} → Role: {actual_role or 'None (defaults to contracts)'}")
    
    print()


def test_department_roles():
    """Test DepartmentRole enum"""
    print("=" * 60)
    print("Testing Available Department Roles")
    print("=" * 60)
    
    for role in DepartmentRole:
        print(f"  - {role.value}")
    
    print()


def test_config_parsing():
    """Test JSON parsing of email domain mapping"""
    print("=" * 60)
    print("Testing Config JSON Parsing")
    print("=" * 60)
    
    settings = Settings()
    try:
        mapping = json.loads(settings.email_domain_role_mapping)
        print(f"Current email domain mapping:")
        for domain, role in mapping.items():
            print(f"  {domain:<30} → {role}")
        if not mapping:
            print("  (empty - all users default to 'contracts')")
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in EMAIL_DOMAIN_ROLE_MAPPING: {e}")
    
    print()


def show_rbac_workflow():
    """Show the RBAC workflow"""
    print("=" * 60)
    print("RBAC Workflow Example")
    print("=" * 60)
    
    print("""
1. USER REGISTRATION
   ├─ User enters email: alice@contracts.com
   ├─ System extracts domain: contracts.com
   └─ System checks mapping → assigns default_role: "contracts"

2. SUPERADMIN VERIFICATION
   ├─ Superadmin calls: GET /users
   ├─ Response includes alice's default_role: "contracts"
   └─ Superadmin confirms the role is correct

3. PROJECT ASSIGNMENT
   ├─ Superadmin calls: POST /projects/{project_id}/members
   ├─ With: {"user_id": "alice_uuid", "role": "contracts"}
   └─ Alice is now a member of the project with "contracts" role

4. ACCESS CONTROL
   ├─ Alice tries to access /projects/{project_id}/boq-versions/create-with-upload
   ├─ System checks: user has "contracts" role for this project
   ├─ ✓ Access GRANTED
   └─ Endpoint executes successfully

5. ROLE FLEXIBILITY
   ├─ Bob registered with email bob@design.com (default_role: "design")
   ├─ Superadmin can override and assign him as "contracts" to a specific project
   └─ Bob's default_role stays "design", but project membership is "contracts"
    """)
    
    print()


def show_api_endpoints():
    """Show relevant API endpoints"""
    print("=" * 60)
    print("Key API Endpoints for RBAC")
    print("=" * 60)
    
    print("""
USER MANAGEMENT:
  GET     /users                              - List all users with their roles
  POST    /auth/register                      - Register (auto-assigns default_role)
  GET     /auth/me                            - Current user info with default_role

PROJECT MEMBERSHIP:
  GET     /projects                           - List user's projects
  POST    /projects/{id}/members              - Assign user to project (admin only)
  GET     /projects/{id}/summary              - Project summary (with user's role)

ACCESS CONTROL:
  POST    /projects/{id}/boq-versions/create-with-upload  - Requires 'contracts' role
  POST    /projects/{id}/boq-versions                     - Requires 'contracts' role
  POST    /boq-versions/{id}/import                       - Requires 'contracts' role
  POST    /boq-versions/{id}/lock                         - Requires 'contracts' role
    """)
    
    print()


def show_troubleshooting():
    """Show common troubleshooting scenarios"""
    print("=" * 60)
    print("Troubleshooting: '403 Insufficient role' Error")
    print("=" * 60)
    
    print("""
COMMON CAUSES:

1. User is not a project member
   └─ Solution: Superadmin must assign user to project via POST /projects/{id}/members

2. User has wrong role for that project
   ├─ Cause: Email domain mapped to 'design' but endpoint requires 'contracts'
   └─ Solution: Superadmin can reassign user to 'contracts' role in that project

3. User is inactive or not authenticated
   └─ Solution: Check token validity and user.is_active status

4. Email domain mapping not configured
   ├─ Cause: EMAIL_DOMAIN_ROLE_MAPPING is empty or invalid JSON
   └─ Solution: Update .env with proper JSON: '{"domain.com": "role"}'

VERIFICATION STEPS:

  Step 1: List users to see their default_role
          curl -H "Authorization: Bearer $TOKEN" http://localhost:8003/users
  
  Step 2: Check current user info
          curl -H "Authorization: Bearer $TOKEN" http://localhost:8003/auth/me
  
  Step 3: View project members and their roles
          curl -H "Authorization: Bearer $TOKEN" http://localhost:8003/projects/{id}/summary
  
  Step 4: Manually assign user to project if needed
          curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \\
               -H "Content-Type: application/json" \\
               -d '{"user_id": "uuid", "role": "contracts"}' \\
               http://localhost:8003/projects/{id}/members
    """)
    
    print()


if __name__ == "__main__":
    print("\n")
    test_email_domain_mapping()
    test_department_roles()
    test_config_parsing()
    show_rbac_workflow()
    show_api_endpoints()
    show_troubleshooting()
    
    print("=" * 60)
    print("For more info, see: RBAC_SETUP.md")
    print("=" * 60)
    print()
