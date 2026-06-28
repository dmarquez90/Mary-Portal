'use client'

import { useState, useEffect } from 'react'
import { Printer, BarChart3, Truck, ChevronDown } from 'lucide-react'

interface Proveedor { id: string; nombre: string; ruc?: string; telefono?: string }
interface Saldo {
  compra_id: string; numero_compra: string; fecha_compra: string
  fecha_vencimiento?: string; monto_original: number; total_abonado: number
  saldo_pendiente: number; estado_pago: string; dias_vencido: number
}
interface Abono {
  compra_id: string; fecha: string; monto: number; forma_pago: string; referencia?: string
}
interface FilaAging {
  proveedor_id: string; nombre: string; ruc: string; telefono: string
  rango_0_30: number; rango_31_60: number; rango_61_90: number; rango_mas_90: number; total: number
}
interface Empresa { nombre: string; ruc: string; direccion: string; correo: string; telefono?: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)
const fmtFecha = (f: string) =>
  new Date(f + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' })

function imprimirEstadoCuentaProveedor(empresa: Empresa, proveedor: Proveedor, saldos: Saldo[], abonos: Abono[], fechaReporte: string) {
  const totalPendiente = saldos.filter(s => s.estado_pago !== 'pagada').reduce((a, s) => a + s.saldo_pendiente, 0)
  const totalOriginal  = saldos.reduce((a, s) => a + s.monto_original, 0)
  const totalAbonado   = saldos.reduce((a, s) => a + s.total_abonado, 0)

  const filasSaldos = saldos.map((s, i) => `
    <tr style="background:${i%2===0?'#f8fafc':'#fff'}">
      <td style="padding:7px 10px;font-size:12px;font-family:monospace">${s.numero_compra}</td>
      <td style="padding:7px 10px;font-size:12px">${fmtFecha(s.fecha_compra)}</td>
      <td style="padding:7px 10px;font-size:12px">${s.fecha_vencimiento ? fmtFecha(s.fecha_vencimiento) : '—'}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right">${fmt(s.monto_original)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#16a34a">${fmt(s.total_abonado)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700;color:${s.estado_pago==='vencida'?'#dc2626':'#ea580c'}">${fmt(s.saldo_pendiente)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:center">
        <span style="padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;background:${s.estado_pago==='pagada'?'#dcfce7':s.estado_pago==='vencida'?'#fee2e2':'#fff7ed'};color:${s.estado_pago==='pagada'?'#15803d':s.estado_pago==='vencida'?'#dc2626':'#c2410c'}">${s.estado_pago}</span>
        ${s.dias_vencido > 0 ? `<span style="font-size:10px;color:#dc2626;margin-left:4px">+${s.dias_vencido}d</span>` : ''}
      </td>
    </tr>`).join('')

  const filasAbonos = abonos.map((a, i) => `
    <tr style="background:${i%2===0?'#fff7ed':'#fff'}">
      <td style="padding:6px 10px;font-size:11px">${fmtFecha(a.fecha)}</td>
      <td style="padding:6px 10px;font-size:11px;font-family:monospace">${saldos.find(s=>s.compra_id===a.compra_id)?.numero_compra??'—'}</td>
      <td style="padding:6px 10px;font-size:11px">${a.forma_pago.charAt(0).toUpperCase()+a.forma_pago.slice(1)}</td>
      <td style="padding:6px 10px;font-size:11px">${a.referencia??'—'}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:600;color:#16a34a">${fmt(a.monto)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Estado de Cuenta Proveedor — ${proveedor.nombre}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:28px;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
    .emp-nombre{font-size:20px;font-weight:800;color:#7c2d12;margin-bottom:3px}
    .emp-info{font-size:11px;color:#64748b;line-height:1.6}
    .titulo{font-size:22px;font-weight:800;color:#ea580c;text-align:right}
    .sub{font-size:11px;color:#64748b;text-align:right;line-height:1.7;margin-top:3px}
    hr{border:none;border-top:2.5px solid #ea580c;margin:16px 0}
    .prov-box{background:#fff7ed;border-left:4px solid #ea580c;padding:12px 16px;margin-bottom:16px;border-radius:4px}
    .prov-nombre{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:2px}
    .prov-meta{font-size:11px;color:#64748b;line-height:1.6}
    .kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
    .kpi-label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .kpi-val{font-size:18px;font-weight:800}
    h3{font-size:13px;font-weight:700;color:#1e293b;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#7c2d12}
    thead th{padding:8px 10px;font-size:11px;font-weight:600;color:#fff;text-align:left}
    thead th:nth-child(4),thead th:nth-child(5),thead th:nth-child(6){text-align:right}
    thead th:nth-child(7){text-align:center}
    tfoot td{padding:8px 10px;font-size:12px;font-weight:700;background:#fed7aa;color:#7c2d12;text-align:right}
    tfoot td:first-child{text-align:left}
    .pie{margin-top:24px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
    @page{size:A4;margin:1.5cm}
  </style></head><body>
  <div class="header">
    <div>
      <div class="emp-nombre">${empresa.nombre}</div>
      <div class="emp-info">RUC: ${empresa.ruc}<br/>${empresa.direccion}<br/>${empresa.correo}</div>
    </div>
    <div>
      <div class="titulo">ESTADO DE CUENTA PROVEEDOR</div>
      <div class="sub">Cuentas por Pagar<br/>Fecha: ${fmtFecha(fechaReporte)}</div>
    </div>
  </div>
  <hr/>
  <div class="prov-box">
    <div class="prov-nombre">${proveedor.nombre}</div>
    <div class="prov-meta">${proveedor.ruc?'RUC: '+proveedor.ruc+'&nbsp;&nbsp;':''}${proveedor.telefono?'Tel: '+proveedor.telefono:''}</div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Total Comprado</div><div class="kpi-val" style="color:#1e293b">${fmt(totalOriginal)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Pagado</div><div class="kpi-val" style="color:#16a34a">${fmt(totalAbonado)}</div></div>
    <div class="kpi"><div class="kpi-label">Saldo a Pagar</div><div class="kpi-val" style="color:#ea580c">${fmt(totalPendiente)}</div></div>
  </div>
  <h3>Compras a Crédito</h3>
  <table>
    <thead><tr><th>N° Compra</th><th>Fecha</th><th>Vencimiento</th><th>Total</th><th>Pagado</th><th>Saldo</th><th style="text-align:center">Estado</th></tr></thead>
    <tbody>${filasSaldos}</tbody>
    <tfoot><tr><td colspan="3">TOTALES</td><td>${fmt(totalOriginal)}</td><td>${fmt(totalAbonado)}</td><td>${fmt(totalPendiente)}</td><td></td></tr></tfoot>
  </table>
  ${abonos.length > 0 ? `
  <h3>Historial de Pagos</h3>
  <table>
    <thead><tr><th>Fecha</th><th>Compra</th><th>Forma Pago</th><th>Referencia</th><th style="text-align:right">Monto</th></tr></thead>
    <tbody>${filasAbonos}</tbody>
    <tfoot><tr><td colspan="4">TOTAL PAGADO</td><td>${fmt(abonos.reduce((a,b)=>a+b.monto,0))}</td></tr></tfoot>
  </table>` : ''}
  <div class="pie">SARA — Sistema Automatizado de Registro Administrativo · ${fmtFecha(fechaReporte)}</div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=1000,height=750')
  if (w) { w.document.write(html); w.document.close() }
}

function imprimirAgingCxP(empresa: Empresa, filas: FilaAging[], fechaReporte: string) {
  const tot0=filas.reduce((a,f)=>a+f.rango_0_30,0), tot31=filas.reduce((a,f)=>a+f.rango_31_60,0)
  const tot61=filas.reduce((a,f)=>a+f.rango_61_90,0), tot90=filas.reduce((a,f)=>a+f.rango_mas_90,0), totT=filas.reduce((a,f)=>a+f.total,0)

  const filasTbl = filas.map((f,i) => `
    <tr style="background:${i%2===0?'#f8fafc':'#fff'}">
      <td style="padding:7px 10px;font-size:12px;font-weight:600">${f.nombre}</td>
      <td style="padding:7px 10px;font-size:11px;color:#64748b">${f.ruc}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#16a34a">${fmt(f.rango_0_30)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#ca8a04">${fmt(f.rango_31_60)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#ea580c">${fmt(f.rango_61_90)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#dc2626;font-weight:700">${fmt(f.rango_mas_90)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:800;color:#7c2d12">${fmt(f.total)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Aging CxP</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:28px}
    .header{display:flex;justify-content:space-between;margin-bottom:20px}
    .emp-nombre{font-size:20px;font-weight:800;color:#7c2d12;margin-bottom:3px}.emp-info{font-size:11px;color:#64748b;line-height:1.6}
    .titulo{font-size:22px;font-weight:800;color:#ea580c;text-align:right}.sub{font-size:11px;color:#64748b;text-align:right;line-height:1.7;margin-top:3px}
    hr{border:none;border-top:2.5px solid #ea580c;margin:16px 0}
    .resumen{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
    .rcard{border-radius:8px;padding:12px;text-align:center;border:1px solid #e2e8f0}.rcard-label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}.rcard-val{font-size:16px;font-weight:800}
    table{width:100%;border-collapse:collapse}thead tr{background:#7c2d12}thead th{padding:8px 10px;font-size:11px;font-weight:600;color:#fff;text-align:right}thead th:first-child,thead th:nth-child(2){text-align:left}
    tfoot td{padding:8px 10px;font-size:12px;font-weight:700;background:#7c2d12;color:#fff;text-align:right}tfoot td:first-child{text-align:left}
    .pie{margin-top:24px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
    @page{size:A4 landscape;margin:1.5cm}
  </style></head><body>
  <div class="header">
    <div><div class="emp-nombre">${empresa.nombre}</div><div class="emp-info">RUC: ${empresa.ruc}<br/>${empresa.direccion}</div></div>
    <div><div class="titulo">ANTIGÜEDAD DE SALDOS (CxP)</div><div class="sub">Cuentas por Pagar · ${filas.length} proveedor(es)<br/>Fecha: ${fmtFecha(fechaReporte)}</div></div>
  </div><hr/>
  <div class="resumen">
    <div class="rcard" style="background:#f0fdf4"><div class="rcard-label" style="color:#166534">0–30 días</div><div class="rcard-val" style="color:#16a34a">${fmt(tot0)}</div></div>
    <div class="rcard" style="background:#fefce8"><div class="rcard-label" style="color:#854d0e">31–60 días</div><div class="rcard-val" style="color:#ca8a04">${fmt(tot31)}</div></div>
    <div class="rcard" style="background:#fff7ed"><div class="rcard-label" style="color:#9a3412">61–90 días</div><div class="rcard-val" style="color:#ea580c">${fmt(tot61)}</div></div>
    <div class="rcard" style="background:#fef2f2"><div class="rcard-label" style="color:#991b1b">+90 días</div><div class="rcard-val" style="color:#dc2626">${fmt(tot90)}</div></div>
    <div class="rcard" style="background:#fff7ed"><div class="rcard-label" style="color:#7c2d12">TOTAL</div><div class="rcard-val" style="color:#ea580c">${fmt(totT)}</div></div>
  </div>
  <table>
    <thead><tr><th style="text-align:left">Proveedor</th><th style="text-align:left">RUC</th><th>0–30 días</th><th>31–60 días</th><th>61–90 días</th><th>+90 días</th><th>TOTAL</th></tr></thead>
    <tbody>${filasTbl}</tbody>
    <tfoot><tr><td>TOTALES</td><td></td><td>${fmt(tot0)}</td><td>${fmt(tot31)}</td><td>${fmt(tot61)}</td><td>${fmt(tot90)}</td><td>${fmt(totT)}</td></tr></tfoot>
  </table>
  <div class="pie">SARA — Sistema Administrativo · ${fmtFecha(fechaReporte)}</div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=1200,height=750')
  if (w) { w.document.write(html); w.document.close() }
}

export default function CxPReportesPage() {
  const [empresaId,      setEmpresaId]      = useState('')
  const [proveedores,    setProveedores]    = useState<Proveedor[]>([])
  const [proveedorId,    setProveedorId]    = useState('')
  const [loadingEstado,  setLoadingEstado]  = useState(false)
  const [loadingAging,   setLoadingAging]   = useState(false)

  useEffect(() => {
    async function init() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: nat }, { data: jur }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const eid = nat?.id ?? jur?.id ?? ''
      setEmpresaId(eid)
      if (eid) {
        const { data: pv } = await supabase.from('proveedores').select('id, nombre, ruc, telefono').eq('empresa_id', eid).eq('activo', true).order('nombre')
        setProveedores(pv ?? [])
      }
    }
    init()
  }, [])

  async function handleEstadoCuenta() {
    if (!proveedorId) return
    setLoadingEstado(true)
    const r = await fetch(`/api/cxp/reportes?empresa_id=${empresaId}&tipo=estado_cuenta&proveedor_id=${proveedorId}`)
    const d = await r.json()
    setLoadingEstado(false)
    if (r.ok) imprimirEstadoCuentaProveedor(d.empresa, d.proveedor, d.saldos, d.abonos, d.fecha_reporte)
    else alert('Error: ' + d.error)
  }

  async function handleAging() {
    setLoadingAging(true)
    const r = await fetch(`/api/cxp/reportes?empresa_id=${empresaId}&tipo=aging`)
    const d = await r.json()
    setLoadingAging(false)
    if (r.ok) imprimirAgingCxP(d.empresa, d.filas, d.fecha_reporte)
    else alert('Error: ' + d.error)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes CxP</h1>
        <p className="text-sm text-gray-500 mt-1">Documentos imprimibles de Cuentas por Pagar</p>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-100 rounded-xl"><Truck className="text-orange-700" size={20} /></div>
          <div>
            <h2 className="font-bold text-gray-900">Estado de Cuenta por Proveedor</h2>
            <p className="text-sm text-gray-500">Todas las compras a crédito, pagos realizados y saldo pendiente con un proveedor.</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Proveedor</label>
          <div className="relative">
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-orange-300 outline-none pr-8"
              value={proveedorId}
              onChange={e => setProveedorId(e.target.value)}
            >
              <option value="">— Seleccionar proveedor —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.ruc ? ` (${p.ruc})` : ''}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" size={16} />
          </div>
        </div>
        <button
          onClick={handleEstadoCuenta}
          disabled={!proveedorId || loadingEstado}
          className="flex items-center gap-2 px-4 py-2 bg-orange-700 text-white rounded-lg text-sm hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Printer size={16} />
          {loadingEstado ? 'Generando...' : 'Imprimir Estado de Cuenta'}
        </button>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-xl"><BarChart3 className="text-red-700" size={20} /></div>
          <div>
            <h2 className="font-bold text-gray-900">Reporte de Antigüedad CxP (Aging)</h2>
            <p className="text-sm text-gray-500">Todas las deudas a proveedores por rango de días. Útil para planificación de pagos y flujo de caja.</p>
          </div>
        </div>
        <button
          onClick={handleAging}
          disabled={loadingAging || !empresaId}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-sm hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Printer size={16} />
          {loadingAging ? 'Generando...' : 'Imprimir Aging Report'}
        </button>
        <p className="text-xs text-gray-400">Se imprime en formato horizontal (landscape A4)</p>
      </div>
    </div>
  )
}
