"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, LockOpen, Lock,
  Banknote, DollarSign, Undo2, X, CheckCircle2, Printer,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { IVA_NICARAGUA } from "@/types";
import { imprimirTicket, type TicketDatos, type TicketEmpresa } from "@/lib/impresion/ticket";

interface ProductoPOS {
  id: string; nombre: string; codigo: string; codigo_barra: string | null;
  precio_venta: number; stock_actual: number; aplica_iva: boolean;
}
interface ClientePOS { id: string; nombre: string; tipo?: "contado" | "credito"; limite_credito?: number; }
interface CajaPOS { id: string; nombre: string; tipo: string; ocupada: boolean; }
interface SesionActiva {
  id: string; cuenta_caja_id: string; monto_apertura: number; fecha_apertura: string;
}
interface ItemCarrito {
  producto_id: string; descripcion: string; cantidad: number;
  precio_unitario: number; aplica_iva: boolean; stock_actual: number;
}

const DENOMS_NIO = [
  { key: "denom_500", valor: 500 }, { key: "denom_200", valor: 200 },
  { key: "denom_100", valor: 100 }, { key: "denom_50", valor: 50 },
  { key: "denom_20", valor: 20 }, { key: "denom_10", valor: 10 },
  { key: "denom_5", valor: 5 }, { key: "denom_1", valor: 1 },
  { key: "denom_050", valor: 0.5 },
];
const DENOMS_USD = [
  { key: "denom_usd_100", valor: 100 }, { key: "denom_usd_50", valor: 50 },
  { key: "denom_usd_20", valor: 20 }, { key: "denom_usd_10", valor: 10 },
  { key: "denom_usd_5", valor: 5 }, { key: "denom_usd_1", valor: 1 },
];

export default function PosPage() {
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState("");
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [cajas, setCajas] = useState<CajaPOS[]>([]);
  const [productos, setProductos] = useState<ProductoPOS[]>([]);
  const [clientes, setClientes] = useState<ClientePOS[]>([]);

  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [tipoPago, setTipoPago] = useState("contado");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [cobrando, setCobrando] = useState(false);

  const [showApertura, setShowApertura] = useState(false);
  const [cajaSelId, setCajaSelId] = useState("");
  const [montoApertura, setMontoApertura] = useState("");
  const [abriendo, setAbriendo] = useState(false);

  const [empresaTicket, setEmpresaTicket] = useState<TicketEmpresa | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<TicketDatos | null>(null);

  const [showCierre, setShowCierre] = useState(false);
  const [denomsNio, setDenomsNio] = useState<Record<string, number>>({});
  const [denomsUsd, setDenomsUsd] = useState<Record<string, number>>({});
  const [tasaUsd, setTasaUsd] = useState("");
  const [cerrando, setCerrando] = useState(false);

  const buscadorRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const { getEmpresaIdActual } = await import("@/lib/supabase/empresa-actual");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const eId = await getEmpresaIdActual(supabase, user.id) ?? "";
    setEmpresaId(eId);
    if (!eId) { setLoading(false); return; }

    // Datos fiscales de la empresa para el encabezado del ticket
    const [{ data: en }, { data: ej }] = await Promise.all([
      supabase.from("empresas_persona_natural").select("nombre_completo,numero_ruc,direccion,telefono").eq("id", eId).maybeSingle(),
      supabase.from("empresas_juridicas").select("nombre_empresa,numero_ruc,direccion_legal").eq("id", eId).maybeSingle(),
    ]);
    if (en) setEmpresaTicket({ nombre: en.nombre_completo, ruc: en.numero_ruc, direccion: en.direccion, telefono: en.telefono });
    else if (ej) setEmpresaTicket({ nombre: ej.nombre_empresa, ruc: ej.numero_ruc, direccion: ej.direccion_legal });

    const { data, error } = await supabase.rpc("fn_pos_estado_inicial", { p_empresa_id: eId });
    if (error) {
      toast.error("Error al cargar el POS: " + error.message);
      setLoading(false);
      return;
    }
    setSesion(data.sesion_activa ?? null);
    setCajas(data.cajas ?? []);
    setProductos(data.productos ?? []);
    setClientes(data.clientes ?? []);
    if (data.cajas?.length) {
      const libre = data.cajas.find((c: CajaPOS) => !c.ocupada);
      if (libre) setCajaSelId(libre.id);
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (sesion && !showApertura && !showCierre) buscadorRef.current?.focus();
  }, [sesion, showApertura, showCierre]);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos.slice(0, 30);
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.codigo_barra ?? "").toLowerCase() === q
    ).slice(0, 30);
  }, [productos, busqueda]);

  function agregarProducto(p: ProductoPOS) {
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.producto_id === p.id);
      if (idx >= 0) {
        return prev.map((i, k) => k === idx ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, {
        producto_id: p.id, descripcion: p.nombre, cantidad: 1,
        precio_unitario: p.precio_venta, aplica_iva: p.aplica_iva, stock_actual: p.stock_actual,
      }];
    });
  }

  function onBuscarKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = busqueda.trim().toLowerCase();
    if (!q) return;
    const exacto = productos.find(p => (p.codigo_barra ?? "").toLowerCase() === q || p.codigo.toLowerCase() === q);
    if (exacto) {
      agregarProducto(exacto);
      setBusqueda("");
    } else if (productosFiltrados.length === 1) {
      agregarProducto(productosFiltrados[0]);
      setBusqueda("");
    }
  }

  function cambiarCantidad(idx: number, delta: number) {
    setCarrito(prev => prev.map((i, k) => k === idx ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i)
      .filter(Boolean));
  }
  function quitarItem(idx: number) {
    setCarrito(prev => prev.filter((_, k) => k !== idx));
  }

  const subtotal = carrito.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
  const ivaTotal = carrito.reduce((s, i) => s + (i.aplica_iva ? Math.round(i.cantidad * i.precio_unitario * IVA_NICARAGUA * 100) / 100 : 0), 0); // redondeo por línea (FIX auditoría)
  const total = subtotal + ivaTotal;
  const cambio = tipoPago === "contado" && montoRecibido
    ? Math.max(Number(montoRecibido) - total, 0)
    : null;

  async function abrirTurno() {
    if (!cajaSelId) { toast.error("Selecciona una caja"); return; }
    if (montoApertura === "" || isNaN(Number(montoApertura)) || Number(montoApertura) < 0) {
      toast.error("Ingresa un monto de apertura válido"); return;
    }
    setAbriendo(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_abrir_turno_pos", {
      p_empresa_id: empresaId, p_cuenta_caja_id: cajaSelId,
      p_monto_apertura: Number(montoApertura), p_notas: null,
    });
    if (error) {
      toast.error("No se pudo abrir el turno: " + error.message);
    } else {
      toast.success("Turno abierto ✓");
      setShowApertura(false);
      setMontoApertura("");
      await cargar();
    }
    setAbriendo(false);
  }

  async function cobrar() {
    if (!sesion) return;
    if (carrito.some(i => i.cantidad > i.stock_actual)) {
      toast.error("Hay productos con stock insuficiente en el carrito");
      return;
    }
    const cliente = clientes.find(c => c.id === clienteId);
    if (tipoPago === "credito" && (!clienteId || cliente?.tipo !== "credito")) {
      toast.error("Selecciona un cliente con crédito habilitado para vender a crédito");
      return;
    }
    setCobrando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fn_registrar_venta_pos", {
      p_empresa_id: empresaId,
      p_sesion_caja_id: sesion.id,
      p_cliente_id: clienteId || null,
      p_cliente_nombre: cliente?.nombre ?? "Consumidor final",
      p_tipo_pago: tipoPago,
      p_items: carrito.map(i => ({
        producto_id: i.producto_id, descripcion: i.descripcion, cantidad: i.cantidad,
        precio_unitario: i.precio_unitario, descuento_pct: 0, aplica_iva: i.aplica_iva,
      })),
      p_monto_recibido: tipoPago === "contado" && montoRecibido ? Number(montoRecibido) : null,
    });
    if (error) {
      toast.error("No se pudo cobrar la venta: " + error.message, { duration: 7000 });
    } else {
      toast.success(
        `Venta ${data.numero_factura} — ${formatCurrency(data.total)}` +
        (data.cambio != null ? ` · Cambio: ${formatCurrency(data.cambio)}` : ""),
        { duration: 6000 }
      );
      // Snapshot para el ticket antes de vaciar el carrito
      setUltimaVenta({
        numeroFactura: data.numero_factura,
        fecha: new Date().toLocaleDateString("es-NI", { day: "2-digit", month: "2-digit", year: "numeric" }),
        tipoPago: tipoPago === "contado" ? "Efectivo" : tipoPago,
        cliente: cliente?.nombre ?? "Consumidor final",
        items: carrito.map(i => {
          const sub = i.cantidad * i.precio_unitario;
          const iva = i.aplica_iva ? Math.round(sub * IVA_NICARAGUA * 100) / 100 : 0; // redondeo por línea (FIX auditoría)
          return {
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            iva,
            total: sub + iva,
          };
        }),
        subtotal: Number(data.subtotal),
        ivaTotal: Number(data.iva_total),
        total: Number(data.total),
        montoRecibido: data.monto_recibido != null ? Number(data.monto_recibido) : null,
        cambio: data.cambio != null ? Number(data.cambio) : null,
      });
      setCarrito([]);
      setClienteId("");
      setMontoRecibido("");
      await cargar();
    }
    setCobrando(false);
  }

  const totalFisicoNio = DENOMS_NIO.reduce((s, d) => s + d.valor * (denomsNio[d.key] ?? 0), 0);
  const totalFisicoUsd = DENOMS_USD.reduce((s, d) => s + d.valor * (denomsUsd[d.key] ?? 0), 0);
  const totalFisico = totalFisicoNio + (tasaUsd ? totalFisicoUsd * Number(tasaUsd) : 0);

  async function cerrarTurno() {
    if (!sesion) return;
    setCerrando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fn_cerrar_turno_pos", {
      p_sesion_id: sesion.id,
      p_denominaciones: { ...denomsNio, ...denomsUsd },
      p_monto_fisico_total: totalFisico,
      p_tasa_usd: tasaUsd ? Number(tasaUsd) : null,
      p_notas: null,
    });
    if (error) {
      toast.error("No se pudo cerrar el turno: " + error.message);
    } else {
      const dif = Number(data.diferencia);
      if (Math.abs(dif) < 0.01) toast.success("Caja cuadrada perfectamente ✓", { duration: 6000 });
      else toast(dif > 0 ? `Sobrante: ${formatCurrency(dif)}` : `Faltante: ${formatCurrency(Math.abs(dif))}`, { duration: 6000 });
      setShowCierre(false);
      setDenomsNio({});
      setDenomsUsd({});
      setTasaUsd("");
      await cargar();
    }
    setCerrando(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!sesion) {
    return (
      <div className="max-w-lg mx-auto mt-10">
        <div className="card p-6 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-slate-500" />
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900 mb-1">Punto de Venta</h1>
          <p className="text-slate-500 text-sm mb-6">Necesitas abrir un turno de caja para empezar a vender.</p>

          <div className="space-y-4 text-left">
            <div>
              <label className="label">Caja</label>
              <select className="input" value={cajaSelId} onChange={e => setCajaSelId(e.target.value)}>
                <option value="">Selecciona una caja...</option>
                {cajas.map(c => (
                  <option key={c.id} value={c.id} disabled={c.ocupada}>
                    {c.nombre} {c.ocupada ? "(ocupada)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Monto de apertura (C$)</label>
              <input type="number" min="0" step="0.01" className="input font-mono" placeholder="0.00"
                value={montoApertura} onChange={e => setMontoApertura(e.target.value)} />
            </div>
            <button onClick={abrirTurno} disabled={abriendo} className="btn-primary w-full flex items-center justify-center gap-2">
              {abriendo ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <LockOpen className="w-4 h-4" />}
              Abrir turno
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Punto de Venta</h1>
          <p className="text-slate-500 text-sm mt-1">Turno abierto desde {new Date(sesion.fecha_apertura).toLocaleString("es-NI")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/pos/devolucion" className="btn-secondary flex items-center gap-2 text-sm">
            <Undo2 className="w-4 h-4" /> Devolución
          </Link>
          <button onClick={() => setShowCierre(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-colors">
            <Lock className="w-4 h-4" /> Cerrar turno
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="card">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={buscadorRef}
                className="input pl-9"
                placeholder="Buscar por nombre, código o escanear código de barras..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={onBuscarKeyDown}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {productosFiltrados.map(p => (
              <button
                key={p.id}
                onClick={() => agregarProducto(p)}
                disabled={p.stock_actual <= 0}
                className="card p-3 text-left hover:border-brand-300 hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="font-semibold text-sm text-slate-900 line-clamp-2">{p.nombre}</p>
                <p className="text-xs text-slate-400 font-mono mt-1">{p.codigo}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-mono font-bold text-brand-700">{formatCurrency(p.precio_venta)}</span>
                  <span className={`text-xs ${p.stock_actual > 0 ? "text-slate-400" : "text-red-500"}`}>
                    Stock: {p.stock_actual}
                  </span>
                </div>
              </button>
            ))}
            {productosFiltrados.length === 0 && (
              <p className="col-span-full text-center text-slate-400 text-sm py-10">Sin productos que coincidan.</p>
            )}
          </div>
        </div>

        <div>
          <div className="card sticky top-6 p-0 overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-slate-500" />
              <p className="font-semibold text-slate-900 text-sm">Carrito ({carrito.length})</p>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {carrito.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-10">Agrega productos para empezar</p>
              )}
              {carrito.map((i, idx) => (
                <div key={idx} className="p-3 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{i.descripcion}</p>
                    <p className="text-xs text-slate-400 font-mono">{formatCurrency(i.precio_unitario)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => cambiarCantidad(idx, -1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200"><Minus className="w-3 h-3" /></button>
                    <span className="w-6 text-center text-sm font-mono">{i.cantidad}</span>
                    <button onClick={() => cambiarCantidad(idx, 1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200"><Plus className="w-3 h-3" /></button>
                  </div>
                  <button onClick={() => quitarItem(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-100 space-y-3">
              <select className="input text-sm" value={clienteId} onChange={e => {
                const nuevoId = e.target.value;
                setClienteId(nuevoId);
                if (tipoPago === "credito" && clientes.find(c => c.id === nuevoId)?.tipo !== "credito") {
                  setTipoPago("contado");
                }
              }}>
                <option value="">Consumidor final</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.tipo === "credito" ? " (Crédito)" : ""}</option>)}
              </select>

              <select className="input text-sm" value={tipoPago} onChange={e => setTipoPago(e.target.value)}>
                <option value="contado">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
                <option value="credito" disabled={clientes.find(c => c.id === clienteId)?.tipo !== "credito"}>
                  Crédito {clientes.find(c => c.id === clienteId)?.tipo !== "credito" ? "(elige un cliente con crédito)" : ""}
                </option>
              </select>

              {tipoPago === "contado" && (
                <input type="number" min="0" step="0.01" className="input text-sm font-mono" placeholder="Monto recibido"
                  value={montoRecibido} onChange={e => setMontoRecibido(e.target.value)} />
              )}

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>IVA 15%</span><span>{formatCurrency(ivaTotal)}</span></div>
                <div className="flex justify-between font-bold text-lg text-slate-900 pt-1 border-t border-slate-100"><span>Total</span><span>{formatCurrency(total)}</span></div>
                {cambio != null && (
                  <div className="flex justify-between text-green-700 font-semibold"><span>Cambio</span><span>{formatCurrency(cambio)}</span></div>
                )}
              </div>

              <button
                onClick={cobrar}
                disabled={cobrando || carrito.length === 0}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {cobrando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Cobrar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL VENTA EXITOSA / IMPRIMIR TICKET ─────────── */}
      {ultimaVenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900">Venta registrada</h2>
            <p className="text-slate-500 text-sm mt-1">{ultimaVenta.numeroFactura}</p>
            <p className="font-mono font-bold text-2xl text-slate-900 mt-2">{formatCurrency(ultimaVenta.total)}</p>
            {ultimaVenta.cambio != null && ultimaVenta.cambio > 0 && (
              <p className="text-green-700 font-semibold text-sm mt-1">
                Cambio a entregar: {formatCurrency(ultimaVenta.cambio)}
              </p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => empresaTicket && imprimirTicket(empresaTicket, ultimaVenta, 58)}
                disabled={!empresaTicket}
                className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm disabled:opacity-40"
              >
                <Printer className="w-4 h-4" /> 58mm
              </button>
              <button
                onClick={() => empresaTicket && imprimirTicket(empresaTicket, ultimaVenta, 80)}
                disabled={!empresaTicket}
                className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-40"
              >
                <Printer className="w-4 h-4" /> Ticket 80mm
              </button>
            </div>
            <button
              onClick={() => setUltimaVenta(null)}
              className="w-full mt-3 text-slate-500 hover:text-slate-700 text-sm font-medium py-2"
            >
              Continuar sin imprimir
            </button>
          </div>
        </div>
      )}

      {showCierre && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl p-6 my-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-lg font-bold text-slate-900">Cerrar turno — Arqueo de Caja</h2>
              <button onClick={() => setShowCierre(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-slate-500 text-sm mb-6">Cuenta físicamente el efectivo antes de cerrar</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2"><Banknote className="w-4 h-4" /> Córdobas (C$)</p>
                <div className="space-y-2">
                  {DENOMS_NIO.map(d => (
                    <div key={d.key} className="flex items-center gap-2">
                      <span className="w-14 text-center text-xs font-bold bg-green-100 text-green-800 py-1 rounded-lg">C${d.valor}</span>
                      <input type="number" min="0" className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm font-mono"
                        value={denomsNio[d.key] ?? 0}
                        onChange={e => setDenomsNio(prev => ({ ...prev, [d.key]: Math.max(0, parseInt(e.target.value) || 0) }))} />
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-semibold">
                    <span>Subtotal</span><span className="font-mono">{formatCurrency(totalFisicoNio)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Dólares (USD)</p>
                <input type="number" step="0.0001" placeholder="Tasa de cambio (C$ por US$)" className="input text-sm mb-2"
                  value={tasaUsd} onChange={e => setTasaUsd(e.target.value)} />
                <div className="space-y-2">
                  {DENOMS_USD.map(d => (
                    <div key={d.key} className="flex items-center gap-2">
                      <span className="w-14 text-center text-xs font-bold bg-blue-100 text-blue-800 py-1 rounded-lg">${d.valor}</span>
                      <input type="number" min="0" disabled={!tasaUsd} className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm font-mono disabled:opacity-40"
                        value={denomsUsd[d.key] ?? 0}
                        onChange={e => setDenomsUsd(prev => ({ ...prev, [d.key]: Math.max(0, parseInt(e.target.value) || 0) }))} />
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Apertura</span><span className="font-mono">{formatCurrency(sesion.monto_apertura)}</span></div>
                  <div className="flex justify-between font-bold"><span>Total físico</span><span className="font-mono">{formatCurrency(totalFisico)}</span></div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={cerrarTurno} disabled={cerrando} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                {cerrando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
                Cerrar caja
              </button>
              <button onClick={() => setShowCierre(false)} className="flex-1 btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
