import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresh the Supabase session and gate /admin/* routes by AAL2 (full MFA).
// Per architecture: every admin must enroll TOTP and verify it on each
// session — so requireing currentLevel === 'aal2' covers both unenrolled
// users (sent to /admin/login to enroll) and AAL1 sessions (sent to verify).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Login page must be reachable while unauthenticated, the auth API routes
  // must be reachable while at AAL1 to complete MFA, and setup-password
  // must be reachable post-invite (AAL1, no TOTP enrolled yet — that page
  // handles its own session check).
  if (
    path === '/admin/login' ||
    path === '/admin/setup-password' ||
    path.startsWith('/api/auth')
  ) {
    return response;
  }

  if (path.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== 'aal2') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
