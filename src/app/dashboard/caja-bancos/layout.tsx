"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { usePermissionsSiconic } from "@/hooks/usePermissionsSiconic";

export default function CajaBancosLayout({ children }: { children: React.ReactNode }) {
  const { loading, canView } = usePermissionsSiconic();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!canView("caja_bancos")) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800">Acceso denegado</p>
            <p className="text-sm text-red-700 mt-1">
              No tienes permisos para acceder al módulo de Caja y Bancos.
              Solo administradores, contadores y auxiliares pueden ingresar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
