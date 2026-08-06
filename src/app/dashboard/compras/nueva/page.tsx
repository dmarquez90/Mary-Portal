"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NuevaCompraRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/ingreso-datos/compra");
  }, [router]);
  return null;
}
