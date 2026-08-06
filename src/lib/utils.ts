import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formato moneda córdoba nicaragüense
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Formato fecha
//
// IMPORTANTE: las columnas tipo DATE de Postgres (sin hora) llegan como
// "YYYY-MM-DD". `new Date("YYYY-MM-DD")` las interpreta como medianoche UTC;
// al formatearlas en una zona horaria detrás de UTC (Nicaragua es UTC-6),
// JavaScript retrocede al día anterior. Por eso se parsean los componentes
// año/mes/día directamente y se construye la fecha en hora LOCAL, sin pasar
// por ninguna conversión de zona horaria. Ver hallazgo #5 del reporte de QA
// (2026-08-05): esto estaba mostrando fechas de nómina, compras y ventas un
// día antes de la fecha real guardada en la base de datos.
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const soloFecha = dateStr.split("T")[0];
  const [year, month, day] = soloFecha.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const fecha = new Date(year, month - 1, day);
  return fecha.toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Mes en español
export function nombreMes(mes: number): string {
  const meses = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ];
  return meses[mes - 1] ?? "";
}
