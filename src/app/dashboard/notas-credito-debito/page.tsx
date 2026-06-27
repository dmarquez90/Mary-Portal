'use client'
import { useState, useEffect, useCallback } from 'react'
import { FileX, Plus, ChevronDown, Check, Package } from 'lucide-react'

interface Nota {
  id: string
  tipo: 'credito' | 'debito'
  numero_nota: string
  fecha: string
  motivo: string
  subtotal: number
  iva: number
  total: number
  estado: string
  factura?: { numero_factura: string }
  compra?: { numero_compra: string }
  cliente?: { nombre: string }
  proveedor?: { nombre: string }
}

interface Factura {
  id: string
  numero_factura: string
  cliente_nombre: string
  fecha_emision: string
  total: number
  subtotal: number
  iva_total: number
}

interface Compra {
  id: string
  numero_compra: string
  fecha_compra: string
  total: number
  subtotal: number
  iva_total: number
}

interface DetalleItem {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva: number
  total: number
  // para la nota: cantidad y monto a devolver
  cant_devolver: number
  seleccionado: boolean
}

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)
const IVA = 0.15

export default function NotasCreditoDebitoPage() {
  const [notas, setNotas]       = useState<Nota[]>([])
  const [loading, setLoading]   = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Listas de documentos disponibles
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [compras,  setCompras]  = useState<Compra[]>([])

  // Formulario
  const [tipo,         setTipo]         = useState<'credito' | 'debito'>('credito')
  const [fecha,        setFecha]        = useState(new Date().toISOString().split('T')[0])
  const [motivo,       setMotivo]       = useState('')
  const [refFacturaId, setRefFacturaId] = useState('')
  const [refCompraId,  setRefCompraId]  = useState('')

  // Items del documento seleccionado
  const [items,         setItems]         = useState<DetalleItem[]>([])
  const [loadingItems,  setLoadingItems]  = useState(false)
  const [modoManual,    setModoManual]    = useState(false)  // fallback si no hay detalle
  const [subtotalManual, setSubtotalManual] = useState('')
  const [ivaManual,     setIvaManual]     = useState('')

  // ── cargar empresa y datos al montar ────────────────────────
  useEffect(() => {
    async function boot() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const eid = en?.id ?? ej?.id ?? ''
      setEmpresaId(eid)
      if (eid) {
        fetchNotas(eid)
        fetchDocumentos(eid, supabase)
      }
    }
    boot()
  }, [])

  async function fetchDocumentos(eid: string, supabase: Awaited<ReturnType<typeof import('@/lib/supabase/client').createClient>>) {
    const [{ data: facs }, { data: comps }] = await Promise.all([
      supabase.from('facturas').select('id,numero_factura,cliente_nombre,fecha_emision,total,subtotal,iva_total')
        .eq('empresa_id', eid).eq('estado', 'emitida').order('fecha_emision', { ascending: false }),
      supabase.from('compras').select('id,numero_compra,fecha_compra,total,subtotal,iva_total')
        .eq('empresa_id', eid).in('estado', ['recibida','pagada']).order('fecha_compra', { ascending: false }),
    ])
    setFacturas((facs as Factura[]) ?? [])
    setCompras((comps as Compra[]) ?? [])
  }

  const fetchNotas = useCallback(async (eid: string, t?: string) => {
    setLoading(true)
    let url = `/api/notas-credito-debito?empresa_id=${eid}`
    if (t && t !== 'todos') url += `&tipo=${t}`
    const r = await fetch(url)
    const d = await r.json()
    setNotas(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [])

  // ── Al cambiar factura/compra seleccionada, cargar sus ítems ─
  async function cargarItemsFactura(facturaId: string) {
    if (!facturaId) { setItems([]); return }
    setLoadingItems(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('detalle_facturas')
      .select('id,descripcion,cantidad,precio_unitario,iva,total')
      .eq('factura_id', facturaId)
    if (data && data.length > 0) {
      setItems(data.map((d: { id: string; descripcion: string; cantidad: number; precio_unitario: number; iva: number; total: number }) => ({
        ...d,
        cant_devolver: d.cantidad,
        seleccionado: true,
      })))
      setModoManual(false)
    } else {
      // La factura no tiene detalle — modo manual
      setItems([])
      setModoManual(true)
    }
    setLoadingItems(false)
  }

  async function cargarItemsCompra(compraId: string) {
    if (!compraId) { setItems([]); return }
    setLoadingItems(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('detalle_compras')
      .select('id,descripcion,cantidad,precio_unitario,iva,total')
      .eq('compra_id', compraId)
    if (data && data.length > 0) {
      setItems(data.map((d: { id: string; descripcion: string; cantidad: number; precio_unitario: number; iva: number; total: number }) => ({
        ...d,
        cant_devolver: d.cantidad,
        seleccionado: true,
      })))
      setModoManual(false)
    } else {
      setItems([])
      setModoManual(true)
    }
    setLoadingItems(false)
  }

  function toggleItem(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, seleccionado: !it.seleccionado } : it))
  }

  function updateCantDevolver(idx: number, val: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const cant = Math.max(0, Math.min(val, it.cantidad))
      return { ...it, cant_devolver: cant, seleccionado: cant > 0 }
    }))
  }

  // ── Calcular totales de ítems seleccionados ───────────────────
  const itemsSeleccionados = items.filter(it => it.seleccionado && it.cant_devolver > 0)

  const subtotalNota = itemsSeleccionados.reduce((s, it) => {
    const proporcional = (it.cant_devolver / it.cantidad)
    const subLineaOriginal = it.precio_unitario * it.cantidad
    return s + (subLineaOriginal * proporcional)
  }, 0)

  const ivaNota = itemsSeleccionados.reduce((s, it) => {
    const proporcional = (it.cant_devolver / it.cantidad)
    return s + (it.iva * proporcional)
  }, 0)

  const totalNota = subtotalNota + ivaNota

  // ── Totales finales (items o manual) ─────────────────────────
  const subFinal = modoManual ? (parseFloat(subtotalManual) || 0) : subtotalNota
  const ivaFinal = modoManual ? (parseFloat(ivaManual) || subFinal * IVA) : ivaNota
  const totFinal = subFinal + ivaFinal

  // ── Limpiar form al cerrar ─────────────────────────────────────
  function resetForm() {
    setTipo('credito'); setFecha(new Date().toISOString().split('T')[0])
    setMotivo(''); setRefFacturaId(''); setRefCompraId('')
    setItems([]); setModoManual(false)
    setSubtotalManual(''); setIvaManual('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totFinal <= 0) { setError('El total de la nota debe ser mayor a cero.'); return }
    setSaving(true); setError('')

    // Construir descripción de ítems para el motivo
    let motivoFinal = motivo
    if (!modoManual && itemsSeleccionados.length > 0) {
      const detalleItems = itemsSeleccionados.map(it =>
        `${it.cant_devolver} x ${it.descripcion} (${fmt(it.precio_unitario)})`)
        .join(', ')
      motivoFinal = `${motivo} | Ítems: ${detalleItems}`
    }

    const r = await fetch('/api/notas-credito-debito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        tipo,
        fecha,
        motivo: motivoFinal,
        ref_factura_id: refFacturaId || undefined,
        ref_compra_id:  refCompraId  || undefined,
        subtotal: subFinal,
        iva: ivaFinal,
        total: totFinal,
        estado: 'emitida',
      })
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error || 'Error al guardar'); return }
    setShowForm(false)
    resetForm()
    fetchNotas(empresaId, filtroTipo !== 'todos' ? filtroTipo : undefined)
  }

  const totalCredito = notas.filter(n => n.tipo === 'credito' && n.estado !== 'anulada').reduce((s, n) => s + n.total, 0)
  const totalDebito  = notas.filter(n => n.tipo === 'debito'  && n.estado !== 'anulada').reduce((s, n) => s + n.total, 0)

  const facturaSeleccionada = facturas.find(f => f.id === refFacturaId)
  const compraSeleccionada  = compras.find(c => c.id === refCompraId)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notas de Crédito y Débito</h1>
          <p className="text-sm text-gray-500 mt-1">LCT Art. 116 · Numeración correlativa DGI · Reversión automática de IVA</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Nueva Nota
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Notas de Crédito (devoluciones venta)</p>
          <p className="text-xl font-bold text-green-700">{fmt(totalCredito)}</p>
          <p className="text-xs text-gray-400 mt-1">{notas.filter(n => n.tipo === 'credito').length} documento(s)</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Notas de Débito (devoluciones compra)</p>
          <p className="text-xl font-bold text-red-700">{fmt(totalDebito)}</p>
          <p className="text-xs text-gray-400 mt-1">{notas.filter(n => n.tipo === 'debito').length} documento(s)</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['todos','credito','debito'].map(t => (
          <button key={t} onClick={() => { setFiltroTipo(t); fetchNotas(empresaId, t !== 'todos' ? t : undefined) }}
            className={`px-3 py-1 text-xs rounded-full border ${filtroTipo === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
            {t === 'todos' ? 'Todos' : t === 'credito' ? 'Notas de Crédito (NC)' : 'Notas de Débito (ND)'}
          </button>
        ))}
      </div>

      {/* ── MODAL ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Nueva Nota de Crédito / Débito</h2>
              <p className="text-xs text-gray-500 mt-0.5">Selecciona la factura y elige los ítems a devolver</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5">
                {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

                {/* Tipo */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tipo *</label>
                    <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={tipo}
                      onChange={e => {
                        const t = e.target.value as 'credito'|'debito'
                        setTipo(t)
                        setRefFacturaId(''); setRefCompraId(''); setItems([])
                      }}>
                      <option value="credito">Nota de Crédito (NC) — Devolución de venta</option>
                      <option value="debito">Nota de Débito (ND) — Devolución de compra</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Fecha *</label>
                    <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={fecha} onChange={e => setFecha(e.target.value)} />
                  </div>
                </div>

                {/* Documento origen — DROPDOWN ─────────────────── */}
                {tipo === 'credito' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Factura de Venta Origen
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    </label>
                    <div className="relative">
                      <select
                        className="w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 bg-white"
                        value={refFacturaId}
                        onChange={e => {
                          setRefFacturaId(e.target.value)
                          cargarItemsFactura(e.target.value)
                        }}>
                        <option value="">— Seleccionar factura —</option>
                        {facturas.map(f => (
                          <option key={f.id} value={f.id}>
                            {f.numero_factura} · {f.cliente_nombre} · {fmt(f.total)} · {f.fecha_emision}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {facturaSeleccionada && (
                      <div className="mt-1.5 text-xs text-gray-500 flex gap-4">
                        <span>Cliente: <strong>{facturaSeleccionada.cliente_nombre}</strong></span>
                        <span>Total original: <strong>{fmt(facturaSeleccionada.total)}</strong></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Compra Origen
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    </label>
                    <div className="relative">
                      <select
                        className="w-full border rounded-lg px-3 py-2 text-sm appearance-none pr-8 bg-white"
                        value={refCompraId}
                        onChange={e => {
                          setRefCompraId(e.target.value)
                          cargarItemsCompra(e.target.value)
                        }}>
                        <option value="">— Seleccionar compra —</option>
                        {compras.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.numero_compra} · {fmt(c.total)} · {c.fecha_compra}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {compraSeleccionada && (
                      <div className="mt-1.5 text-xs text-gray-500">
                        Total original: <strong>{fmt(compraSeleccionada.total)}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* ── SELECTOR DE ÍTEMS PARCIALES ──────────────── */}
                {loadingItems && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                    <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                    Cargando ítems del documento...
                  </div>
                )}

                {!loadingItems && items.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium">
                        Ítems a devolver
                        <span className="text-gray-400 font-normal ml-1">— selecciona los productos y ajusta la cantidad</span>
                      </label>
                      <div className="flex gap-2 text-xs">
                        <button type="button" className="text-blue-600 hover:underline"
                          onClick={() => setItems(prev => prev.map(it => ({ ...it, seleccionado: true, cant_devolver: it.cantidad })))}>
                          Seleccionar todo
                        </button>
                        <span className="text-gray-300">|</span>
                        <button type="button" className="text-gray-500 hover:underline"
                          onClick={() => setItems(prev => prev.map(it => ({ ...it, seleccionado: false, cant_devolver: 0 })))}>
                          Limpiar
                        </button>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-gray-500 border-b">
                        <div className="col-span-1"></div>
                        <div className="col-span-5">Producto / Descripción</div>
                        <div className="col-span-2 text-right">Cant. original</div>
                        <div className="col-span-2 text-center">Cant. a devolver</div>
                        <div className="col-span-2 text-right">Subtotal</div>
                      </div>

                      {items.map((it, idx) => {
                        const subLinea = (it.cant_devolver / it.cantidad) * (it.precio_unitario * it.cantidad)
                        return (
                          <div key={it.id}
                            className={`grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-b border-gray-100 last:border-0 transition-colors ${it.seleccionado ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                            <div className="col-span-1">
                              <button type="button"
                                onClick={() => toggleItem(idx)}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${it.seleccionado ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                {it.seleccionado && <Check className="w-3 h-3 text-white" />}
                              </button>
                            </div>
                            <div className="col-span-5">
                              <p className="text-sm font-medium text-gray-800 leading-tight">{it.descripcion}</p>
                              <p className="text-xs text-gray-400">{fmt(it.precio_unitario)} c/u</p>
                            </div>
                            <div className="col-span-2 text-right text-sm text-gray-500">
                              {it.cantidad}
                            </div>
                            <div className="col-span-2 flex justify-center">
                              <input
                                type="number"
                                min={0}
                                max={it.cantidad}
                                step={1}
                                value={it.cant_devolver}
                                onChange={e => updateCantDevolver(idx, parseFloat(e.target.value) || 0)}
                                className={`w-16 text-center border rounded-lg px-2 py-1 text-sm ${it.seleccionado ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                              />
                            </div>
                            <div className="col-span-2 text-right text-sm font-medium text-gray-700">
                              {it.seleccionado && it.cant_devolver > 0 ? fmt(subLinea) : '—'}
                            </div>
                          </div>
                        )
                      })}

                      {/* Totales de la nota */}
                      {itemsSeleccionados.length > 0 && (
                        <div className="bg-blue-50 border-t border-blue-200 px-3 py-3 space-y-1">
                          <div className="flex justify-between text-xs text-blue-700">
                            <span>Subtotal nota ({itemsSeleccionados.length} ítem{itemsSeleccionados.length !== 1 ? 's' : ''})</span>
                            <span>{fmt(subtotalNota)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-blue-700">
                            <span>IVA 15%</span>
                            <span>{fmt(ivaNota)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-blue-900 border-t border-blue-200 pt-1 mt-1">
                            <span>Total nota</span>
                            <span>{fmt(totalNota)}</span>
                          </div>
                        </div>
                      )}

                      {itemsSeleccionados.length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-gray-400">
                          <Package className="w-6 h-6 mx-auto mb-1 opacity-30" />
                          Selecciona al menos un ítem para continuar
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Modo manual (sin detalle en BD) */}
                {!loadingItems && modoManual && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-amber-700 font-medium">⚠️ No se encontraron ítems detallados para este documento. Ingresa el monto manualmente.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Subtotal (C$) *</label>
                        <input required type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                          value={subtotalManual}
                          onChange={e => {
                            const sub = parseFloat(e.target.value) || 0
                            setSubtotalManual(e.target.value)
                            setIvaManual((sub * IVA).toFixed(2))
                          }} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">IVA 15% (C$)</label>
                        <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                          value={ivaManual} onChange={e => setIvaManual(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Si no seleccionó documento, mostrar campos manuales */}
                {!refFacturaId && !refCompraId && !loadingItems && items.length === 0 && !modoManual && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Subtotal (C$) *</label>
                      <input required type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={subtotalManual}
                        onChange={e => {
                          const sub = parseFloat(e.target.value) || 0
                          setSubtotalManual(e.target.value)
                          setIvaManual((sub * IVA).toFixed(2))
                        }} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">IVA 15% (C$)</label>
                      <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={ivaManual} onChange={e => setIvaManual(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Motivo */}
                <div>
                  <label className="block text-sm font-medium mb-1">Motivo *</label>
                  <input required className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Razón de la devolución..."
                    value={motivo} onChange={e => setMotivo(e.target.value)} />
                </div>

                {/* Resumen total */}
                {totFinal > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Subtotal</span><span>{fmt(subFinal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>IVA 15%</span><span>{fmt(ivaFinal)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
                      <span>Total de la nota</span>
                      <span className={tipo === 'credito' ? 'text-green-700' : 'text-red-700'}>{fmt(totFinal)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                  className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button type="submit" disabled={saving || totFinal <= 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Emitir Nota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TABLA ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : notas.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileX size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay notas emitidas</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['N° Nota','Tipo','Fecha','Motivo','Documento Origen','Subtotal','IVA','Total','Estado'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {notas.map(n => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-mono text-xs font-bold">{n.numero_nota}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${n.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {n.tipo === 'credito' ? 'N/C' : 'N/D'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">{n.fecha}</td>
                  <td className="px-3 py-3 text-xs max-w-xs truncate">{n.motivo}</td>
                  <td className="px-3 py-3 text-xs">
                    {n.factura ? `F: ${n.factura.numero_factura}` : n.compra ? `C: ${n.compra.numero_compra}` : '—'}
                    {n.cliente && <span className="block text-gray-400">{n.cliente.nombre}</span>}
                    {n.proveedor && <span className="block text-gray-400">{n.proveedor.nombre}</span>}
                  </td>
                  <td className="px-3 py-3">{fmt(n.subtotal)}</td>
                  <td className="px-3 py-3">{fmt(n.iva)}</td>
                  <td className="px-3 py-3 font-bold">{fmt(n.total)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      n.estado === 'aplicada' ? 'bg-green-100 text-green-700' :
                      n.estado === 'anulada'  ? 'bg-red-100 text-red-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>{n.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
