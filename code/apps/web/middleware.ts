import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIX = '/dashboard';
const LOGIN_PATH = '/login';
const MFA_PATH = '/login/mfa';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  // If env is not configured, fall through; the page will show a clear error.
  if (!url || !publishableKey) return response;

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith(PROTECTED_PREFIX);
  const isLogin = path === LOGIN_PATH;
  const isMfaPage = path === MFA_PATH;

  if (isProtected && !user) {
    const redirectTo = new URL(LOGIN_PATH, request.url);
    redirectTo.searchParams.set('next', path);
    return NextResponse.redirect(redirectTo);
  }

  // If user is logged in, check whether MFA challenge is required.
  // currentLevel='aal1' & nextLevel='aal2' means the user has MFA
  // enrolled but hasn't satisfied the second factor in this session.
  if (user && (isProtected || isLogin)) {
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa =
      aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2';
    if (needsMfa && !isMfaPage) {
      const redirectTo = new URL(MFA_PATH, request.url);
      if (isProtected) redirectTo.searchParams.set('next', path);
      return NextResponse.redirect(redirectTo);
    }
  }

  // Already-AAL2 user hitting the MFA page → bounce to dashboard.
  if (user && isMfaPage) {
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel === 'aal2') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Logged-in users hitting /login go to dashboard.
  if (isLogin && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
