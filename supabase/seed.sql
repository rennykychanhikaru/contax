-- Seed demo organization and default settings
insert into organizations (id, name, phone_number, timezone, business_hours, settings)
values (
  gen_random_uuid(),
  'Contax Demo Org',
  '+10000000000',
  'America/New_York',
  '{"monday":{"start":"09:00","end":"17:00"},"tuesday":{"start":"09:00","end":"17:00"},"wednesday":{"start":"09:00","end":"17:00"},"thursday":{"start":"09:00","end":"17:00"},"friday":{"start":"09:00","end":"17:00"}}'::jsonb,
  '{}'
) on conflict do nothing;

-- Use a 60-minute slot default
insert into organization_settings (organization_id, default_slot_minutes, buffer_minutes)
select id, 60, 0 from organizations where name = 'Contax Demo Org'
on conflict (organization_id) do nothing;

