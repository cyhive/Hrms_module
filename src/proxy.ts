import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal, usesEmployeePortal } from "@/lib/roles";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const user = await getCurrentUserFromRequest(req);

  if (pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (!usesAdminPortal(user.role)) {
      return NextResponse.redirect(new URL("/employee/dashboard", req.url));
    }
  }

  if (pathname.startsWith("/employee")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (!usesEmployeePortal(user.role)) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
  }

  if (pathname === "/login" && user) {
    return NextResponse.redirect(
      new URL(usesAdminPortal(user.role) ? "/admin/dashboard" : "/employee/dashboard", req.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/admin/:path*", "/employee/:path*"],
};
