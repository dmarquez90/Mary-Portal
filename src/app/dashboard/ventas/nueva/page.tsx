"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NuevaFacturaRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/ingreso-datos/venta");
  }, [router]);
  return null;
}
