-- Fix for renny@getconvo.ai user who was created before multi-tenant setup
-- This script creates an organization and proper membership for the existing user

-- First, let's check if the user exists and get their ID
DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_org_exists BOOLEAN;
    v_owner_role_id UUID;
BEGIN
    -- Get the user ID for renny@getconvo.ai
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'renny@getconvo.ai'
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'User renny@getconvo.ai not found';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Found user with ID: %', v_user_id;
    
    -- Check if user already has an organization
    SELECT COUNT(*) > 0 INTO v_org_exists
    FROM organization_members
    WHERE user_id = v_user_id;
    
    IF v_org_exists THEN
        RAISE NOTICE 'User already has an organization membership';
        
        -- Get the organization ID for reference
        SELECT organization_id INTO v_org_id
        FROM organization_members
        WHERE user_id = v_user_id
        LIMIT 1;
        
        RAISE NOTICE 'Organization ID: %', v_org_id;
        RETURN;
    END IF;
    
    -- Create a new organization for the user
    INSERT INTO organizations (
        id,
        name,
        slug,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        'Renny''s Organization',
        'renny-org-' || substr(md5(random()::text), 1, 8),
        NOW(),
        NOW()
    ) RETURNING id INTO v_org_id;
    
    RAISE NOTICE 'Created organization with ID: %', v_org_id;
    
    -- Create owner role for this organization if it doesn't exist
    INSERT INTO organization_roles (
        id,
        organization_id,
        name,
        description,
        permissions,
        is_system,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_org_id,
        'owner',
        'Organization owner with full permissions',
        '["*"]'::jsonb, -- Full permissions in JSONB format
        true,
        NOW()
    ) RETURNING id INTO v_owner_role_id;
    
    RAISE NOTICE 'Created owner role with ID: %', v_owner_role_id;
    
    -- Create organization membership with owner role
    INSERT INTO organization_members (
        organization_id,
        user_id,
        role_id,
        invited_by,
        joined_at
    ) VALUES (
        v_org_id,
        v_user_id,
        v_owner_role_id,
        v_user_id, -- self-invited as owner
        NOW()
    );
    
    RAISE NOTICE 'Created organization membership with owner role';
    
    -- Create default permissions for the owner
    INSERT INTO organization_permissions (
        organization_id,
        user_id,
        permission,
        granted_by,
        created_at
    ) VALUES 
    (v_org_id, v_user_id, 'organization.read', v_user_id, NOW()),
    (v_org_id, v_user_id, 'organization.write', v_user_id, NOW()),
    (v_org_id, v_user_id, 'organization.delete', v_user_id, NOW()),
    (v_org_id, v_user_id, 'members.read', v_user_id, NOW()),
    (v_org_id, v_user_id, 'members.write', v_user_id, NOW()),
    (v_org_id, v_user_id, 'members.delete', v_user_id, NOW()),
    (v_org_id, v_user_id, 'billing.read', v_user_id, NOW()),
    (v_org_id, v_user_id, 'billing.write', v_user_id, NOW()),
    (v_org_id, v_user_id, 'twilio.read', v_user_id, NOW()),
    (v_org_id, v_user_id, 'twilio.write', v_user_id, NOW()),
    (v_org_id, v_user_id, 'calendar.read', v_user_id, NOW()),
    (v_org_id, v_user_id, 'calendar.write', v_user_id, NOW()),
    (v_org_id, v_user_id, 'agents.read', v_user_id, NOW()),
    (v_org_id, v_user_id, 'agents.write', v_user_id, NOW());
    
    RAISE NOTICE 'Created default permissions for owner';
    
    -- Create a personal account record if it doesn't exist
    INSERT INTO accounts (
        id,
        name,
        slug,
        created_at,
        updated_at,
        created_by,
        updated_by
    ) VALUES (
        v_org_id,  -- Using same ID as organization for personal account
        'Renny''s Personal Account',
        'renny-personal-' || substr(md5(random()::text), 1, 8),
        NOW(),
        NOW(),
        v_user_id,
        v_user_id
    ) ON CONFLICT (id) DO NOTHING;
    
    -- Link the account to the user
    INSERT INTO accounts_v2 (
        account_id,
        user_id,
        created_at,
        updated_at,
        created_by,
        updated_by
    ) VALUES (
        v_org_id,
        v_user_id,
        NOW(),
        NOW(),
        v_user_id,
        v_user_id
    ) ON CONFLICT (account_id, user_id) DO NOTHING;
    
    RAISE NOTICE 'Setup complete! User renny@getconvo.ai now has:';
    RAISE NOTICE '- Organization ID: %', v_org_id;
    RAISE NOTICE '- Role: owner';
    RAISE NOTICE '- All necessary permissions';
    
END $$;