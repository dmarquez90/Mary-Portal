'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, nombreMes } from '@/lib/utils'
import { Building2, Download, Eye, Loader2, PiggyBank, TrendingDown, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'

/* ─── Tipos ────────────────────────────────────────────── */
interface CuentaCaja  { id: string; nombre: string; tipo: string; moneda: string; saldo_actual: number; saldo_inicial: number }
interface CuentaBanco { id: string; nombre: string; banco?: string; numero_cuenta?: string; tipo: string; moneda: string; saldo_actual: number }
interface MovCaja     { id: string; tipo: 'ingreso'|'egreso'; monto: number; descripcion: string; fecha: string; cuenta_caja?: { nombre: string; tipo: string } }
interface TxBanco     { id: string; tipo: string; monto: number; descripcion: string; fecha: string; referencia?: string; cuenta_banco?: { nombre: string; banco?: string } }

interface DatosCajaBancos {
  empresa: { nombre: string; ruc: string }
  mes: number; anio: number
  cuentasCaja: CuentaCaja[]
  cuentasBanco: CuentaBanco[]
  movimientosCaja: MovCaja[]
  transaccionesBanco: TxBanco[]
}

/* ─── Estilos Excel ─────────────────────────────────────── */
const THIN = { style: 'thin', color: { rgb: 'CBD5E0' } }
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const S_HDR   = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: '1B3A5C' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER }
const S_EVEN  = { font: { sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: 'EBF5FB' } }, alignment: { vertical: 'center' }, border: BORDER }
const S_ODD   = { font: { sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } }, alignment: { vertical: 'center' }, border: BORDER }
const S_TOT   = { font: { bold: true, sz: 9, name: 'Calibri' }, fill: { patternType: 'solid', fgColor: { rgb: 'D4E6F1' } }, alignment: { horizontal: 'right' }, border: BORDER }
const S_TITL  = { font: { bold: true, sz: 13, name: 'Calibri', color: { rgb: '1B3A5C' } }, alignment: { horizontal: 'center', vertical: 'center' } }
const S_SUB   = { font: { sz: 10, name: 'Calibri', color: { rgb: '555555' } }, alignment: { horizontal: 'center' } }
const S_GRN   = { font: { bold: true, sz: 9, name: 'Calibri', color: { rgb: '166534' } }, fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } }, alignment: { horizontal: 'right' }, border: BORDER }
const S_RED   = { font: { bold: true, sz: 9, name: 'Calibri', color: { rgb: '991B1B' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FEF2F2' } }, alignment: { horizontal: 'right' }, border: BORDER }

function applyStyles(ws: Record<string, unknown>, hdrRow: number, dataStart: number, lastRow: number, numCols: number) {
  for (let R = 0; R <= lastRow; R++) {
    for (let C = 0; C < numCols; C++) {
      const addr = `${String.fromCharCode(65 + C)}${R + 1}`
      const cell = (ws as Record<string, Record<string, unknown>>)[addr]
      if (!cell || typeof cell !== 'object') continue
      if (R < dataStart - 1) cell.s = R === 0 ? S_TITL : S_SUB
      else if (R === hdrRow) cell.s = S_HDR
      else if (R === lastRow) cell.s = S_TOT
      else cell.s = (R - dataStart) % 2 === 0 ? S_EVEN : S_ODD
    }
  }
  void numCols
}

/* ─── Preview content ───────────────────────────────────── */
function PreviewCajaBancos({ datos }: { datos: DatosCajaBancos }) {
  const totalCaja  = datos.cuentasCaja.reduce((s, c) => s + c.saldo_actual, 0)
  const totalBanco = datos.cuentasBanco.reduce((s, c) => s + c.saldo_actual, 0)
  const ingCaja    = datos.movimientosCaja.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const egCaja     = datos.movimientosCaja.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
  const _ingBanco  = datos.transaccionesBanco.length  // unused in preview, kept for future
  const movsTodos  = [
    ...datos.movimientosCaja.map(m => ({ fecha: m.fecha, desc: m.descripcion, cuenta: m.cuenta_caja?.nombre ?? 'Caja', tipo: m.tipo, monto: m.monto, origen: 'Caja' as const })),
    ...datos.transaccionesBanco.map(t => ({ fecha: t.fecha, desc: t.descripcion, cuenta: t.cuenta_banco?.nombre ?? 'Banco', tipo: 'banco' as const, monto: t.monto, origen: 'Banco' as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <div className="space-y-5">
      {/* Resumen cuentas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Caja', valor: totalCaja, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Total Bancos', valor: totalBanco, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: `Ingresos ${nombreMes(datos.mes)}`, valor: ingCaja, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: `Egresos ${nombreMes(datos.mes)}`, valor: egCaja, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(({ label, valor, color, bg }) => (
          <div key={label} className={`${bg} rounded-lg p-3`}>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`font-bold text-sm ${color}`}>{formatCurrency(valor)}</p>
          </div>
        ))}
      </div>

      {/* Cuentas Caja */}
      {datos.cuentasCaja.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-700 text-sm mb-2">Cuentas de Caja</h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-green-800 text-white">
                {['Nombre','Tipo','Moneda','Saldo Inicial','Saldo Actual'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {datos.cuentasCaja.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-green-50' : 'bg-white'}>
                    <td className="px-3 py-1.5 font-medium">{c.nombre}</td>
                    <td className="px-3 py-1.5 capitalize">{c.tipo.replace('_', ' ')}</td>
                    <td className="px-3 py-1.5">{c.moneda}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(c.saldo_inicial)}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatCurrency(c.saldo_actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cuentas Banco */}
      {datos.cuentasBanco.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-700 text-sm mb-2">Cuentas Bancarias</h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-blue-800 text-white">
                {['Nombre','Banco','N° Cuenta','Tipo','Moneda','Saldo Actual'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {datos.cuentasBanco.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                    <td className="px-3 py-1.5 font-medium">{c.nombre}</td>
                    <td className="px-3 py-1.5">{c.banco ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono">{c.numero_cuenta ?? '—'}</td>
                    <td className="px-3 py-1.5 capitalize">{c.tipo}</td>
                    <td className="px-3 py-1.5">{c.moneda}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-blue-700">{formatCurrency(c.saldo_actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Movimientos del período */}
      <div>
        <h4 className="font-semibold text-slate-700 text-sm mb-2">
          Movimientos del período ({movsTodos.length})
        </h4>
        {movsTodos.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Sin movimientos en este período</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-700 text-white">
                {['Fecha','Cuenta','Origen','Descripción','Tipo','Monto'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {movsTodos.map((m, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="px-3 py-1.5">{m.fecha}</td>
                    <td className="px-3 py-1.5">{m.cuenta}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.origen === 'Caja' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {m.origen}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 max-w-[180px] truncate">{m.desc}</td>
                    <td className="px-3 py-1.5 capitalize">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${m.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'egreso' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium ${m.tipo === 'ingreso' ? 'text-green-700' : m.tipo === 'egreso' ? 'text-red-700' : 'text-slate-700'}`}>
                      {formatCurrency(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Página Caja y Bancos ──────────────────────────────── */
export default function CajaBancosPage() {
  const [empresaId, setEmpresaId] = useState('')
  const [mesSeleccionado,  setMesSeleccionado]  = useState(new Date().getMonth() + 1)
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear())

  const [cuentasCaja,  setCuentasCaja]  = useState<CuentaCaja[]>([])
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBanco[]>([])
  const [movCaja,  setMovCaja]  = useState<MovCaja[]>([])
  const [txBanco,  setTxBanco]  = useState<TxBanco[]>([])
  const [loading,  setLoading]  = useState(true)
  const [preview,  setPreview]  = useState(false)
  const [loadingPreview,  setLoadingPreview]  = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [datosFull,   setDatosFull]   = useState<DatosCajaBancos | null>(null)
  const [tab, setTab] = useState<'todos'|'caja'|'banco'>('todos')

  const anios = [new Date().getFullYear(), new Date().getFullYear() - 1]

  // Cargar empresa ID
  useEffect(() => {
    async function loadEmpresa() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const ids = [en?.id, ej?.id].filter(Boolean) as string[]
      if (ids.length) setEmpresaId(ids[0])
    }
    loadEmpresa()
  }, [])

  // Cargar datos cuando cambia empresa o período
  useEffect(() => {
    if (!empresaId) return
    async function loadData() {
      setLoading(true)
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const firstDay = `${anioSeleccionado}-${String(mesSeleccionado).padStart(2, '0')}-01`
        const lastDay  = new Date(anioSeleccionado, mesSeleccionado, 0).toISOString().split('T')[0]

        const [
          { data: cc }, { data: cb },
          { data: mc }, { data: tb },
        ] = await Promise.all([
          supabase.from('cuentas_caja').select('*').eq('empresa_id', empresaId).eq('activa', true).order('created_at'),
          supabase.from('cuentas_banco').select('*').eq('empresa_id', empresaId).eq('activa', true).order('created_at'),
          supabase.from('movimientos_caja').select('*, cuenta_caja:cuentas_caja(nombre,tipo)').eq('empresa_id', empresaId).eq('estado', 'registrado').gte('fecha', firstDay).lte('fecha', lastDay).order('fecha', { ascending: false }),
          supabase.from('transacciones_banco').select('*, cuenta_banco:cuentas_banco(nombre,banco)').eq('empresa_id', empresaId).eq('estado', 'registrado').gte('fecha', firstDay).lte('fecha', lastDay).order('fecha', { ascending: false }),
        ])

        setCuentasCaja(cc ?? [])
        setCuentasBanco(cb ?? [])
        setMovCaja(mc ?? [])
        setTxBanco(tb ?? [])
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [empresaId, mesSeleccionado, anioSeleccionado])

  async function obtenerDatosFull(): Promise<DatosCajaBancos> {
    const res = await fetch(`/api/reportes/caja-bancos?mes=${mesSeleccionado}&anio=${anioSeleccionado}`)
    if (!res.ok) throw new Error('Error al obtener datos')
    return res.json()
  }

  async function handlePreview() {
    setLoadingPreview(true)
    try {
      const datos = await obtenerDatosFull()
      setDatosFull(datos)
      setPreview(true)
    } catch {
      toast.error('Error al cargar la previsualización')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function descargarExcel() {
    setDescargando(true)
    try {
      const datos = datosFull ?? await obtenerDatosFull()
      const XLSX = await import('xlsx-js-style' as string) as typeof import('xlsx')
      const wb = XLSX.utils.book_new()
      const mes = nombreMes(datos.mes)
      const empresa = datos.empresa.nombre

      // ── Hoja 1: Resumen ──
      const titleR  = [`Resumen Caja y Bancos — ${empresa}`, '', '', '', '']
      const subR    = [`Período: ${mes} ${datos.anio}`, '', '', '', '']
      const hdrSuma = ['Tipo', 'Nombre', 'Banco / Tipo', 'Moneda', 'Saldo Actual']
      const rowsCaja  = datos.cuentasCaja.map(c  => ['Caja',  c.nombre, c.tipo.replace('_',' '), c.moneda, c.saldo_actual])
      const rowsBanco = datos.cuentasBanco.map(c => ['Banco', c.nombre, c.banco ?? c.tipo, c.moneda, c.saldo_actual])
      const totalRow  = ['', '', '', 'TOTAL', datos.cuentasCaja.reduce((s,c)=>s+c.saldo_actual,0) + datos.cuentasBanco.reduce((s,c)=>s+c.saldo_actual,0)]
      const wsSum = XLSX.utils.aoa_to_sheet([titleR, subR, hdrSuma, ...rowsCaja, ...rowsBanco, totalRow])
      wsSum['!cols'] = [{wch:10},{wch:28},{wch:22},{wch:10},{wch:16}]
      wsSum['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}]
      applyStyles(wsSum as Record<string, unknown>, 2, 3, rowsCaja.length + rowsBanco.length + 3, 5)
      XLSX.utils.book_append_sheet(wb, wsSum, 'Resumen')

      // ── Hoja 2: Movimientos Caja ──
      const movs = datos.movimientosCaja
      const titleM = [`Movimientos de Caja — ${empresa}`, '', '', '', '', '']
      const subM   = [`Período: ${mes} ${datos.anio}`, '', '', '', '', '']
      const hdrM   = ['Fecha', 'Cuenta', 'Tipo', 'Descripción', 'Ingreso', 'Egreso']
      const rowsM  = movs.map(m => [
        m.fecha, m.cuenta_caja?.nombre ?? 'Caja', m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
        m.descripcion, m.tipo === 'ingreso' ? m.monto : 0, m.tipo === 'egreso' ? m.monto : 0,
      ])
      const totM = ['', '', '', 'TOTAL', movs.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0), movs.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+m.monto,0)]
      const wsMov = XLSX.utils.aoa_to_sheet([titleM, subM, hdrM, ...rowsM, totM])
      wsMov['!cols'] = [{wch:12},{wch:22},{wch:12},{wch:36},{wch:16},{wch:16}]
      wsMov['!merges'] = [{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:1,c:0},e:{r:1,c:5}}]
      // Apply color to ingreso/egreso cells
      const refM = XLSX.utils.decode_range(wsMov['!ref'] as string)
      for (let R = refM.s.r; R <= refM.e.r; R++) {
        for (let C = refM.s.c; C <= refM.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C })
          const cell = (wsMov as Record<string, Record<string, unknown>>)[addr]
          if (!cell) continue
          if (R === 0) cell.s = S_TITL
          else if (R === 1) cell.s = S_SUB
          else if (R === 2) cell.s = S_HDR
          else if (R === refM.e.r) cell.s = S_TOT
          else if (C === 4) cell.s = S_GRN
          else if (C === 5) cell.s = S_RED
          else cell.s = (R % 2 === 0) ? S_EVEN : S_ODD
        }
      }
      XLSX.utils.book_append_sheet(wb, wsMov, 'Movimientos Caja')

      // ── Hoja 3: Transacciones Banco ──
      const txs = datos.transaccionesBanco
      const titleT = [`Transacciones Bancarias — ${empresa}`, '', '', '', '', '', '']
      const subT   = [`Período: ${mes} ${datos.anio}`, '', '', '', '', '', '']
      const hdrT   = ['Fecha', 'Cuenta', 'Banco', 'Tipo', 'Descripción', 'Referencia', 'Monto']
      const rowsT  = txs.map(t => [t.fecha, t.cuenta_banco?.nombre ?? '', t.cuenta_banco?.banco ?? '', t.tipo, t.descripcion, t.referencia ?? '', t.monto])
      const totT   = ['', '', '', '', 'TOTAL', '', txs.reduce((s,t)=>s+t.monto,0)]
      const wsTx = XLSX.utils.aoa_to_sheet([titleT, subT, hdrT, ...rowsT, totT])
      wsTx['!cols'] = [{wch:12},{wch:22},{wch:18},{wch:16},{wch:36},{wch:18},{wch:16}]
      wsTx['!merges'] = [{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}}]
      applyStyles(wsTx as Record<string, unknown>, 2, 3, rowsT.length + 3, 7)
      XLSX.utils.book_append_sheet(wb, wsTx, 'Transacciones Banco')

      XLSX.writeFile(wb, `SARA_CajaBancos_${mes}_${datos.anio}.xlsx`)
      toast.success('Reporte Caja y Bancos descargado')
    } catch (err) {
      console.error(err)
      toast.error('Error al generar el Excel')
    } finally {
      setDescargando(false)
    }
  }

  /* Totales para las tarjetas */
  const totalCajaNIO  = cuentasCaja.filter(c => c.moneda === 'NIO').reduce((s, c) => s + c.saldo_actual, 0)
  const totalCajaUSD  = cuentasCaja.filter(c => c.moneda === 'USD').reduce((s, c) => s + c.saldo_actual, 0)
  const totalBancoNIO = cuentasBanco.filter(c => c.moneda === 'NIO').reduce((s, c) => s + c.saldo_actual, 0)
  const totalBancoUSD = cuentasBanco.filter(c => c.moneda === 'USD').reduce((s, c) => s + c.saldo_actual, 0)
  const ingMes = movCaja.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const egMes  = movCaja.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)

  /* Lista de movimientos según tab */
  const movsTodos = [
    ...movCaja.map(m => ({ fecha: m.fecha, cuenta: m.cuenta_caja?.nombre ?? 'Caja', tipo: m.tipo, desc: m.descripcion, monto: m.monto, origen: 'Caja' as const })),
    ...txBanco.map(t => ({ fecha: t.fecha, cuenta: t.cuenta_banco?.nombre ?? 'Banco', tipo: 'banco' as const, desc: t.descripcion, monto: t.monto, origen: 'Banco' as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  const movsFiltrados = tab === 'caja' ? movsTodos.filter(m => m.origen === 'Caja') : tab === 'banco' ? movsTodos.filter(m => m.origen === 'Banco') : movsTodos

  if (!empresaId) return (
    <div className="p-8 flex items-center justify-center">
      <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      {/* Modal Preview */}
      {preview && datosFull && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-display font-bold text-slate-900">Resumen Caja y Bancos</h2>
                <p className="text-xs text-slate-500 mt-0.5">{datosFull.empresa.nombre} · {nombreMes(mesSeleccionado)} {anioSeleccionado}</p>
              </div>
              <button onClick={() => setPreview(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <PreviewCajaBancos datos={datosFull} />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setPreview(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Cerrar
              </button>
              <button
                onClick={() => { setPreview(false); descargarExcel() }}
                disabled={descargando}
                className="px-4 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Caja y Bancos</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de efectivo y cuentas bancarias</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            disabled={loadingPreview || loading}
            className="border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </button>
          <button
            onClick={descargarExcel}
            disabled={descargando || loading}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar Excel
          </button>
          <Link href="/dashboard/caja-bancos/nueva-transaccion" className="bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors">
            + Nueva Transacción
          </Link>
        </div>
      </div>

      {/* Selector período */}
      <div className="card mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <label className="label">Mes</label>
          <select className="input w-40" value={mesSeleccionado} onChange={e => setMesSeleccionado(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Año</label>
          <select className="input w-28" value={anioSeleccionado} onChange={e => setAnioSeleccionado(Number(e.target.value))}>
            {anios.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="pt-5 text-slate-500 text-sm">
          Período: <strong>{nombreMes(mesSeleccionado)} {anioSeleccionado}</strong>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <PiggyBank className="w-5 h-5 text-green-700" />
            </div>
            <div className="text-xs text-slate-500 uppercase font-medium">Saldo Caja</div>
          </div>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalCajaNIO)}</p>
          {totalCajaUSD > 0 && <p className="text-xs text-slate-500 mt-1">${totalCajaUSD.toFixed(2)} USD</p>}
          <p className="text-xs text-slate-400 mt-1">{cuentasCaja.length} cuenta{cuentasCaja.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-700" />
            </div>
            <div className="text-xs text-slate-500 uppercase font-medium">Saldo Banco</div>
          </div>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(totalBancoNIO)}</p>
          {totalBancoUSD > 0 && <p className="text-xs text-slate-500 mt-1">${totalBancoUSD.toFixed(2)} USD</p>}
          <p className="text-xs text-slate-400 mt-1">{cuentasBanco.length} cuenta{cuentasBanco.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="text-xs text-slate-500 uppercase font-medium">Ingresos {nombreMes(mesSeleccionado)}</div>
          </div>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(ingMes)}</p>
          <p className="text-xs text-slate-400 mt-1">{movCaja.filter(m => m.tipo === 'ingreso').length} movimiento{movCaja.filter(m=>m.tipo==='ingreso').length!==1?'s':''}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-700" />
            </div>
            <div className="text-xs text-slate-500 uppercase font-medium">Egresos {nombreMes(mesSeleccionado)}</div>
          </div>
          <p className="text-xl font-bold text-red-700">{formatCurrency(egMes)}</p>
          <p className="text-xs text-slate-400 mt-1">{movCaja.filter(m => m.tipo === 'egreso').length} movimiento{movCaja.filter(m=>m.tipo==='egreso').length!==1?'s':''}</p>
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div className="card p-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-4 pt-4">
          {[
            { key: 'todos',  label: `Todos (${movsTodos.length})` },
            { key: 'caja',   label: `Caja (${movCaja.length})` },
            { key: 'banco',  label: `Banco (${txBanco.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : movsFiltrados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg mb-1">Sin movimientos</p>
            <p className="text-sm">No hay registros en {nombreMes(mesSeleccionado)} {anioSeleccionado}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Cuenta</th>
                  <th className="table-header">Origen</th>
                  <th className="table-header">Descripción</th>
                  <th className="table-header">Tipo</th>
                  <th className="table-header text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50 border-b border-slate-50">
                    <td className="table-cell text-slate-500">{m.fecha}</td>
                    <td className="table-cell font-medium">{m.cuenta}</td>
                    <td className="table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.origen === 'Caja' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {m.origen}
                      </span>
                    </td>
                    <td className="table-cell text-slate-600 max-w-[220px] truncate">{m.desc}</td>
                    <td className="table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.tipo === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'egreso' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td className={`table-cell text-right font-semibold ${m.tipo === 'ingreso' ? 'text-emerald-700' : m.tipo === 'egreso' ? 'text-red-700' : 'text-slate-700'}`}>
                      {formatCurrency(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
