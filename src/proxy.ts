import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Convención "proxy" de Next 16 (reemplaza a "middleware").
// Única fuente de verdad para la protección de rutas por sesión.
export async function proxy(request: NextRequest) {
  // Las rutas de API manejan su propia autenticación (401 JSON, no redirect)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
