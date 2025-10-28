# PRD: Organization-Level Feature Flag Management in Super Admin Panel

**Status:** Draft
**Priority:** High
**Created:** 2025-10-29
**Last Updated:** 2025-10-29

---

## Executive Summary

The current Super Admin Panel only supports account-level and user-level feature flag overrides through the `feature_flag_overrides` table. However, the ElevenLabs premium voices feature (and potentially other features) requires **organization-level** feature flag management through the `organization_feature_flags` table. This PRD outlines the requirements to extend the Super Admin Panel to support organization-level feature flag management.

---

## Problem Statement

### Current Situation

1. **Two Feature Flag Systems:**
   - `feature_flag_overrides`: Account/user-level overrides (managed via Super Admin Panel)
   - `organization_feature_flags`: Organization-level overrides (no admin UI, requires manual SQL)

2. **Pain Points:**
   - Admins cannot enable organization-level features (like ElevenLabs voices) through the UI
   - Manual SQL queries required for organization feature management
   - Inconsistent admin experience between feature types
   - No visibility into which organizations have which features enabled

3. **Error Messages:**
   ```
   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
   ```
   This occurs when trying to enable organization-level features through account/user override endpoints.

### Impact

- **Admin Productivity:** Admins waste time manually running SQL queries
- **Error-Prone:** Manual SQL increases risk of mistakes
- **Poor UX:** Inconsistent admin interface
- **Feature Adoption:** Difficult to enable/disable features for organizations quickly

---

## Goals & Success Criteria

### Goals

1. ✅ Enable admins to manage organization-level feature flags through the Super Admin Panel
2. ✅ Provide visibility into which organizations have which features enabled
3. ✅ Support bulk enable/disable operations for organizations
4. ✅ Maintain consistency with existing account/user override UX
5. ✅ Support both organization-level and account/user-level overrides in a unified interface

### Success Criteria

- [ ] Admins can enable/disable organization features without SQL
- [ ] Search and filter organizations by feature flag status
- [ ] Bulk operations complete in <5 seconds for 100 organizations
- [ ] Zero SQL queries required for day-to-day feature flag management
- [ ] Audit log captures all organization feature flag changes

---

## User Stories

### As a Super Admin...

**Story 1: Enable Feature for Organization**

```
As a super admin
I want to enable ElevenLabs voices for a specific organization
So that they can use premium voice features without upgrading their plan
```

**Acceptance Criteria:**

- Can search for organization by name/ID
- Can see current feature flag status for that organization
- Can toggle feature on/off with one click
- Change is reflected immediately in the application
- Audit log records the change

---

**Story 2: View All Organizations with Feature**

```
As a super admin
I want to see a list of all organizations with ElevenLabs voices enabled
So that I can track premium feature usage
```

**Acceptance Criteria:**

- Can filter organizations by feature flag status
- Can see when feature was enabled and by whom
- Can export list to CSV for reporting
- Shows organization metadata (name, subscription tier, usage stats)

---

**Story 3: Bulk Enable/Disable Feature**

```
As a super admin
I want to enable a feature for multiple organizations at once
So that I can efficiently roll out new features or run promotions
```

**Acceptance Criteria:**

- Can select multiple organizations
- Can enable/disable feature for all selected orgs
- Progress indicator shows operation status
- Confirmation dialog prevents accidental bulk changes
- Audit log records each individual change

---

**Story 4: Manage Feature Flag Hierarchy**

```
As a super admin
I want to understand the feature flag hierarchy (global → org → account → user)
So that I can troubleshoot feature access issues
```

**Acceptance Criteria:**

- UI shows which level (global/org/account/user) a feature is enabled at
- Clear indication of override precedence
- Can see effective feature status for a specific user
- Can trace why a user has/doesn't have access to a feature

---

## Technical Requirements

### Database Schema

**Existing Tables (No Changes Needed):**

```sql
-- Organization-level feature flags
CREATE TABLE public.organization_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, feature_flag_id)
);

-- Account/user-level feature flags (existing)
CREATE TABLE public.feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_flag_overrides_target_check CHECK (
    (account_id IS NOT NULL AND user_id IS NULL) OR
    (account_id IS NULL AND user_id IS NOT NULL)
  )
);
```

**Indexes (Already Exist):**

```sql
CREATE INDEX idx_org_feature_flags_org ON organization_feature_flags (organization_id);
CREATE INDEX idx_org_feature_flags_flag ON organization_feature_flags (feature_flag_id);
```

---

### API Endpoints to Create

#### 1. List Organizations with Feature Flag Status

**Endpoint:** `GET /api/admin/feature-flags/[flagId]/organizations`

**Query Parameters:**

- `enabled`: `true|false|all` (default: `all`)
- `search`: string (search by org name)
- `page`: number
- `limit`: number (default: 50, max: 100)

**Response:**

```typescript
{
  organizations: [
    {
      id: string;
      name: string;
      feature_enabled: boolean;
      enabled_at: string | null;
      enabled_by: string | null; // admin user ID
      metadata: Record<string, unknown>;
      subscription_tier?: string;
      member_count?: number;
    }
  ],
  total: number;
  page: number;
  limit: number;
}
```

---

#### 2. Toggle Feature for Organization

**Endpoint:** `POST /api/admin/feature-flags/[flagId]/organizations/[orgId]`

**Request Body:**

```typescript
{
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
```

**Response:**

```typescript
{
  organization_id: string;
  feature_flag_id: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

**Implementation:**

```typescript
// Upsert organization feature flag
await admin.from('organization_feature_flags').upsert(
  {
    organization_id: params.orgId,
    feature_flag_id: params.flagId,
    enabled: body.enabled,
    metadata: body.metadata || {},
  },
  { onConflict: 'organization_id,feature_flag_id' },
);

// Log to audit trail
await admin.from('admin_audit_log').insert({
  admin_user_id: authResult.userId,
  action_type: 'ORG_FEATURE_FLAG_TOGGLE',
  target_type: 'organization',
  target_id: params.orgId,
  metadata: {
    feature_flag_id: params.flagId,
    enabled: body.enabled,
  },
});
```

---

#### 3. Bulk Toggle Feature for Organizations

**Endpoint:** `POST /api/admin/feature-flags/[flagId]/organizations/bulk`

**Request Body:**

```typescript
{
  organization_ids: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
}
```

**Response:**

```typescript
{
  success: number;
  failed: number;
  errors: Array<{
    organization_id: string;
    error: string;
  }>;
}
```

**Constraints:**

- Max 100 organizations per request
- Transaction-based (all or nothing)
- Rate limit: 10 requests/minute per admin

---

#### 4. Get Feature Flag Status for Organization

**Endpoint:** `GET /api/admin/organizations/[orgId]/feature-flags`

**Response:**

```typescript
{
  feature_flags: [
    {
      flag_id: string;
      flag_key: string;
      flag_name: string;
      enabled: boolean;
      source: 'global' | 'organization';
      metadata: Record<string, unknown>;
    }
  ]
}
```

---

### UI Components to Build

#### 1. Organization Feature Flags Tab

**Location:** `/app/admin/feature-flags/[flagId]/organizations`

**Components:**

```typescript
// OrganizationFeatureFlagsTable.tsx
interface Props {
  flagId: string;
}

<OrganizationFeatureFlagsTable
  flagId={flagId}
  onToggle={(orgId, enabled) => handleToggle(orgId, enabled)}
  onBulkToggle={(orgIds, enabled) => handleBulkToggle(orgIds, enabled)}
/>
```

**Features:**

- Checkbox selection for bulk operations
- Search/filter by organization name
- Filter by enabled/disabled status
- Pagination (50 per page)
- Toggle switch for quick enable/disable
- Metadata editor modal
- Export to CSV

---

#### 2. Organization Feature Flag Badge

**Component:** Show feature flag status in organization details page

```typescript
// OrganizationFeatureFlagBadges.tsx
<div className="flex gap-2">
  {enabledFlags.map(flag => (
    <Badge key={flag.id} variant="success">
      {flag.name}
    </Badge>
  ))}
</div>
```

---

#### 3. Feature Flag Hierarchy Viewer

**Component:** Show feature flag resolution hierarchy

```typescript
// FeatureFlagHierarchy.tsx
interface Props {
  userId: string;
  featureFlagKey: string;
}

// Shows:
// ✅ Global: Disabled
// ✅ Organization: Enabled (override)
// ⚠️ Account: Not set
// ⚠️ User: Not set
// → Final Result: Enabled (from Organization)
```

---

## Implementation Plan

### Phase 1: Backend API (Week 1)

**Tasks:**

1. Create `/api/admin/feature-flags/[flagId]/organizations` endpoints
2. Add organization feature flag toggle logic
3. Implement bulk operations
4. Add audit logging
5. Write API tests

**Deliverables:**

- [ ] 4 new API routes
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] API documentation

---

### Phase 2: Frontend UI (Week 2)

**Tasks:**

1. Build OrganizationFeatureFlagsTable component
2. Add organization tab to feature flag detail page
3. Implement search/filter functionality
4. Add bulk selection and toggle
5. Create metadata editor modal

**Deliverables:**

- [ ] Organization feature flags UI
- [ ] Responsive design (mobile + desktop)
- [ ] Loading states and error handling
- [ ] E2E tests

---

### Phase 3: Enhancements (Week 3)

**Tasks:**

1. Add CSV export functionality
2. Build feature flag hierarchy viewer
3. Add organization feature flag badges
4. Create admin analytics dashboard
5. Performance optimization

**Deliverables:**

- [ ] Export feature
- [ ] Hierarchy visualization
- [ ] Analytics dashboard
- [ ] Performance benchmarks

---

## Non-Functional Requirements

### Performance

- **List Organizations:** <500ms for 1000 organizations
- **Toggle Feature:** <200ms
- **Bulk Toggle:** <5s for 100 organizations
- **Search:** <300ms with debounce

### Security

- ✅ Super admin role required
- ✅ All changes logged to audit trail
- ✅ CSRF protection
- ✅ Rate limiting on bulk operations
- ✅ Input validation and sanitization

### Scalability

- Support 10,000+ organizations
- Efficient pagination (cursor-based for large datasets)
- Database indexes on frequently queried columns
- Caching for feature flag lookups

---

## Testing Strategy

### Unit Tests

```typescript
describe('OrganizationFeatureFlagService', () => {
  it('should enable feature for organization', async () => {
    const result = await toggleOrgFeatureFlag(orgId, flagId, true);
    expect(result.enabled).toBe(true);
  });

  it('should bulk enable for multiple organizations', async () => {
    const result = await bulkToggleOrgFeatureFlag(orgIds, flagId, true);
    expect(result.success).toBe(100);
  });

  it('should respect unique constraint', async () => {
    await toggleOrgFeatureFlag(orgId, flagId, true);
    await toggleOrgFeatureFlag(orgId, flagId, false); // Should update, not insert
    const count = await countOrgFeatureFlags(orgId, flagId);
    expect(count).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe('POST /api/admin/feature-flags/[flagId]/organizations/[orgId]', () => {
  it('should require super admin role', async () => {
    const response = await request(app)
      .post('/api/admin/feature-flags/123/organizations/456')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ enabled: true });

    expect(response.status).toBe(403);
  });

  it('should toggle feature flag', async () => {
    const response = await request(app)
      .post('/api/admin/feature-flags/123/organizations/456')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });

    expect(response.status).toBe(200);
    expect(response.body.enabled).toBe(true);
  });

  it('should log to audit trail', async () => {
    await request(app)
      .post('/api/admin/feature-flags/123/organizations/456')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });

    const logs = await getAuditLogs({ action_type: 'ORG_FEATURE_FLAG_TOGGLE' });
    expect(logs.length).toBeGreaterThan(0);
  });
});
```

### E2E Tests

```typescript
describe('Organization Feature Flags Admin', () => {
  it('should enable feature for organization via UI', async () => {
    await page.goto('/admin/feature-flags/elevenlabs_voices/organizations');
    await page.fill('[data-testid="org-search"]', 'Acme Corp');
    await page.click('[data-testid="toggle-switch-123"]');
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
  });

  it('should bulk enable feature for selected organizations', async () => {
    await page.goto('/admin/feature-flags/elevenlabs_voices/organizations');
    await page.click('[data-testid="select-all"]');
    await page.click('[data-testid="bulk-enable"]');
    await page.click('[data-testid="confirm-bulk-enable"]');
    await expect(page.locator('[data-testid="bulk-success"]')).toBeVisible();
  });
});
```

---

## Migration Strategy

### Database Migration

**No schema changes needed** - `organization_feature_flags` table already exists with proper constraints.

### Data Migration

**No data migration needed** - this is a new feature, no existing data to migrate.

### Rollout Plan

1. **Week 1:** Deploy backend API to staging
2. **Week 2:** Deploy frontend to staging + QA testing
3. **Week 3:** Deploy to production + monitor
4. **Week 4:** Collect feedback and iterate

---

## Risks & Mitigation

### Risk 1: Performance Degradation

**Risk:** Bulk operations on 1000+ organizations could slow down the database

**Mitigation:**

- Implement batch processing (100 orgs at a time)
- Use database transactions efficiently
- Add rate limiting
- Monitor query performance

---

### Risk 2: Audit Log Bloat

**Risk:** Frequent toggles generate excessive audit log entries

**Mitigation:**

- Implement log rotation (archive after 90 days)
- Use efficient indexing
- Consider aggregating similar events

---

### Risk 3: Feature Flag Complexity

**Risk:** Multiple override levels (global/org/account/user) create confusion

**Mitigation:**

- Clear UI showing hierarchy
- Documentation and training
- Debugging tools (hierarchy viewer)
- Default to organization-level for most features

---

## Future Enhancements

### Phase 4: Advanced Features

1. **Scheduled Feature Toggles**
   - Enable feature at specific date/time
   - Auto-disable after trial period

2. **Feature Flag Analytics**
   - Usage metrics per organization
   - Cost tracking for premium features
   - ROI analysis

3. **Feature Flag Templates**
   - Pre-configured bundles (e.g., "Enterprise Package")
   - One-click enable multiple features

4. **Self-Service Feature Management**
   - Allow org admins to request features
   - Approval workflow for super admins

---

## Success Metrics

### Operational Metrics

- **Time to Enable Feature:** <1 minute (from admin decision to org access)
- **SQL Queries per Day:** 0 (all through UI)
- **Admin Efficiency:** 80% reduction in time spent on feature flag management

### Business Metrics

- **Feature Adoption:** Track usage of ElevenLabs voices after enablement
- **Support Tickets:** Reduce feature-flag-related tickets by 90%
- **Customer Satisfaction:** Survey feedback on feature rollout speed

---

## Appendix

### Related Documents

- [PRD: ElevenLabs Voice Models](./PRD-ElevenLabs-Voice-Models.md)
- [Database Schema: Feature Flags](../supabase/migrations/20251228_super_admin_panel_schema.sql)
- [Database Schema: Organization Feature Flags](../supabase/migrations/20251021211520_elevenlabs_feature_flags.sql)

### References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Feature Flags Best Practices](https://martinfowler.com/articles/feature-toggles.html)

---

## Changelog

| Date       | Version | Author | Changes              |
| ---------- | ------- | ------ | -------------------- |
| 2025-10-29 | 1.0     | System | Initial PRD creation |
