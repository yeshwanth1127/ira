# RBAC Implementation - Complete Summary

## What Was Implemented

You now have a complete **Role-Based Access Control (RBAC)** system that automatically assigns user roles based on their email domain. Here's what was added:

### 1. **Email Domain to Role Mapping** (`app/core/config.py`)
   - Added `EMAIL_DOMAIN_ROLE_MAPPING` configuration to `.env`
   - Supports JSON format: `'{"contracts.com": "contracts", "design.com": "design", ...}'`
   - Method `get_role_for_email(email)` automatically extracts domain and maps to role

### 2. **User Default Role** (`app/models/entities.py`)
   - Added `default_role: DepartmentRole` field to User model
   - Defaults to `"contracts"` if no mapping found
   - Database migration (007_add_user_default_role.py) applied successfully

### 3. **Auto-Role Assignment on Registration** (`app/api/auth.py`)
   - When user registers, system:
     1. Extracts email domain
     2. Looks up mapped role
     3. Assigns `default_role` automatically
   - Example: User registers as `alice@contracts.com` → `default_role` = `"contracts"`

### 4. **Updated API Schemas** (`app/schemas/user.py`)
   - `UserOut` now includes `default_role` field
   - `GET /users` returns all users with their default roles
   - `GET /auth/me` includes current user's `default_role`

### 5. **Documentation & Testing**
   - `RBAC_SETUP.md` - Complete setup and usage guide
   - `test_rbac.py` - Comprehensive test script demonstrating the system

---

## How It Works

### User Registration Flow
```
User registers with email@contracts.com
        ↓
System extracts domain: contracts.com
        ↓
Looks up in mapping: "contracts.com" → "contracts"
        ↓
Assigns default_role = "contracts"
```

### Project Access Control Flow
```
User attempts: POST /projects/{id}/boq-versions/create-with-upload
        ↓
Endpoint checks: require_project_access(user, db, project_id, role_contracts())
        ↓
Does user have 'contracts' role? (from ProjectMembership)
        ├─ YES → ✓ Access granted
        └─ NO → ✗ 403 Forbidden "Insufficient role"
```

### Superadmin Workflow
```
1. List users to see their default roles
   GET /users

2. Identify new user needing project access
   
3. Assign user to project with appropriate role
   POST /projects/{id}/members
   Body: {"user_id": "uuid", "role": "contracts"}

4. User can now access endpoints requiring that role
```

---

## Configuration

### Setup in `.env`

```bash
# Map email domains to roles (JSON format)
EMAIL_DOMAIN_ROLE_MAPPING='{"contracts.com": "contracts", "design.com": "design", "qs.com": "qs"}'
```

### Available Roles
- `contracts` - Contracts management (BOQ creation, uploads)
- `design` - Design document management
- `qs` - Quantity Surveyor (comparative analysis)
- `admin` - Administrative access (superuser required)

---

## API Endpoints Summary

### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user (auto-assigns role) |
| GET | `/auth/me` | Current user info + default_role |
| GET | `/users` | List all users with roles (admin) |

### Project Membership
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List user's projects |
| POST | `/projects/{id}/members` | Assign user to project (admin) |
| GET | `/projects/{id}/summary` | Project summary with roles |

### Protected Endpoints (Examples)
| Method | Endpoint | Required Role |
|--------|----------|---------------|
| POST | `/projects/{id}/boq-versions/create-with-upload` | contracts |
| POST | `/projects/{id}/boq-versions` | contracts |
| POST | `/boq-versions/{id}/import` | contracts |
| POST | `/boq-versions/{id}/lock` | contracts |

---

## Troubleshooting 403 Error

If you get `403 Forbidden - "Insufficient role"`:

1. **Check user exists and has correct default_role**
   ```bash
   GET /users
   # Look for user's email and default_role
   ```

2. **Verify user is assigned to the project**
   ```bash
   GET /projects/{id}/summary
   # Check if user appears in memberships
   ```

3. **Verify user has correct role for that project**
   ```bash
   GET /auth/me
   # Check memberships[].role matches requirement
   ```

4. **Assign/update user role if needed**
   ```bash
   POST /projects/{id}/members
   {
     "user_id": "uuid",
     "role": "contracts"
   }
   ```

---

## Testing the System

Run the included test script:

```bash
cd backend
python test_rbac.py
```

This will:
- ✓ Verify email domain mapping
- ✓ Show available roles
- ✓ Parse configuration from .env
- ✓ Display workflow examples
- ✓ Show troubleshooting steps

---

## Key Features

✅ **Automatic Role Assignment** - Users get roles based on email domain  
✅ **Flexible Override** - Admins can assign any role to any project  
✅ **Clear Role Separation** - 4 distinct roles with different permissions  
✅ **Audit Trail** - All role assignments and changes are logged  
✅ **Easy Configuration** - Simple JSON mapping in .env  
✅ **Database Persistence** - Roles stored in database with migration  
✅ **No Manual Setup Needed** - Works automatically after registration  

---

## Files Modified/Created

| File | Change |
|------|--------|
| `app/core/config.py` | Added EMAIL_DOMAIN_ROLE_MAPPING config + get_role_for_email() |
| `app/models/entities.py` | Added default_role field to User model |
| `app/api/auth.py` | Updated register() to assign role based on email |
| `app/schemas/user.py` | Updated UserOut to include default_role |
| `alembic/versions/007_add_user_default_role.py` | Database migration |
| `.env` | Added EMAIL_DOMAIN_ROLE_MAPPING config example |
| `.env.example` | Added documentation |
| `RBAC_SETUP.md` | Complete setup guide |
| `test_rbac.py` | Test script |

---

## What to Do Next

1. **Update Email Domain Mapping**
   - Edit `.env`
   - Set EMAIL_DOMAIN_ROLE_MAPPING to match your organization

2. **Test with New Users**
   - Register users with different email domains
   - Verify they get correct default_role

3. **Assign Users to Projects**
   - Use superadmin account to assign users
   - Test endpoint access with different roles

4. **Monitor Access Logs**
   - Check audit trail for role assignments
   - Verify only authorized users can access endpoints

---

## Next Steps (Optional Enhancements)

- [ ] Add role-based dashboard filtering
- [ ] Create admin UI for email-to-role mapping
- [ ] Add role-based webhooks and notifications
- [ ] Implement role inheritance hierarchy
- [ ] Add temporary role elevation with timeout
