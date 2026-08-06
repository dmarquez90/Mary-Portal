"use client";

import Link from "next/link";
import { FileText, ShoppingCart, Wrench, History } from "lucide-react";

const OPCIONES = [
  {
    href: "/dashboard/ingreso-datos/venta",
    icon: FileText,
    titulo: "Venta",
    detalle: "Vendiste un producto a un cliente. Genera una factura y descuenta inventario.",
    color: "from-blue-600 to-blue-900 shadow-blue-900/30 hover:shadow-blue-500/40",
  },
  {
    href: "/dashboard/ingreso-datos/servicio",
    icon: Wrench,
    titulo: "Servicio",
    detalle: "Brindaste un servicio (reparación, consultoría, instalación...). Genera una factura sin tocar inventario.",
    color: "from-emerald-600 to-emerald-900 shadow-emerald-900/30 hover:shadow-emerald-500/40",
  },
  {
    href: "/dashboard/ingreso-datos/compra",
    icon: ShoppingCart,
    titulo: "Compra",
    detalle: "Compraste algo a un proveedor (producto, insumo o servicio recibido).",
    color: "from-amber-500 to-amber-800 shadow-amber-900/30 hover:shadow-amber-500/40",
  },
];

export default function IngresoDatosPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">Ingreso de Datos</h1>
        <p className="text-slate-500 text-sm mt-1">¿Qué tipo de movimiento quieres registrar?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {OPCIONES.map(op => (
          <Link
            key={op.href}
            href={op.href}
            className={`group rounded-2xl p-6 bg-gradient-to-br ${op.color} text-white shadow-lg transition-all hover:-translate-y-1`}
          >
            <op.icon className="w-8 h-8 mb-4 opacity-90" />
            <h2 className="font-display text-lg font-bold mb-1.5">{op.titulo}</h2>
            <p className="text-sm text-white/80 leading-relaxed">{op.detalle}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <Link href="/dashboard/ventas" className="flex items-center gap-2 text-sm text-slate-500 hover:text-brand-700">
          <History className="w-4 h-4" /> Ver historial de ventas y servicios
        </Link>
        <Link href="/dashboard/compras" className="flex items-center gap-2 text-sm text-slate-500 hover:text-brand-700">
          <History className="w-4 h-4" /> Ver historial de compras
        </Link>
      </div>
    </div>
  );
}
