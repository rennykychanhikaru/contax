-- Add renny@getconvo.ai to the existing Contax Demo Org

BEGIN;

-- Get the user ID and org ID
WITH user_org AS (
    SELECT 
        u.id as user_id,
        o.id as org_id
    FROM auth.users u
    CROSS JOIN organizations o
    WHERE u.email = 'renny@getconvo.ai'
    AND o.name = 'Contax Demo Org'
    LIMIT 1
),
-- Get or create the owner role for this org
owner_role AS (
    SELECT id, organization_id
    FROM organization_roles
    WHERE organization_id = (SELECT org_id FROM user_org)
    AND name = 'owner'
    LIMIT 1
)
-- Add the user as a member with owner role
INSERT INTO organization_members (organization_id, user_id, role_id, invited_by, joined_at)
SELECT 
    uo.org_id,
    uo.user_id,
    owr.id,
    uo.user_id,  -- self-invited
    NOW()
FROM user_org uo
JOIN owner_role owr ON owr.organization_id = uo.org_id
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Permissions are handled through the role system, no need for separate permissions table

COMMIT;

-- Verify the result
SELECT 
    u.email,
    o.name as org_name,
    o.id as org_id,
    r.name as role_name,
    om.joined_at
FROM auth.users u
JOIN organization_members om ON u.id = om.user_id
JOIN organizations o ON o.id = om.organization_id
JOIN organization_roles r ON r.id = om.role_id
WHERE u.email = 'renny@getconvo.ai';