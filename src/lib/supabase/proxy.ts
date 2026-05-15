import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  findActiveTrust,
  findAdminByUserId,
  touchTrust,
} from '@/lib/repos/trusted-devices';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/trusted-device';

// Refresh the Supabase session and gate /admin/* routes by AAL2 (full MFA) or
// by a valid trusted-device cookie tied to the signed-in admin. Without a
// trust cookie, admins must complete TOTP on every fresh session.
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
    if (aalData?.currentLevel === 'aal2') {
      return response;
    }

    // AAL1: allow access only if the trusted-device cookie is valid and the
    // admin tied to it is still active and not locked out.
    const trustToken = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (trustToken) {
      const trust = await findActiveTrust(trustToken);
      if (trust) {
        const admin = await findAdminByUserId(user.id);
        if (
          admin &&
          admin.id === trust.adminUserId &&
          admin.isActive &&
          (!admin.lockedUntil || admin.lockedUntil <= new Date())
        ) {
          // Best-effort. Failure to update last-seen must not block the request.
          touchTrust(trust.id).catch(() => {});
          return response;
        }
      }
    }

    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  return response;
}
