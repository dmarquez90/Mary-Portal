"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { IVA_NICARAGUA } from "@/types";
import type { Cliente, Producto } from "@/types";
import { getPrimeraCuentaCaja, getPrimeraCuentaBanco, crearMovimientoCaja, crearTransaccionBanco } from "@/lib/pagos/queries";

interface Linea {
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  aplica_iva: boolean;
}

export default function NuevaFacturaPage() {
  const router = useRouter();

  const [loading,   setSaving]   = useState(false);
  const [clientes,  setClientes]  = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");

  // ── Campos del formulario ──────────────────────────────
  const [clienteId,        setClienteId]        = useState("");
  const [clienteLibre,     setClienteLibre]     = useState("");   // nombre escrito a mano
  const [usarClienteLibre, setUsarClienteLibre] = useState(false);
  const [fechaEmision,     setFechaEmision]     = useState(new Date().toISOString().split("T")[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [tipoPago,         setTipoPago]         = useState("contado");
  const [notas,            setNotas]            = useState("");
  const [lineas,           setLineas]           = useState<Linea[]>([lineaVacia()]);

  function lineaVacia(): Linea {
    return { producto_id: "", descripcion: "", cantidad: 1, precio_unitario: 0, descuento_pct: 0, aplica_iva: true };
  }

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from("empresas_persona_natural").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("empresas_juridicas").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      const eId = en?.id ?? ej?.id ?? "";
      setEmpresaId(eId);

      if (eId) {
        const [{ data: cl }, { data: pr }] = await Promise.all([
          supabase.from("clientes").select("*").eq("empresa_id", eId).eq("activo", true).order("nombre"),
          supabase.from("productos").select("*").eq("empresa_id", eId).eq("activo", true).order("nombre"),
        ]);
        setClientes((cl as Cliente[]) ?? []);
        setProductos((pr as Producto[]) ?? []);
      }
    }
    load();
  }, []);

  // Cuando cambia tipo de pago a no-credito, limpiar fecha vencimiento
  function handleTipoPago(val: string) {
    setTipoPago(val);
    if (val !== "credito") setFechaVencimiento("");
  }

  function onProductoChange(idx: number, productoId: string) {
    const prod = productos.find(p => p.id === productoId);
    setLineas(prev => prev.map((l, i) => i === idx
      ? { ...l, producto_id: productoId, descripcion: prod?.nombre ?? "", precio_unitario: prod?.precio_venta ?? 0, aplica_iva: prod?.aplica_iva ?? true }
      : l
    ));
  }

  function updateLinea(idx: number, key: keyof Linea, val: string | number | boolean) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  const calcLinea = (l: Linea) => {
    const sub = l.cantidad * l.precio_unitario * (1 - l.descuento_pct / 100);
    const iva = l.aplica_iva ? sub * IVA_NICARAGUA : 0;
    return { sub, iva, total: sub + iva };
  };

  const subtotal      = lineas.reduce((s, l) => s + calcLinea(l).sub, 0);
  const ivaTotal      = lineas.reduce((s, l) => s + calcLinea(l).iva, 0);
  const descuentoTotal = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario * (l.descuento_pct / 100), 0);
  const total         = subtotal + ivaTotal;

  async function handleSave(estado: "borrador" | "emitida") {
    if (!empresaId) { toast.error("Primero configura los datos de tu empresa."); return; }

    setSaving(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Consecutivo
    const { data: cons } = await supabase.from("consecutivos").select("*").eq("empresa_id", empresaId).eq("tipo", "factura").single();
    let numeroFactura = "F-000001";
    if (cons) {
      const nuevo = cons.ultimo + 1;
      numeroFactura = `${cons.prefijo}-${String(nuevo).padStart(6, "0")}`;
      await supabase.from("consecutivos").update({ ultimo: nuevo }).eq("id", cons.id);
    } else {
      await supabase.from("consecutivos").insert({ empresa_id: empresaId, tipo: "factura", ultimo: 1, prefijo: "F" });
    }

    // Nombre del cliente para guardar en la factura
    const nombreCliente = usarClienteLibre
      ? (clienteLibre.trim() || "Sin nombre")
      : clientes.find(c => c.id === clienteId)?.nombre ?? "Consumidor final";

    const { data: factura, error } = await supabase.from("facturas").insert({
      empresa_id:        empresaId,
      numero_factura:    numeroFactura,
      cliente_id:        (!usarClienteLibre && clienteId) ? clienteId : null,
      cliente_nombre:    nombreCliente,
      fecha_emision:     fechaEmision,
      fecha_vencimiento: fechaVencimiento || null,
      tipo_pago:         tipoPago,
      estado,
      subtotal,
      descuento_total:   descuentoTotal,
      iva_total:         ivaTotal,
      total,
      notas: notas || null,
    }).select().single();

    if (error || !factura) {
      toast.error(`Error al guardar: ${error?.message}`);
      setSaving(false);
      return;
    }

    await supabase.from("detalle_facturas").insert(
      lineas.map(l => {
        const { sub, iva, total: tot } = calcLinea(l);
        return { factura_id: factura.id, producto_id: l.producto_id || null, descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario, descuento_pct: l.descuento_pct, subtotal: sub, iva, total: tot };
      })
    );

    // ── FIFO: descontar stock al emitir factura ──
    if (estado === "emitida") {
      for (const l of lineas) {
        if (!l.producto_id || l.cantidad <= 0) continue;

        // Descontar usando lotes FIFO (más antiguos primero)
        let cantPendiente = Number(l.cantidad);
        const { data: lotes } = await supabase
          .from("lotes_inventario")
          .select("*")
          .eq("producto_id", l.producto_id)
          .gt("cantidad_restante", 0)
          .order("fecha_entrada", { ascending: true });

        for (const lote of lotes ?? []) {
          if (cantPendiente <= 0) break;
          const usar = Math.min(cantPendiente, Number(lote.cantidad_restante));
          await supabase.from("lotes_inventario")
            .update({ cantidad_restante: Number(lote.cantidad_restante) - usar })
            .eq("id", lote.id);
          cantPendiente -= usar;
        }

        // Actualizar stock_actual del producto
        const { data: prod } = await supabase
          .from("productos").select("stock_actual").eq("id", l.producto_id).single();
        const stockNuevo = Math.max(0, Number(prod?.stock_actual ?? 0) - Number(l.cantidad));
        await supabase.from("productos").update({ stock_actual: stockNuevo }).eq("id", l.producto_id);

        // Registrar movimiento de salida
        await supabase.from("movimientos_inventario").insert({
          empresa_id:  empresaId,
          producto_id: l.producto_id,
          tipo:        "salida",
          cantidad:    l.cantidad,
          referencia:  factura.id,
          notas:       `Venta ${numeroFactura}`,
        });
      }
    }

    // ── Flujo Caja / Banco al emitir (solo si es pago inmediato) ──
    if (estado === "emitida" && tipoPago !== "credito") {
      const descripcion = `Cobro Factura ${numeroFactura}`;
      const fecha = fechaEmision;

      if (tipoPago === "contado") {
        // Efectivo → Caja
        const cuentaCaja = await getPrimeraCuentaCaja(empresaId);
        if (cuentaCaja) {
          try {
            await crearMovimientoCaja(empresaId, {
              cuenta_caja_id: cuentaCaja.id,
              tipo: "ingreso",
              monto: total,
              descripcion,
              fecha,
              ref_factura_id: factura.id,
            });
          } catch (e) {
            console.error("Error al registrar en Caja:", e);
          }
        }
      } else {
        // Tarjeta / Transferencia / Cheque → Banco
        const cuentaBanco = await getPrimeraCuentaBanco(empresaId);
        if (cuentaBanco) {
          try {
            await crearTransaccionBanco(empresaId, {
              cuenta_banco_id: cuentaBanco.id,
              tipo: tipoPago === "tarjeta" ? "tarjeta" : tipoPago,
              monto: total,
              descripcion,
              fecha,
              ref_factura_id: factura.id,
              es_egreso: false,
            });
          } catch (e) {
            console.error("Error al registrar en Banco:", e);
          }
        }
      }
    }

    toast.success(`Factura ${numeroFactura} ${estado === "emitida" ? "emitida — inventario actualizado" : "guardada como borrador"}`);
    router.push("/dashboard/ventas");
  }

  const esCredito = tipoPago === "credito";

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/ventas" className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Nueva Factura</h1>
          <p className="text-slate-500 text-sm mt-1">Completa los datos de la factura de venta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">

          {/* ── Datos generales ── */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Datos generales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Cliente */}
              <div className="md:col-span-2">
                <label className="label">Cliente</label>
                <div className="flex gap-2">
                  {!usarClienteLibre ? (
                    <select
                      className="input flex-1"
                      value={clienteId}
                      onChange={e => setClienteId(e.target.value)}
                    >
                      <option value="">— Sin cliente —</option>
                      {clientes.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="input flex-1"
                      placeholder="Nombre del cliente (dejar vacío = Sin nombre)"
                      value={clienteLibre}
                      onChange={e => setClienteLibre(e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => { setUsarClienteLibre(v => !v); setClienteId(""); setClienteLibre(""); }}
                    className="btn-secondary text-xs px-3 whitespace-nowrap"
                  >
                    {usarClienteLibre ? "Usar lista" : "Escribir nombre"}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {usarClienteLibre
                    ? "Escribe el nombre del cliente. Si lo dejas vacío se guardará como «Sin nombre»."
                    : "Selecciona un cliente de la lista o haz clic en «Escribir nombre» para ingresar uno libre."}
                </p>
              </div>

              {/* Tipo de pago */}
              <div>
                <label className="label">Tipo de pago</label>
                <select className="input" value={tipoPago} onChange={e => handleTipoPago(e.target.value)}>
                  <option value="contado">Contado (Efectivo)</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>

              {/* Fecha emisión */}
              <div>
                <label className="label">Fecha de emisión</label>
                <input type="date" className="input" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
              </div>

              {/* Fecha vencimiento — solo si es crédito */}
              {esCredito && (
                <div className="md:col-span-2">
                  <label className="label">
                    Fecha de vencimiento
                    <span className="text-red-500 ml-1">*</span>
                    <span className="text-slate-400 font-normal text-xs ml-2">(requerida para crédito)</span>
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={fechaVencimiento}
                    onChange={e => setFechaVencimiento(e.target.value)}
                    min={fechaEmision}
                    required
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Productos / Servicios ── */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Productos / Servicios</h2>
            <div className="space-y-3">
              {lineas.map((linea, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start border border-slate-100 rounded-lg p-3 bg-slate-50">
                  <div className="col-span-12 md:col-span-4">
                    <label className="label text-xs">Producto</label>
                    <select className="input text-sm" value={linea.producto_id} onChange={e => onProductoChange(idx, e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="label text-xs">Descripción</label>
                    <input type="text" className="input text-sm" value={linea.descripcion} onChange={e => updateLinea(idx, "descripcion", e.target.value)} placeholder="Descripción" />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    <label className="label text-xs">Cant.</label>
                    <input type="number" className="input text-sm" min="0" step="0.01" value={linea.cantidad} onChange={e => updateLinea(idx, "cantidad", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="label text-xs">Precio</label>
                    <input type="number" className="input text-sm" min="0" step="0.01" value={linea.precio_unitario} onChange={e => updateLinea(idx, "precio_unitario", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    <label className="label text-xs">Desc.%</label>
                    <input type="number" className="input text-sm" min="0" max="100" value={linea.descuento_pct} onChange={e => updateLinea(idx, "descuento_pct", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="col-span-12 md:col-span-1 flex items-center justify-between md:justify-center gap-2 pt-1">
                    <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5" checked={linea.aplica_iva} onChange={e => updateLinea(idx, "aplica_iva", e.target.checked)} />
                      IVA
                    </label>
                    <button type="button" onClick={() => { if (lineas.length > 1) setLineas(prev => prev.filter((_, i) => i !== idx)); }} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-12 text-right text-sm font-semibold text-slate-700">
                    Total: {formatCurrency(calcLinea(linea).total)}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setLineas(prev => [...prev, lineaVacia()])} className="flex items-center gap-2 text-brand-700 hover:text-brand-900 text-sm font-medium">
                <Plus className="w-4 h-4" /> Agregar línea
              </button>
            </div>
          </div>

          {/* ── Notas ── */}
          <div className="card">
            <label className="label">Notas (opcional)</label>
            <textarea className="input resize-none" rows={3} placeholder="Observaciones, condiciones de pago, etc." value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>

        {/* ── Panel resumen ── */}
        <div>
          <div className="card sticky top-6">
            <h2 className="font-semibold text-slate-900 mb-4">Resumen</h2>
            <div className="space-y-2 text-sm mb-6">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              {descuentoTotal > 0 && (
                <div className="flex justify-between text-red-600"><span>Descuento</span><span>- {formatCurrency(descuentoTotal)}</span></div>
              )}
              <div className="flex justify-between text-slate-600"><span>IVA (15%)</span><span>{formatCurrency(ivaTotal)}</span></div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-lg text-slate-900">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <button type="button" disabled={loading} onClick={() => handleSave("emitida")} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Emitir factura</>}
              </button>
              <button type="button" disabled={loading} onClick={() => handleSave("borrador")} className="btn-secondary w-full">
                Guardar borrador
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
