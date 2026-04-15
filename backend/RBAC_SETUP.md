# Email Domain to Role Mapping Configuration

## How it works:
When a user registers with their email address, the system automatically assigns them a **default role** based on their email domain. Superadmins can then assign these users to specific projects with the role of their choice.

## Setup:

Add this to your `.env` file:

```
EMAIL_DOMAIN_ROLE_MAPPING='{"contracts.com": "contracts", "design.co.uk": "design", "qs.com": "qs"}'
```

### Format:
- **Key**: Email domain (e.g., `contracts.com`)
- **Value**: Role name - must be one of: `contracts`, `design`, `qs`, or `admin`

### Examples:

1. **Single domain with one role:**
   ```
   EMAIL_DOMAIN_ROLE_MAPPING='{"company.com": "contracts"}'
   ```

2. **Multiple domains with different roles:**
   ```
   EMAIL_DOMAIN_ROLE_MAPPING='{"contracts.org": "contracts", "design.org": "design", "qs.org": "qs"}'
   ```

3. **Empty mapping (everyone gets "contracts" as default):**
   ```
   EMAIL_DOMAIN_ROLE_MAPPING='{}'
   ```

## User Flow:

1. **Registration**: User registers with email → System extracts domain → Assigns `default_role`
2. **Verification**: Superadmin views users list (`GET /users`) → Sees each user's `default_role`
3. **Project Assignment**: Superadmin assigns user to project with desired role (`POST /projects/{project_id}/members`)

## Endpoint Usage:

### List all users with their default roles:
```bash
GET /users
Header: Authorization: Bearer {token}
```

Response includes:
```json
{
  "id": "uuid",
  "email": "user@contracts.com",
  "full_name": "John Doe",
  "default_role": "contracts",
  "is_active": true,
  "is_superuser": false
}
```

### Check current user's role:
```bash
GET /auth/me
Header: Authorization: Bearer {token}
```

Response includes `default_role` and project memberships with their roles.

### Assign user to project:
```bash
POST /projects/{project_id}/members
Header: Authorization: Bearer {token}
Content-Type: application/json

{
  "user_id": "uuid",
  "role": "contracts"
}
```

## Notes:
- If a user's email domain doesn't match any mapping, they default to `"contracts"` role
- The `default_role` is used for quick reference; when assigning to specific projects, the superadmin can choose any valid role
- Superusers can assign any role to any project, regardless of the user's `default_role`
