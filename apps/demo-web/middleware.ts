import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protected routes that require authentication
  const protectedPaths = ['/api/appointments', '/api/calendar', '/api/realtime', '/api/org'];
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path));
  
  // Auth routes that should redirect if already logged in
  const authPaths = ['/auth/sign-in', '/auth/sign-up'];
  const isAuthPath = authPaths.some(path => request.nextUrl.pathname.startsWith(path));

  // If user is not authenticated and trying to access protected route
  if (!user && isProtectedPath) {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }

  // If user is authenticated and trying to access auth pages, redirect to home
  if (user && isAuthPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // For the home page, redirect to login if not authenticated
  if (!user && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};