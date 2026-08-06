"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, ArrowLeft, AlertCircle, Search, X, PackagePlus, UserPlus } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { IVA_NICARAGUA } from "@/types";
import type { Cliente, Producto } from "@/types";
import AutorizacionAdminModal from "@/components/AutorizacionAdminModal";

interface Linea {
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  aplica_iva: boolean;
}

interface CuentaBanco { id: string; nombre: string; banco: string; moneda: string; }
interface CuentaCaja  { id: string; nombre: string; tipo: string; moneda: string; }

const PROD_FORM_VACIO = {
  codigo: "", nombre: "", unidad_medida: "servicio",
  precio_compra: 0, aplica_iva: true, stock_minimo: 0,
};

const CLI_FORM_VACIO = {
  nombre: "", ruc: "", cedula: "", telefono: "", correo: "", direccion: "",
};

export default function VentaForm({ modoServicio = false }: { modoServicio?: boolean }) {
  const router = useRouter();

  const [saving,    setSaving]    = useState(false);
  const [clientes,  setClientes]  = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");

  const [clienteId,        setClienteId]        = useState("");
  const [fechaEmision,     setFechaEmision]      = useState(new Date().toISOString().split("T")[0]);
  const [fechaVencimiento, setFechaVencimiento]  = useState("");
  const [tipoPago,         setTipoPago]          = useState("contado");
  const [notas,            setNotas]             = useState("");
  const [lineas,           setLineas]            = useState<Linea[]>([lineaVacia()]);

  const [cuentasBanco,  setCuentasBanco]  = useState<CuentaBanco[]>([]);
  const [cuentasCaja,   setCuentasCaja]   = useState<CuentaCaja[]>([]);
  const [cuentaBancoId, setCuentaBancoId] = useState("");
  const [cuentaCajaId,  setCuentaCajaId]  = useState("");
  const [tasaCambio,    setTasaCambio]    = useState("");

  const [showAuth,               setShowAuth]               = useState(false);
  const [descuentoAutorizadoPor, setDescuentoAutorizadoPor] = useState<string | null>(null);
  const [descuentoAutorizadoEn,  setDescuentoAutorizadoEn]  = useState<string | null>(null);
  const [estadoPendiente,        setEstadoPendiente]        = useState<"borrador" | "emitida" | null>(null);

  // ── Búsqueda / creación de ítem al vuelo (producto o servicio) ──
  const [busquedas,       setBusquedas]       = useState<string[]>([""]);
  const [mostrarDropdown, setMostrarDropdown] = useState<number | null>(null);
  const [showNuevoProd,   setShowNuevoProd]   = useState(false);
  const [lineaParaNuevo,  setLineaParaNuevo]  = useState<number | null>(null);
  const [prodForm,        setProdForm]        = useState({ ...PROD_FORM_VACIO });
  const [creandoProd,     setCreandoProd]     = useState(false);

  // ── Búsqueda / creación de cliente al vuelo ──────────────────
  const [busquedaCli,         setBusquedaCli]         = useState("");
  const [mostrarDropdownCli,  setMostrarDropdownCli]  = useState(false);
  const [showNuevoCli,        setShowNuevoCli]        = useState(false);
  const [cliForm,             setCliForm]             = useState({ ...CLI_FORM_VACIO });
  const [creandoCli,          setCreandoCli]          = useState(false);

  function lineaVacia(): Linea {
    return { producto_id: "", descripcion: "", cantidad: 1, precio_unitario: 0, descuento_pct: 0, aplica_iva: true };
  }

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const { getEmpresaIdActual } = await import("@/lib/supabase/empresa-actual");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const eId = await getEmpresaIdActual(supabase, user.id) ?? "";
      setEmpresaId(eId);

      if (eId) {
        const [{ data: cl }, { data: pr }, { data: bancos }, { data: cajas }] = await Promise.all([
          supabase.from("clientes").select("*").eq("empresa_id", eId).eq("activo", true).order("nombre"),
          supabase.from("productos").select("*").eq("empresa_id", eId).eq("activo", true).order("nombre"),
          supabase.from("cuentas_banco").select("id,nombre,banco,moneda").eq("empresa_id", eId).eq("activa", true).order("created_at"),
          supabase.from("cuentas_caja").select("id,nombre,tipo,moneda").eq("empresa_id", eId).eq("activa", true).order("tipo"),
        ]);
        setClientes((cl as Cliente[]) ?? []);
        setProductos((pr as Producto[]) ?? []);
        setCuentasBanco((bancos as CuentaBanco[]) ?? []);
        setCuentasCaja((cajas as CuentaCaja[]) ?? []);
        const bancoNio = bancos?.find(b => b.moneda === "NIO") ?? bancos?.[0];
        if (bancoNio) setCuentaBancoId(bancoNio.id);
        if (cajas && cajas.length > 0) setCuentaCajaId(cajas[0].id);
      }
    }
    load();
  }, []);

  function handleTipoPago(val: string) {
    setTipoPago(val);
    if (val !== "credito") setFechaVencimiento("");
  }

  const monedaCuentaCobro = tipoPago === "contado"
    ? cuentasCaja.find(c => c.id === cuentaCajaId)?.moneda
    : (tipoPago === "transferencia" || tipoPago === "cheque" || tipoPago === "tarjeta")
      ? cuentasBanco.find(c => c.id === cuentaBancoId)?.moneda
      : undefined;
  const cuentaCobroEsUSD = monedaCuentaCobro === "USD";

  useEffect(() => {
    if (!cuentaCobroEsUSD || !empresaId) { setTasaCambio(""); return; }
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.rpc("fn_tasa_cambio_vigente", { p_empresa_id: empresaId });
      if (data) setTasaCambio(String(data));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaCobroEsUSD, empresaId]);

  // ── Ítems: buscar / seleccionar / crear al vuelo ──────────────
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
      ? { ...l, producto_id: prod.id, descripcion: prod.nombre, precio_unitario: prod.precio_venta, aplica_iva: prod.aplica_iva }
      : l
    ));
    const nb = [...busquedas]; nb[idx] = prod.nombre;
    setBusquedas(nb);
    setMostrarDropdown(null);
  }

  function abrirNuevoProducto(idx: number) {
    const nombre = busquedas[idx] ?? "";
    const codigo = nombre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "ITEM";
    const codigoFinal = `${codigo}-${String(productos.length + 1).padStart(3, "0")}`;
    setProdForm({ ...PROD_FORM_VACIO, nombre, codigo: codigoFinal, unidad_medida: modoServicio ? "servicio" : "unidad" });
    setLineaParaNuevo(idx);
    setShowNuevoProd(true);
    setMostrarDropdown(null);
  }

  async function handleCrearProducto() {
    if (!prodForm.nombre.trim()) { toast.error("El nombre es obligatorio."); return; }
    if (!prodForm.codigo.trim()) { toast.error("El código es obligatorio."); return; }
    if (!empresaId)               { toast.error("No se encontró la empresa."); return; }

    setCreandoProd(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const precioVenta = lineaParaNuevo !== null ? lineas[lineaParaNuevo].precio_unitario : 0;

    const { data: nuevo, error } = await supabase.from("productos").insert({
      empresa_id:    empresaId,
      codigo:        prodForm.codigo.trim().toUpperCase(),
      nombre:        prodForm.nombre.trim(),
      unidad_medida: prodForm.unidad_medida,
      precio_compra: prodForm.precio_compra,
      precio_venta:  precioVenta,
      stock_actual:  0,
      stock_minimo:  prodForm.stock_minimo ?? 0,
      aplica_iva:    prodForm.aplica_iva,
      activo:        true,
    }).select().single();

    if (error || !nuevo) {
      toast.error(`Error al crear: ${error?.message}`);
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

    toast.success(`"${prodNuevo.nombre}" creado y agregado al inventario`);
    setShowNuevoProd(false);
    setCreandoProd(false);
    setLineaParaNuevo(null);
  }

  // ── Cliente: buscar / seleccionar / crear al vuelo ────────────
  function clientesFiltrados() {
    const b = busquedaCli.toLowerCase();
    if (!b) return clientes;
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(b) ||
      (c.ruc ?? "").toLowerCase().includes(b) ||
      (c.cedula ?? "").toLowerCase().includes(b)
    );
  }

  function sinResultadosCli() {
    return busquedaCli.length >= 2 && clientesFiltrados().length === 0;
  }

  function seleccionarCliente(cli: Cliente) {
    setClienteId(cli.id);
    setBusquedaCli(cli.nombre);
    setMostrarDropdownCli(false);
  }

  function quitarCliente() {
    setClienteId("");
    setBusquedaCli("");
  }

  function abrirNuevoCliente() {
    setCliForm({ ...CLI_FORM_VACIO, nombre: busquedaCli });
    setShowNuevoCli(true);
    setMostrarDropdownCli(false);
  }

  async function handleCrearCliente() {
    if (!cliForm.nombre.trim()) { toast.error("El nombre del cliente es obligatorio."); return; }
    if (!empresaId)             { toast.error("No se encontró la empresa."); return; }

    setCreandoCli(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data: nuevo, error } = await supabase.from("clientes").insert({
      empresa_id: empresaId,
      nombre:     cliForm.nombre.trim(),
      ruc:        cliForm.ruc || null,
      cedula:     cliForm.cedula || null,
      telefono:   cliForm.telefono || null,
      correo:     cliForm.correo || null,
      direccion:  cliForm.direccion || null,
      tipo:       "contado",
      activo:     true,
    }).select().single();

    if (error || !nuevo) {
      toast.error(`Error al crear el cliente: ${error?.message}`);
      setCreandoCli(false);
      return;
    }

    const cliNuevo = nuevo as Cliente;
    setClientes(prev => [...prev, cliNuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    seleccionarCliente(cliNuevo);

    toast.success(`Cliente "${cliNuevo.nombre}" creado`);
    setShowNuevoCli(false);
    setCreandoCli(false);
  }

  function updateLinea(idx: number, key: keyof Linea, val: string | number | boolean) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
    if (key === "descuento_pct") setDescuentoAutorizadoPor(null);
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
    const sub = l.cantidad * l.precio_unitario * (1 - l.descuento_pct / 100);
    const iva = l.aplica_iva ? Math.round(sub * IVA_NICARAGUA * 100) / 100 : 0;
    return { sub, iva, total: sub + iva };
  };

  const subtotal        = lineas.reduce((s, l) => s + calcLinea(l).sub, 0);
  const ivaTotal         = lineas.reduce((s, l) => s + calcLinea(l).iva, 0);
  const descuentoTotal   = lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario * (l.descuento_pct / 100), 0);
  const total            = subtotal + ivaTotal;

  async function handleSave(estado: "borrador" | "emitida", autorizadoPorOverride?: string) {
    if (!empresaId) { toast.error("Primero configura los datos de tu empresa."); return; }

    const autorizadoPor = autorizadoPorOverride ?? descuentoAutorizadoPor;
    if (descuentoTotal > 0 && !autorizadoPor) {
      setEstadoPendiente(estado);
      setShowAuth(true);
      return;
    }

    const lineasValidas = lineas.filter(l => l.descripcion.trim() !== "");
    if (lineasValidas.length === 0) {
      toast.error(modoServicio ? "Agrega al menos un servicio con descripción." : "Agrega al menos un producto o servicio con descripción.");
      return;
    }

    if (estado === "emitida") {
      for (const l of lineasValidas) {
        if (!l.producto_id || l.cantidad <= 0) continue;
        const prod = productos.find(p => p.id === l.producto_id);
        if (prod && prod.stock_actual < l.cantidad) {
          toast.error(
            `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock_actual} | Solicitado: ${l.cantidad}`,
            { duration: 6000 }
          );
          return;
        }
      }
    }

    setSaving(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data: cons } = await supabase
      .from("consecutivos").select("*")
      .eq("empresa_id", empresaId).eq("tipo", "factura").single();
    let numeroFactura = "F-000001";
    if (cons) {
      const nuevo = cons.ultimo + 1;
      numeroFactura = `${cons.prefijo}-${String(nuevo).padStart(6, "0")}`;
      await supabase.from("consecutivos").update({ ultimo: nuevo }).eq("id", cons.id);
    } else {
      await supabase.from("consecutivos").insert({ empresa_id: empresaId, tipo: "factura", ultimo: 1, prefijo: "F" });
    }

    const nombreCliente = clientes.find(c => c.id === clienteId)?.nombre
      ?? (busquedaCli.trim() || "Consumidor final");

    const cuentaBancoFinal = (tipoPago !== "contado" && tipoPago !== "credito")
      ? (cuentaBancoId || null)
      : null;
    const cuentaCajaFinal = tipoPago === "contado"
      ? (cuentaCajaId || null)
      : null;

    if (cuentaCobroEsUSD && (!tasaCambio || Number(tasaCambio) <= 0)) {
      toast.error("Ingresa la tasa de cambio para cobrar en una cuenta en dólares.");
      setSaving(false);
      return;
    }

    const { data: factura, error } = await supabase.from("facturas").insert({
      empresa_id:        empresaId,
      numero_factura:    numeroFactura,
      cliente_id:        clienteId || null,
      cliente_nombre:    nombreCliente,
      fecha_emision:     fechaEmision,
      fecha_vencimiento: fechaVencimiento || null,
      tipo_pago:         tipoPago,
      estado,
      subtotal,
      descuento_total:   descuentoTotal,
      iva_total:         ivaTotal,
      total,
      notas:             notas || null,
      cuenta_banco_id:   cuentaBancoFinal,
      cuenta_caja_id:    cuentaCajaFinal,
      tasa_cambio:       cuentaCobroEsUSD ? Number(tasaCambio) : null,
      descuento_autorizado_por: descuentoTotal > 0 ? autorizadoPor : null,
      descuento_autorizado_en:  descuentoTotal > 0 ? (descuentoAutorizadoEn ?? new Date().toISOString()) : null,
    }).select().single();

    if (error || !factura) {
      toast.error(`Error al guardar: ${error?.message}`);
      setSaving(false);
      return;
    }

    const { error: detError } = await supabase.from("detalle_facturas").insert(
      lineasValidas.map(l => {
        const { sub, iva, total: tot } = calcLinea(l);
        return {
          factura_id:      factura.id,
          producto_id:     l.producto_id || null,
          descripcion:     l.descripcion.trim(),
          cantidad:        l.cantidad,
          precio_unitario: l.precio_unitario,
          descuento_pct:   l.descuento_pct,
          subtotal:        sub,
          iva,
          total:           tot,
        };
      })
    );

    if (detError) {
      await supabase.from("facturas").update({
        estado: "anulada",
        notas: `${notas ? notas + " — " : ""}Auto-anulada: fallo al guardar el detalle (${detError.message})`,
      }).eq("id", factura.id);

      toast.error(detError.message.includes("Stock insuficiente")
        ? detError.message
        : `Error al guardar los detalles: ${detError.message}`,
        { duration: 8000 }
      );
      setSaving(false);
      return;
    }

    toast.success(
      `Factura ${numeroFactura} ${estado === "emitida" ? "emitida ✓" : "guardada como borrador"}`,
      { duration: 4000 }
    );
    router.push(modoServicio ? "/dashboard/ingreso-datos" : "/dashboard/ventas");
  }

  const esCredito = tipoPago === "credito";

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/ingreso-datos" className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {modoServicio ? "Nuevo Servicio" : "Nueva Venta"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {modoServicio
              ? "Registra un servicio brindado (reparación, consultoría, instalación...). No afecta inventario."
              : "Si el producto no existe en tu inventario, puedes crearlo al momento"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">

          {/* Datos generales */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">Datos generales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div className="md:col-span-2 relative">
                <label className="label">Cliente</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    className="input pl-8 pr-8"
                    placeholder="Buscar cliente... (o dejar vacío / escribir nombre nuevo)"
                    value={busquedaCli}
                    onChange={e => {
                      setBusquedaCli(e.target.value);
                      if (!e.target.value) setClienteId("");
                      setMostrarDropdownCli(true);
                    }}
                    onFocus={() => setMostrarDropdownCli(true)}
                    onBlur={() => setTimeout(() => setMostrarDropdownCli(false), 150)}
                  />
                  {busquedaCli && (
                    <button type="button" onClick={quitarCliente}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {mostrarDropdownCli && (
                  <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                    {clientesFiltrados().map(cli => (
                      <button
                        key={cli.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-brand-50 text-sm"
                        onMouseDown={() => seleccionarCliente(cli)}
                      >
                        <span className="font-medium">{cli.nombre}</span>
                        {cli.ruc && <span className="text-slate-400 text-xs ml-2">{cli.ruc}</span>}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-brand-50 flex items-start gap-3 border-t border-slate-100"
                      onMouseDown={abrirNuevoCliente}
                    >
                      <UserPlus className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-brand-700">
                          {sinResultadosCli() ? `+ Crear "${busquedaCli}" como nuevo cliente` : "+ Crear nuevo cliente"}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          O simplemente deja el nombre escrito y factura sin guardarlo en tu catálogo.
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

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

              {tipoPago === "contado" && cuentasCaja.length > 0 && (
                <div>
                  <label className="label">Cuenta de caja</label>
                  <select className="input" value={cuentaCajaId} onChange={e => setCuentaCajaId(e.target.value)}>
                    {cuentasCaja.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
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

              {cuentaCobroEsUSD && (
                <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <label className="label text-amber-800">Tasa de cambio (C$ por US$1)</label>
                  <input type="number" min="0" step="0.0001" className="input font-mono" placeholder="Ej: 36.6000"
                    value={tasaCambio} onChange={e => setTasaCambio(e.target.value)} />
                  <p className="text-xs text-amber-700 mt-1">
                    Esta cuenta está en dólares. El total de C$ se cobrará como
                    {" "}
                    {Number(tasaCambio) > 0
                      ? `≈ $${(total / Number(tasaCambio)).toFixed(2)} USD`
                      : "— (ingresa la tasa)"}
                    .
                  </p>
                </div>
              )}

              <div>
                <label className="label">Fecha de emisión</label>
                <input type="date" className="input" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
              </div>

              {esCredito && (
                <div className="md:col-span-2">
                  <label className="label">
                    Fecha de vencimiento <span className="text-red-500">*</span>
                    <span className="text-slate-400 font-normal text-xs ml-2">(requerida para crédito)</span>
                  </label>
                  <input type="date" className="input" value={fechaVencimiento}
                    onChange={e => setFechaVencimiento(e.target.value)} min={fechaEmision} required />
                </div>
              )}
            </div>
          </div>

          {/* Ítems */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">{modoServicio ? "Servicios" : "Productos / Servicios"}</h2>
            <div className="space-y-4">
              {lineas.map((l, idx) => {
                const prod = productos.find(p => p.id === l.producto_id);
                const stockBajo = prod && l.producto_id && l.cantidad > prod.stock_actual;
                return (
                  <div key={idx} className={`border rounded-xl p-4 space-y-3 ${stockBajo ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 md:col-span-4 relative">
                        <label className="label text-xs">{modoServicio ? "Servicio" : "Producto"}</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            className="input pl-8 text-sm"
                            placeholder={modoServicio ? "Describe el servicio..." : "Buscar producto..."}
                            value={busquedas[idx] ?? ""}
                            onChange={e => {
                              const nb = [...busquedas]; nb[idx] = e.target.value;
                              setBusquedas(nb);
                              if (!e.target.value) updateLinea(idx, "producto_id", "");
                              // En modo servicio no forzamos catálogo: lo que se escribe
                              // aquí ES la descripción de la línea, no solo un filtro.
                              if (modoServicio) updateLinea(idx, "descripcion", e.target.value);
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
                                {!modoServicio && (
                                  <span className={`text-xs ml-2 ${prod.stock_actual <= prod.stock_minimo ? "text-red-500" : "text-green-600"}`}>
                                    Stock: {prod.stock_actual}
                                  </span>
                                )}
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
                                    + Agregar &quot;{busquedas[idx]}&quot; al catálogo
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    Opcional — puedes dejarlo como texto libre sin guardarlo.
                                  </p>
                                </div>
                              </button>
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-400">
                                Escribe para buscar en tu catálogo...
                              </div>
                            )}
                          </div>
                        )}
                        {stockBajo && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Stock insuficiente — disponible: {prod!.stock_actual}
                          </p>
                        )}
                      </div>

                      <div className="col-span-12 md:col-span-3">
                        <label className="label text-xs">Descripción</label>
                        <input type="text" className="input text-sm" value={l.descripcion}
                          onChange={e => updateLinea(idx, "descripcion", e.target.value)} placeholder="Descripción" />
                      </div>
                      <div className="col-span-4 md:col-span-1">
                        <label className="label text-xs">Cant.</label>
                        <input type="number" className="input text-sm" min="0" step="0.01" value={l.cantidad}
                          onChange={e => updateLinea(idx, "cantidad", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="label text-xs">Precio</label>
                        <input type="number" className="input text-sm" min="0" step="0.01" value={l.precio_unitario}
                          onChange={e => updateLinea(idx, "precio_unitario", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-4 md:col-span-1">
                        <label className="label text-xs">Desc.%</label>
                        <input type="number" className="input text-sm" min="0" max="100" value={l.descuento_pct}
                          onChange={e => updateLinea(idx, "descuento_pct", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-12 md:col-span-1 flex items-center justify-between md:justify-center gap-2 pt-1">
                        <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" className="w-3.5 h-3.5" checked={l.aplica_iva}
                            onChange={e => updateLinea(idx, "aplica_iva", e.target.checked)} />
                          IVA
                        </label>
                        <button type="button" onClick={() => eliminarLinea(idx)} className="text-red-400 hover:text-red-600 p-1">
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
                      <div className="text-right text-sm font-semibold text-slate-700">
                        Total: {formatCurrency(calcLinea(l).total)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={agregarLinea}
                className="flex items-center gap-2 text-brand-700 hover:text-brand-900 text-sm font-medium">
                <Plus className="w-4 h-4" /> {modoServicio ? "Agregar servicio" : "Agregar línea"}
              </button>
            </div>
          </div>

          <div className="card">
            <label className="label">Notas (opcional)</label>
            <textarea className="input resize-none" rows={3}
              placeholder="Observaciones, condiciones de pago, etc."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>

        {/* Panel resumen */}
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

            {lineas.some(l => {
              const p = productos.find(pr => pr.id === l.producto_id);
              return p && l.cantidad > p.stock_actual;
            }) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Hay ítems con stock insuficiente. No podrás emitir la factura.</span>
              </div>
            )}

            <div className="space-y-3">
              <button type="button" disabled={saving} onClick={() => handleSave("emitida")}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Save className="w-4 h-4" />{modoServicio ? "Emitir servicio" : "Emitir factura"}</>
                }
              </button>
              <button type="button" disabled={saving} onClick={() => handleSave("borrador")}
                className="btn-secondary w-full">
                Guardar borrador
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Crear producto/servicio en catálogo */}
      {showNuevoProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-brand-700" />
                  Agregar al catálogo
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">Quedará disponible para futuras facturas</p>
              </div>
              <button onClick={() => setShowNuevoProd(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="label">Código <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono uppercase" value={prodForm.codigo}
                    onChange={e => setProdForm(f => ({ ...f, codigo: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                    placeholder="Ej: SERV-001" maxLength={20} />
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
                    {["servicio", "unidad", "caja", "kg", "gr", "litro", "ml", "metro", "par", "docena"].map(u => <option key={u}>{u}</option>)}
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

      {/* Modal: Crear cliente */}
      {showNuevoCli && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-700" />
                  Nuevo cliente
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">Quedará disponible para esta y futuras facturas</p>
              </div>
              <button onClick={() => setShowNuevoCli(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="label">Nombre <span className="text-red-500">*</span></label>
                <input className="input" value={cliForm.nombre}
                  onChange={e => setCliForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">RUC</label>
                  <input className="input" value={cliForm.ruc}
                    onChange={e => setCliForm(f => ({ ...f, ruc: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Cédula</label>
                  <input className="input" value={cliForm.cedula}
                    onChange={e => setCliForm(f => ({ ...f, cedula: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" className="input" placeholder="8888-8888" value={cliForm.telefono}
                    onChange={e => setCliForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" value={cliForm.correo}
                    onChange={e => setCliForm(f => ({ ...f, correo: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Dirección</label>
                <input className="input" value={cliForm.direccion}
                  onChange={e => setCliForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={handleCrearCliente} disabled={creandoCli}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {creandoCli ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4" />Crear y usar</>}
              </button>
              <button onClick={() => setShowNuevoCli(false)} className="btn-secondary px-5">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <AutorizacionAdminModal
        open={showAuth}
        onClose={() => { setShowAuth(false); setEstadoPendiente(null); }}
        mensaje="Esta factura tiene un descuento manual. Ingresa la contraseña de un administrador para autorizarlo."
        onAuthorized={(adminId) => {
          setDescuentoAutorizadoPor(adminId);
          setDescuentoAutorizadoEn(new Date().toISOString());
          setShowAuth(false);
          if (estadoPendiente) { handleSave(estadoPendiente, adminId); setEstadoPendiente(null); }
        }}
      />
    </div>
  );
}
