-- Simple fix for renny@getconvo.ai user
-- This directly creates what's needed without complex error handling

BEGIN;

-- Get user ID
WITH user_info AS (
    SELECT id FROM auth.users WHERE email = 'renny@getconvo.ai' LIMIT 1
),
-- Create organization
new_org AS (
    INSERT INTO organizations (name, slug)
    SELECT 
        'Renny''s Organization',
        'renny-' || substr(md5(random()::text), 1, 8)
    FROM user_info
    WHERE EXISTS (SELECT 1 FROM user_info)
    AND NOT EXISTS (
        SELECT 1 FROM organization_members om 
        WHERE om.user_id = (SELECT id FROM user_info)
    )
    RETURNING id
),
-- Create owner role
new_role AS (
    INSERT INTO organization_roles (organization_id, name, description, permissions, is_system)
    SELECT 
        id,
        'owner',
        'Organization owner',
        '["*"]'::jsonb,
        true
    FROM new_org
    ON CONFLICT (organization_id, name) 
    DO UPDATE SET permissions = EXCLUDED.permissions
    RETURNING id, organization_id
)
-- Create membership
INSERT INTO organization_members (organization_id, user_id, role_id, invited_by)
SELECT 
    nr.organization_id,
    ui.id,
    nr.id,
    ui.id
FROM new_role nr, user_info ui
WHERE NOT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE user_id = ui.id 
    AND organization_id = nr.organization_id
);

-- Also create the default permissions
WITH user_org AS (
    SELECT 
        om.organization_id,
        om.user_id
    FROM organization_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE u.email = 'renny@getconvo.ai'
    LIMIT 1
)
INSERT INTO organization_permissions (organization_id, user_id, permission, granted_by)
SELECT 
    organization_id,
    user_id,
    unnest(ARRAY[
        'organization.read',
        'organization.write',
        'organization.delete',
        'members.read',
        'members.write',
        'members.delete',
        'billing.read',
        'billing.write',
        'twilio.read',
        'twilio.write',
        'calendar.read',
        'calendar.write',
        'agents.read',
        'agents.write'
    ]),
    user_id
FROM user_org
ON CONFLICT DO NOTHING;

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