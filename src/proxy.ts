import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { localDevelopmentMode } from "@/lib/runtime";
export async function proxy(request: NextRequest) {
  if (localDevelopmentMode()) return NextResponse.next();
  let response = NextResponse.next({ request });
  const { url, key } = publicSupabaseConfig();
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: values => {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data, error } = await supabase.auth.getClaims();
  if ((!data?.claims || error) && /^\/(ja|es|el)(\/|$)/.test(request.nextUrl.pathname)) {
    const target = new URL("/login", request.url);
    target.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/ja/:path*", "/es/:path*", "/el/:path*", "/api/:path*", "/login", "/signup", "/auth/:path*"] };
