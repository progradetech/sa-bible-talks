import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Lands here when a user clicks an invite, password-recovery, or magic-link
// email. Supabase appends ?code=XXX (PKCE) which we exchange for a session
// cookie. After that, we forward to ?next= (defaults to setup-password so
// fresh invitees set a real password before TOTP enrollment).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/admin/setup-password';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const dest = new URL('/admin/login', req.url);
      dest.searchParams.set('auth_error', error.message);
      return NextResponse.redirect(dest);
    }
  }

  return NextResponse.redirect(new URL(next, req.url));
}
