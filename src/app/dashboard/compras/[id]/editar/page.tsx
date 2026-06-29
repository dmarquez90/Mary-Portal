"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, ArrowLeft, Search, X, PackagePlus, FileText, AlertCircle } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { IVA_NICARAGUA } from "@/types";
import type { Proveedor, Producto } from "@/types";

interface Linea {
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  aplica_iva: boolean;
}

interface CuentaBanco { id: string; nombre: string; banco: string; moneda: string; }
interface CuentaCaja  { id: string; nombre: string; tipo: string; }

const PROD_FORM_VACIO = {
  codigo: "", nombre: "", unidad_medida: "unidad",
  precio_venta: 0, aplica_iva: true, stock_minimo: 0,
};

export default function EditarCompraPage() {
  const router = useRouter();
  const params = useParams();
  const compraId = params.id as string;

  const [saving,      setSaving]     = useState(false);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos,   setProductos]  = useState<Producto[]>([]);
  const [empresaId,   setEmpresaId]  = useState("");

  const [proveedorId,          setProveedorId]          = useState("");
  const [proveedorTipo,        setProveedorTipo]         = useState<string>("juridica");
  const [fechaCompra,          setFechaCompra]          = useState(new Date().toISOString().split("T")[0]);
  const [tipoPago,             setTipoPago]             = useState("contado");
  const [notas,                setNotas]                = useState("");
  const [lineas,               setLineas]               = useState<Linea[]>([lineaVacia()]);
  const [numFacturaProveedor,  setNumFacturaProveedor]  = useState("");

  // ── NUEVO: cuentas banco/caja disponibles + selección ────────
  const [cuentasBanco,    setCuentasBanco]    = useState<CuentaBanco[]>([]);
  const [cuentasCaja,     setCuentasCaja]     = useState<CuentaCaja[]>([]);
  const [cuentaBancoId,   setCuentaBancoId]   = useState("");
  const [cuentaCajaId,    setCuentaCajaId]    = useState("");

  const [busquedas,       setBusquedas]       = useState<string[]>([""]);
  const [mostrarDropdown, setMostrarDropdown] = useState<number | null>(null);

  const [showNuevoProd,  setShowNuevoProd]  = useState(false);
  const [lineaParaNuevo, setLineaParaNuevo] = useState<number | null>(null);
  const [prodForm,       setProdForm]       = useState({ ...PROD_FORM_VACIO });
  const [creandoProd,    setCreandoProd]    = useState(false);

  function lineaVacia(): Linea {
    return { producto_id: "", descripcion: "", cantidad: 1, precio_unitario: 0, aplica_iva: true };
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

      // ── Cargar compra borrador para editar ─────────────────
      const { data: compra } = await supabase
        .from("compras")
        .select("*, detalle_compras(*)")
        .eq("id", compraId)
        .maybeSingle();
      if (compra) {
        setProveedorId(compra.proveedor_id ?? "");
        setFechaCompra(compra.fecha_compra ?? new Date().toISOString().split("T")[0]);
        setTipoPago(compra.tipo_pago ?? "contado");
        setNotas(compra.notas ?? "");
        setCuentaBancoId(compra.cuenta_banco_id ?? "");
        setCuentaCajaId(compra.cuenta_caja_id ?? "");
        if (compra.detalle_compras?.length) {
          setLineas(compra.detalle_compras.map((d: any) => ({
            producto_id: d.producto_id ?? "",
            descripcion: d.descripcion,
            cantidad: Number(d.cantidad),
            precio_unitario: Number(d.precio_unitario),
            aplica_iva: Number(d.iva) > 0,
          })));
          setBusquedas(compra.detalle_compras.map((d: any) => d.descripcion ?? ""));
        }
      }

      if (eId) {
        const [
          { data: prov }, { data: prod },
          { data: bancos }, { data: cajas },
        ] = await Promise.all([
          supabase.from("proveedores").select("*").eq("empresa_id", eId).eq("activo", true).order("nombre"),
          supabase.from("productos").select("*").eq("empresa_id", eId).eq("activo", true).order("nombre"),
          supabase.from("cuentas_banco").select("id,nombre,banco,moneda").eq("empresa_id", eId).eq("activa", true).order("created_at"),
          supabase.from("cuentas_caja").select("id,nombre,tipo").eq("empresa_id", eId).eq("activa", true).order("tipo"),
        ]);
        setProveedores((prov as Proveedor[]) ?? []);
        setProductos((prod as Producto[]) ?? []);
        setCuentasBanco((bancos as CuentaBanco[]) ?? []);
        setCuentasCaja((cajas as CuentaCaja[]) ?? []);
        // Preseleccionar la primera cuenta disponible
        if (bancos && bancos.length > 0) setCuentaBancoId(bancos[0].id);
        if (cajas  && cajas.length  > 0) setCuentaCajaId(cajas[0].id);
      }
    }
    load();
  }, []);

  // Actualizar tipo_persona cuando cambia el proveedor
  useEffect(() => {
    if (!proveedorId) { setProveedorTipo("juridica"); return; }
    const prov = proveedores.find(p => p.id === proveedorId);
    setProveedorTipo(prov?.tipo_persona ?? "juridica");
  }, [proveedorId, proveedores]);

  function productosFiltrados(idx: number) {
    const b = busquedas[idx]?.toLowerCase() ?? "";
    if (!b) return productos;
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(b) ||
      p.codigo.toLowerCase().includes(b)
    );
  }

  function sinResultados(idx: number) {
    const b = busquedas[idx]?.toLowerCase() ?? "";
    return b.length >= 2 && productosFiltrados(idx).length === 0;
  }

  function seleccionarProducto(idx: number, prod: Producto) {
    setLineas(prev => prev.map((l, i) => i === idx
      ? { ...l, producto_id: prod.id, descripcion: prod.nombre, precio_unitario: prod.precio_compra, aplica_iva: prod.aplica_iva }
      : l
    ));
    const nb = [...busquedas]; nb[idx] = prod.nombre;
    setBusquedas(nb);
    setMostrarDropdown(null);
  }

  function abrirNuevoProducto(idx: number) {
    const nombre = busquedas[idx] ?? "";
    const codigo = nombre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PROD";
    const codigoFinal = `${codigo}-${String(productos.length + 1).padStart(3, "0")}`;
    setProdForm({ ...PROD_FORM_VACIO, nombre, codigo: codigoFinal });
    setLineaParaNuevo(idx);
    setShowNuevoProd(true);
    setMostrarDropdown(null);
  }

  async function handleCrearProducto() {
    if (!prodForm.nombre.trim()) { toast.error("El nombre del producto es obligatorio."); return; }
    if (!prodForm.codigo.trim()) { toast.error("El código es obligatorio."); return; }
    if (!empresaId)               { toast.error("No se encontró la empresa."); return; }

    setCreandoProd(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const precioCompra = lineaParaNuevo !== null ? lineas[lineaParaNuevo].precio_unitario : 0;

    const { data: nuevo, error } = await supabase.from("productos").insert({
      empresa_id:    empresaId,
      codigo:        prodForm.codigo.trim().toUpperCase(),
      nombre:        prodForm.nombre.trim(),
      unidad_medida: prodForm.unidad_medida,
      precio_compra: precioCompra,
      precio_venta:  prodForm.precio_venta,
      stock_actual:  0,
      stock_minimo:  prodForm.stock_minimo ?? 0,
      aplica_iva:    prodForm.aplica_iva,
      activo:        true,
    }).select().single();

    if (error || !nuevo) {
      toast.error(`Error al crear el producto: ${error?.message}`);
      setCreandoProd(false);
      return;
    }

    const prodNuevo = nuevo as Producto;
    setProductos(prev => [...prev, prodNuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));

    if (lineaParaNuevo !== null) {
      setLineas(prev => prev.map((l, i) => i === lineaParaNuevo
        ? { ...l, producto_id: prodNuevo.id, descripcion: prodNuevo.nombre, aplica_iva: prodNuevo.aplica_iva }
        : l
      ));
      const nb = [...busquedas]; nb[lineaParaNuevo] = prodNuevo.nombre;
      setBusquedas(nb);
    }

    toast.success(`Producto "${prodNuevo.nombre}" creado y agregado al inventario`);
    setShowNuevoProd(false);
    setCreandoProd(false);
    setLineaParaNuevo(null);
  }

  function updateLinea(idx: number, key: keyof Linea, val: string | number | boolean) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function agregarLinea() {
    setLineas(prev => [...prev, lineaVacia()]);
    setBusquedas(prev => [...prev, ""]);
  }

  function eliminarLinea(idx: number) {
    if (lineas.length === 1) return;
    setLineas(prev => prev.filter((_, i) => i !== idx));
    setBusquedas(prev => prev.filter((_, i) => i !== idx));
  }

  const calcLinea = (l: Linea) => {
    const sub = l.cantidad * l.precio_unitario;
    const iva = l.aplica_iva ? sub * IVA_NICARAGUA : 0;
    return { sub, iva, total: sub + iva };
  };

  const subtotal    = lineas.reduce((s, l) => s + calcLinea(l).sub, 0);
  const ivaTotal    = lineas.reduce((s, l) => s + calcLinea(l).iva, 0);
  const total       = subtotal + ivaTotal;
  // ── Retención IR 2% solo para proveedor natural ────────────
  const retencionIR = proveedorTipo === "natural" ? Math.round(subtotal * 0.02 * 100) / 100 : 0;
  const totalPagar  = total - retencionIR;

  async function handleSave(estado: "borrador" | "recibida") {
    if (!empresaId) { toast.error("Configura tu empresa primero."); return; }
    const lineasConDatos = lineas.filter(l => l.descripcion || l.producto_id);
    if (!lineasConDatos.length) { toast.error("Agrega al menos un artículo."); return; }

    setSaving(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // ── MODO EDICIÓN: actualizar compra existente ─────────────
    const cuentaBancoFinal = tipoPago !== "contado" && tipoPago !== "credito" ? (cuentaBancoId || null) : null;
    const cuentaCajaFinal  = tipoPago === "contado" ? (cuentaCajaId || null) : null;

    const { data: compra, error } = await supabase.from("compras").update({
      proveedor_id:   proveedorId || null,
      fecha_compra:   fechaCompra,
      tipo_pago:      tipoPago,
      estado,
      subtotal,
      iva_total:      ivaTotal,
      total,
      retencion_ir:   retencionIR,
      total_a_pagar:  totalPagar,
      cuenta_banco_id: cuentaBancoFinal,
      cuenta_caja_id:  cuentaCajaFinal,
      notas: [notas, numFacturaProveedor ? `Factura proveedor: ${numFacturaProveedor}` : ""].filter(Boolean).join(" | ") || null,
    }).eq("id", compraId).select().single();

    if (error || !compra) { toast.error(`Error al guardar: ${error?.message}`); setSaving(false); return; }

    // Borrar detalles anteriores y reinsertar
    await supabase.from("detalle_compras").delete().eq("compra_id", compraId);

    await supabase.from("detalle_compras").insert(
      lineas.map(l => {
        const { sub, iva, total: tot } = calcLinea(l);
        return {
          compra_id: compra.id,
          producto_id: l.producto_id || null,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          iva,
          total: tot,
          // subtotal es columna generada (GENERATED ALWAYS), no enviar
        };
      })
    );

    // El trigger fn_mover_stock_entrada_compra / fn_stock_cambio_estado_compra
    // ya maneja stock automáticamente. Solo insertar lotes_inventario si recibida.
    if (estado === "recibida") {
      for (const l of lineas) {
        if (!l.producto_id || l.cantidad <= 0) continue;
        await supabase.from("lotes_inventario").insert({
          empresa_id:        empresaId,
          producto_id:       l.producto_id,
          compra_id:         compra.id,
          fecha_entrada:     fechaCompra,
          cantidad_inicial:  l.cantidad,
          cantidad_restante: l.cantidad,
          costo_unitario:    l.precio_unitario,
        });
      }
    }

    toast.success(`Compra ${numeroCompra} ${estado === "recibida" ? "recibida — inventario actualizado" : "guardada como borrador"}`);
    router.push("/dashboard/compras");
  }

  // ── RENDER ──────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/compras" className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Nueva Compra</h1>
          <p className="text-slate-500 text-sm mt-1">Si el producto no existe en tu inventario, puedes crearlo al momento</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">

          {/* Datos generales */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Datos de la compra</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Proveedor</label>
                <select className="input" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}{p.tipo_persona === "natural" ? " (Natural)" : ""}
                    </option>
                  ))}
                </select>
                {proveedorTipo === "natural" && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Persona natural — se aplicará retención IR 2%
                  </p>
                )}
              </div>

              <div>
                <label className="label">Tipo de pago</label>
                <select className="input" value={tipoPago} onChange={e => setTipoPago(e.target.value)}>
                  <option value="contado">Contado (Efectivo)</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>

              {/* ── Selector de cuenta según tipo de pago ── */}
              {tipoPago === "contado" && cuentasCaja.length > 0 && (
                <div>
                  <label className="label">Cuenta de caja</label>
                  <select className="input" value={cuentaCajaId} onChange={e => setCuentaCajaId(e.target.value)}>
                    {cuentasCaja.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {(tipoPago === "transferencia" || tipoPago === "cheque" || tipoPago === "tarjeta") && cuentasBanco.length > 0 && (
                <div>
                  <label className="label">Cuenta bancaria</label>
                  <select className="input" value={cuentaBancoId} onChange={e => setCuentaBancoId(e.target.value)}>
                    {cuentasBanco.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Fecha de compra</label>
                <input type="date" className="input" value={fechaCompra} onChange={e => setFechaCompra(e.target.value)} />
              </div>

              <div>
                <label className="label flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  N° Factura del proveedor
                  <span className="text-slate-400 font-normal text-xs">(opcional)</span>
                </label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="Ej: 0001-0001-00123456"
                  value={numFacturaProveedor}
                  onChange={e => setNumFacturaProveedor(e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </div>

          {/* Líneas de detalle */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Artículos</h2>
            <div className="space-y-4">
              {lineas.map((l, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-5 relative">
                      <label className="label text-xs">Producto</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          className="input pl-8 text-sm"
                          placeholder="Buscar producto..."
                          value={busquedas[idx] ?? ""}
                          onChange={e => {
                            const nb = [...busquedas]; nb[idx] = e.target.value;
                            setBusquedas(nb);
                            if (!e.target.value) updateLinea(idx, "producto_id", "");
                            setMostrarDropdown(idx);
                          }}
                          onFocus={() => setMostrarDropdown(idx)}
                          onBlur={() => setTimeout(() => setMostrarDropdown(null), 150)}
                        />
                      </div>
                      {mostrarDropdown === idx && (
                        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                          {productosFiltrados(idx).map(prod => (
                            <button
                              key={prod.id}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-brand-50 text-sm"
                              onMouseDown={() => seleccionarProducto(idx, prod)}
                            >
                              <span className="font-medium">{prod.nombre}</span>
                              <span className="text-slate-400 text-xs ml-2">{prod.codigo}</span>
                              <span className={`text-xs ml-2 ${prod.stock_actual <= prod.stock_minimo ? "text-red-500" : "text-green-600"}`}>
                                Stock: {prod.stock_actual}
                              </span>
                            </button>
                          ))}
                          {sinResultados(idx) ? (
                            <button
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-brand-50 flex items-start gap-3"
                              onMouseDown={() => abrirNuevoProducto(idx)}
                            >
                              <PackagePlus className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-brand-700">
                                  + Crear &quot;{busquedas[idx]}&quot; como nuevo producto
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  No existe en tu inventario. Se creará automáticamente.
                                </p>
                              </div>
                            </button>
                          ) : (
                            <div className="px-3 py-2 text-xs text-slate-400">
                              Escribe para buscar productos...
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="col-span-12 md:col-span-3">
                      <label className="label text-xs">Descripción</label>
                      <input type="text" className="input text-sm" value={l.descripcion}
                        onChange={e => updateLinea(idx, "descripcion", e.target.value)}
                        placeholder="Descripción del artículo" />
                    </div>

                    <div className="col-span-4 md:col-span-1">
                      <label className="label text-xs">Cant.</label>
                      <input type="number" className="input text-sm" min="0" step="0.01" value={l.cantidad}
                        onChange={e => updateLinea(idx, "cantidad", parseFloat(e.target.value) || 0)} />
                    </div>

                    <div className="col-span-4 md:col-span-2">
                      <label className="label text-xs">Precio C$</label>
                      <input type="number" className="input text-sm" min="0" step="0.01" value={l.precio_unitario}
                        onChange={e => updateLinea(idx, "precio_unitario", parseFloat(e.target.value) || 0)} />
                    </div>

                    <div className="col-span-4 md:col-span-1 flex items-end justify-between pb-1">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" className="w-3.5 h-3.5" checked={l.aplica_iva}
                          onChange={e => updateLinea(idx, "aplica_iva", e.target.checked)} />
                        IVA
                      </label>
                      <button type="button" onClick={() => eliminarLinea(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {l.producto_id ? (
                        <span className="badge-success text-xs">✓ Vinculado al inventario</span>
                      ) : l.descripcion ? (
                        <span className="badge-gray text-xs">Sin vincular al inventario</span>
                      ) : null}
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      <span className="text-xs text-slate-400 mr-2">Subtotal: {formatCurrency(calcLinea(l).sub)}</span>
                      <span className="font-semibold text-slate-700">Total: {formatCurrency(calcLinea(l).total)}</span>
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" onClick={agregarLinea}
                className="flex items-center gap-2 text-brand-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> Agregar artículo
              </button>
            </div>
          </div>

          <div className="card">
            <label className="label">Notas</label>
            <textarea className="input resize-none" rows={2} value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>

        {/* Panel resumen */}
        <div>
          <div className="card sticky top-6">
            <h2 className="font-semibold text-slate-900 mb-4">Resumen</h2>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>IVA (15%)</span><span>{formatCurrency(ivaTotal)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-base text-slate-900">
                <span>Total factura</span><span>{formatCurrency(total)}</span>
              </div>

              {/* ── Retención IR 2% para proveedor natural ── */}
              {retencionIR > 0 && (
                <>
                  <div className="flex justify-between text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Retención IR 2% (Art. 44 LCT)
                    </span>
                    <span>- {formatCurrency(retencionIR)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg text-slate-900 border-t border-slate-200 pt-2">
                    <span>Total a pagar</span><span>{formatCurrency(totalPagar)}</span>
                  </div>
                  <p className="text-xs text-amber-600">
                    La retención se entera a la DGI. El proveedor recibe {formatCurrency(totalPagar)}.
                  </p>
                </>
              )}
            </div>

            {numFacturaProveedor && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Factura proveedor</p>
                  <p className="font-mono mt-0.5">{numFacturaProveedor}</p>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-xs mb-4">
              <p className="font-semibold mb-1">📦 Inventario automático</p>
              <p>Al <strong>Recibir</strong> la compra, el stock se actualiza y el asiento contable se genera.</p>
            </div>
            <div className="space-y-3">
              <button disabled={saving} onClick={() => handleSave("recibida")}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Recibir compra</>}
              </button>
              <button disabled={saving} onClick={() => handleSave("borrador")} className="btn-secondary w-full">
                Guardar borrador
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Crear producto */}
      {showNuevoProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-brand-700" />
                  Nuevo producto en inventario
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">El stock se actualizará al recibir esta compra</p>
              </div>
              <button onClick={() => setShowNuevoProd(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs">
                💡 El precio de compra viene de la línea. El stock inicial será <strong>0</strong> y se sumará al recibir.
              </div>
              <div>
                <label className="label">Código <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono uppercase" value={prodForm.codigo}
                    onChange={e => setProdForm(f => ({ ...f, codigo: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                    placeholder="Ej: ARR-001" maxLength={20} />
                  <button type="button"
                    onClick={() => { const base = prodForm.nombre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); const num = String(productos.length + 1).padStart(3, "0"); setProdForm(f => ({ ...f, codigo: `${base}-${num}` })); }}
                    className="btn-secondary text-xs px-3 whitespace-nowrap">Generar</button>
                </div>
              </div>
              <div>
                <label className="label">Nombre <span className="text-red-500">*</span></label>
                <input className="input" value={prodForm.nombre}
                  onChange={e => setProdForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Unidad</label>
                  <select className="input" value={prodForm.unidad_medida}
                    onChange={e => setProdForm(f => ({ ...f, unidad_medida: e.target.value }))}>
                    {["unidad","caja","kg","gr","litro","ml","metro","par","docena","servicio"].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">¿Aplica IVA?</label>
                  <select className="input" value={prodForm.aplica_iva ? "si" : "no"}
                    onChange={e => setProdForm(f => ({ ...f, aplica_iva: e.target.value === "si" }))}>
                    <option value="si">Sí — 15%</option>
                    <option value="no">No — exento</option>
                  </select>
                </div>
                <div>
                  <label className="label">Precio de venta (C$)</label>
                  <input type="number" className="input" min="0" step="0.01" value={prodForm.precio_venta}
                    onChange={e => setProdForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="label">Stock mínimo</label>
                  <input type="number" className="input" min="0" value={prodForm.stock_minimo ?? 0}
                    onChange={e => setProdForm(f => ({ ...f, stock_minimo: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={handleCrearProducto} disabled={creandoProd}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {creandoProd ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><PackagePlus className="w-4 h-4" />Crear y agregar</>}
              </button>
              <button onClick={() => setShowNuevoProd(false)} className="btn-secondary px-5">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
