# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a monorepo for Contax, a Google Calendar-integrated scheduling application built on top of a Makerkit Next.js SaaS boilerplate. The project uses Nx for monorepo management and includes both a demo app for calendar integration and a full-featured SaaS kit.

## Tech Stack

- **Monorepo**: Nx workspace management
- **Framework**: Next.js 14 with App Router
- **Database**: Supabase (PostgreSQL with RLS)
- **Authentication**: Supabase Auth
- **Calendar Integration**: Google Calendar API
- **TypeScript**: Strict mode enabled
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query) and SWR

## Essential Commands

### Development

```bash
# Install dependencies
npm install

# Development servers
npm run demo:dev          # Run demo-web app (port 3000)
npm run supabase:start    # Start local Supabase
npm run supabase:stop     # Stop local Supabase

# Build commands
npm run demo:build        # Build demo-web app
npm run build             # Build all packages

# Code quality
npm run lint              # Lint all packages
npm run typecheck         # Type checking for all packages
npm run test              # Run tests for all packages
npm run healthcheck       # Run typecheck, lint, and tests
npm run format            # Format code with Nx

# Database
npm run supabase:reset    # Reset database with latest schema
npm run supabase:migrate  # Run migrations
npm run typegen           # Generate TypeScript types from Supabase
```

### Testing

```bash
npm run test              # Run all tests
nx test <package-name>    # Test specific package
```

## Architecture Overview

### Repository Structure

```
contax/
├── apps/
│   └── demo-web/         # Google Calendar demo application
│       ├── app/          # Next.js App Router pages
│       ├── components/   # React components
│       └── lib/          # Utilities and integrations
├── packages/
│   ├── data-loader/      # Supabase data loading utilities
│   │   └── supabase/
│   │       ├── core/     # Core Supabase loader
│   │       ├── nextjs/   # Next.js specific loader
│   │       └── remix/    # Remix specific loader
│   ├── qstash/           # QStash task queue integration
│   ├── test-utils/       # Testing utilities
│   └── ui/               # Shared UI components
├── next-supabase-saas-kit-turbo/  # Makerkit SaaS boilerplate
└── supabase/             # Database schemas and migrations
```

### Key Application Features

1. **Google Calendar Integration**
   - OAuth flow for calendar access
   - Calendar availability checking
   - Meeting scheduling with Google Meet
   - Time slot management
   - Calendar list retrieval

2. **Voice Agent Integration**
   - OpenAI Realtime API for voice interactions
   - Speech-to-text and text-to-speech
   - Function calling for calendar operations

3. **Database Architecture (from Makerkit)**
   - Multi-tenant support (personal & team accounts)
   - Row Level Security (RLS) enforcement
   - Role-based permissions system
   - Billing and subscription management

## Working with the Demo App

The demo-web app (`apps/demo-web/`) is the main application for calendar scheduling:

### Key API Routes

- `/api/calendar/check-availability` - Check calendar availability
- `/api/calendar/status` - Get calendar connection status
- `/api/calendar/list` - List user's calendars
- `/api/calendar/slots` - Get available time slots
- `/api/appointments/book` - Book appointments
- `/api/realtime/token` - Get OpenAI Realtime token
- `/api/org/default` - Get default organization

### Environment Variables

Required environment variables for the demo app:

```bash
# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALENDAR_ACCESS_TOKEN=

# OpenAI (for voice agent)
OPENAI_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Key Components

- `VoiceAgent.tsx` - Voice interaction interface
- `CalendarStatus.tsx` - Calendar connection status
- `PromptModal.tsx` - System prompt configuration
- `lib/google.ts` - Google Calendar utilities
- `lib/agent/openai-realtime.ts` - OpenAI Realtime client

## Development Guidelines

### Code Style

- Use TypeScript with strict type checking
- Follow existing patterns in the codebase
- Use functional React components with hooks
- Implement proper error handling
- Add proper TypeScript types (avoid `any`)

### Working with Supabase

1. Always check RLS policies when creating tables
2. Use generated types from `supabase/database.types.ts`
3. Run `npm run typegen` after schema changes
4. Test locally with `npm run supabase:start`

### Working with Google Calendar API

1. Handle token refresh automatically
2. Store tokens securely in HTTP-only cookies
3. Always normalize datetime formats to RFC3339
4. Respect timezone settings from Google account
5. Check calendar access roles before operations

### Testing Calendar Features

1. Start local Supabase: `npm run supabase:start`
2. Run the demo app: `npm run demo:dev`
3. Connect Google Calendar through OAuth flow
4. Test availability checking and booking

## Common Patterns

### API Route Pattern

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json()
  
  // Validate input
  if (!body.required_field) {
    return NextResponse.json({ error: 'Missing required field' }, { status: 400 })
  }
  
  // Process request
  try {
    // Implementation
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Google Calendar Token Management

```typescript
// Check and refresh token
const accessToken = cookies().get('gcal_access')?.value
const refreshToken = cookies().get('gcal_refresh')?.value
const expiry = Number(cookies().get('gcal_expiry')?.value || 0)

if (needsRefresh && refreshToken) {
  const newToken = await refreshGoogleAccessToken(refreshToken, clientId, clientSecret)
  // Update cookies with new token
}
```

## Important Notes

1. **Security**: Never commit sensitive credentials. Use environment variables.
2. **Database**: The project includes extensive Makerkit boilerplate schemas that may not all be used in the demo app.
3. **Monorepo**: Use Nx commands for building and testing packages.
4. **Google Calendar**: Respect rate limits and implement proper error handling.
5. **TypeScript**: Maintain strict typing throughout the codebase.

## Debugging Tips

1. Check Supabase logs: http://localhost:54323 (when running locally)
2. Use browser DevTools for API debugging
3. Check Google Calendar API responses for detailed error messages
4. Verify environment variables are properly set
5. Ensure Supabase is running before starting the app

## Resources

- [Nx Documentation](https://nx.dev)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Calendar API](https://developers.google.com/calendar)
- [OpenAI Realtime API](https://platform.openai.com/docs)