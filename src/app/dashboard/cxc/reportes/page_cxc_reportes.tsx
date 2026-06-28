'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Printer, BarChart3, Users, ChevronDown } from 'lucide-react'

interface Cliente { id: string; nombre: string; ruc?: string; telefono?: string }
interface Saldo {
  factura_id: string; numero_factura: string; fecha_emision: string
  fecha_vencimiento?: string; monto_original: number; total_abonado: number
  saldo_pendiente: number; estado_cobro: string; dias_vencido: number
}
interface Abono {
  factura_id: string; fecha: string; monto: number; forma_pago: string; referencia?: string
}
interface FilaAging {
  cliente_id: string; nombre: string; ruc: string; telefono: string
  rango_0_30: number; rango_31_60: number; rango_61_90: number; rango_mas_90: number; total: number
}
interface Empresa { nombre: string; ruc: string; direccion: string; correo: string; telefono?: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)
const fmtFecha = (f: string) =>
  new Date(f + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ── Función de impresión: Estado de Cuenta ──────────────────
function imprimirEstadoCuenta(empresa: Empresa, cliente: Cliente, saldos: Saldo[], abonos: Abono[], fechaReporte: string) {
  const totalPendiente = saldos.filter(s => s.estado_cobro !== 'pagada').reduce((a, s) => a + s.saldo_pendiente, 0)
  const totalOriginal  = saldos.reduce((a, s) => a + s.monto_original, 0)
  const totalAbonado   = saldos.reduce((a, s) => a + s.total_abonado, 0)

  const filasSaldos = saldos.map((s, i) => `
    <tr style="background:${i%2===0?'#f8fafc':'#fff'}">
      <td style="padding:7px 10px;font-size:12px;font-family:monospace">${s.numero_factura}</td>
      <td style="padding:7px 10px;font-size:12px">${fmtFecha(s.fecha_emision)}</td>
      <td style="padding:7px 10px;font-size:12px">${s.fecha_vencimiento ? fmtFecha(s.fecha_vencimiento) : '—'}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right">${fmt(s.monto_original)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#16a34a">${fmt(s.total_abonado)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700;color:${s.estado_cobro==='vencida'?'#dc2626':'#1d4ed8'}">${fmt(s.saldo_pendiente)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:center">
        <span style="padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;background:${s.estado_cobro==='pagada'?'#dcfce7':s.estado_cobro==='vencida'?'#fee2e2':'#dbeafe'};color:${s.estado_cobro==='pagada'?'#15803d':s.estado_cobro==='vencida'?'#dc2626':'#1d4ed8'}">${s.estado_cobro}</span>
        ${s.dias_vencido > 0 ? `<span style="font-size:10px;color:#dc2626;margin-left:4px">+${s.dias_vencido}d</span>` : ''}
      </td>
    </tr>`).join('')

  const filasAbonos = abonos.map((a, i) => `
    <tr style="background:${i%2===0?'#f0fdf4':'#fff'}">
      <td style="padding:6px 10px;font-size:11px">${fmtFecha(a.fecha)}</td>
      <td style="padding:6px 10px;font-size:11px;font-family:monospace">${saldos.find(s=>s.factura_id===a.factura_id)?.numero_factura??'—'}</td>
      <td style="padding:6px 10px;font-size:11px">${a.forma_pago.charAt(0).toUpperCase()+a.forma_pago.slice(1)}</td>
      <td style="padding:6px 10px;font-size:11px">${a.referencia??'—'}</td>
      <td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:600;color:#16a34a">${fmt(a.monto)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Estado de Cuenta — ${cliente.nombre}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:28px;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
    .emp-nombre{font-size:20px;font-weight:800;color:#1e3a8a;margin-bottom:3px}
    .emp-info{font-size:11px;color:#64748b;line-height:1.6}
    .titulo{font-size:22px;font-weight:800;color:#1d4ed8;text-align:right}
    .sub{font-size:11px;color:#64748b;text-align:right;line-height:1.7;margin-top:3px}
    hr{border:none;border-top:2.5px solid #1e3a8a;margin:16px 0}
    .cliente-box{background:#eff6ff;border-left:4px solid #1d4ed8;padding:12px 16px;margin-bottom:16px;border-radius:4px}
    .cliente-nombre{font-size:16px;font-weight:700;color:#1e293b;margin-bottom:2px}
    .cliente-meta{font-size:11px;color:#64748b;line-height:1.6}
    .kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
    .kpi-label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .kpi-val{font-size:18px;font-weight:800}
    h3{font-size:13px;font-weight:700;color:#1e293b;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#1e3a8a}
    thead th{padding:8px 10px;font-size:11px;font-weight:600;color:#fff;text-align:left}
    thead th:last-child,thead th:nth-child(4),thead th:nth-child(5),thead th:nth-child(6){text-align:right}
    thead th:nth-child(7){text-align:center}
    tfoot td{padding:8px 10px;font-size:12px;font-weight:700;background:#dbeafe;color:#1e3a8a;text-align:right}
    tfoot td:first-child{text-align:left}
    .pie{margin-top:24px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
    @page{size:A4;margin:1.5cm}
  </style></head><body>
  <div class="header">
    <div>
      <div class="emp-nombre">${empresa.nombre}</div>
      <div class="emp-info">RUC: ${empresa.ruc}<br/>${empresa.direccion}<br/>${empresa.correo}${empresa.telefono?'<br/>Tel: '+empresa.telefono:''}</div>
    </div>
    <div>
      <div class="titulo">ESTADO DE CUENTA</div>
      <div class="sub">Cuentas por Cobrar<br/>Fecha: ${fmtFecha(fechaReporte)}</div>
    </div>
  </div>
  <hr/>
  <div class="cliente-box">
    <div class="cliente-nombre">${cliente.nombre}</div>
    <div class="cliente-meta">${cliente.ruc?'RUC: '+cliente.ruc+'&nbsp;&nbsp;':''}${cliente.telefono?'Tel: '+cliente.telefono:''}${cliente.correo?'&nbsp;&nbsp;'+cliente.correo:''}</div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Total Facturado</div><div class="kpi-val" style="color:#1e293b">${fmt(totalOriginal)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Abonado</div><div class="kpi-val" style="color:#16a34a">${fmt(totalAbonado)}</div></div>
    <div class="kpi"><div class="kpi-label">Saldo Pendiente</div><div class="kpi-val" style="color:#1d4ed8">${fmt(totalPendiente)}</div></div>
  </div>
  <h3>Facturas</h3>
  <table>
    <thead><tr>
      <th>N° Factura</th><th>Emisión</th><th>Vencimiento</th><th>Total</th><th>Abonado</th><th>Saldo</th><th style="text-align:center">Estado</th>
    </tr></thead>
    <tbody>${filasSaldos}</tbody>
    <tfoot><tr>
      <td colspan="3">TOTALES</td>
      <td>${fmt(totalOriginal)}</td>
      <td>${fmt(totalAbonado)}</td>
      <td>${fmt(totalPendiente)}</td>
      <td></td>
    </tr></tfoot>
  </table>
  ${abonos.length > 0 ? `
  <h3>Historial de Cobros</h3>
  <table>
    <thead><tr><th>Fecha</th><th>Factura</th><th>Forma Pago</th><th>Referencia</th><th style="text-align:right">Monto</th></tr></thead>
    <tbody>${filasAbonos}</tbody>
    <tfoot><tr><td colspan="4">TOTAL COBRADO</td><td>${fmt(abonos.reduce((a,b)=>a+b.monto,0))}</td></tr></tfoot>
  </table>` : ''}
  <div class="pie">SARA — Sistema Automatizado de Registro Administrativo · Reporte generado el ${fmtFecha(fechaReporte)}</div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=1000,height=750')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Función de impresión: Aging Report ─────────────────────
function imprimirAging(empresa: Empresa, filas: FilaAging[], fechaReporte: string) {
  const tot0  = filas.reduce((a,f)=>a+f.rango_0_30,0)
  const tot31 = filas.reduce((a,f)=>a+f.rango_31_60,0)
  const tot61 = filas.reduce((a,f)=>a+f.rango_61_90,0)
  const tot90 = filas.reduce((a,f)=>a+f.rango_mas_90,0)
  const totT  = filas.reduce((a,f)=>a+f.total,0)

  const filasTbl = filas.map((f,i) => `
    <tr style="background:${i%2===0?'#f8fafc':'#fff'}">
      <td style="padding:7px 10px;font-size:12px;font-weight:600">${f.nombre}</td>
      <td style="padding:7px 10px;font-size:11px;color:#64748b">${f.ruc}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#16a34a">${fmt(f.rango_0_30)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#ca8a04">${fmt(f.rango_31_60)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#ea580c">${fmt(f.rango_61_90)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#dc2626;font-weight:700">${fmt(f.rango_mas_90)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:800;color:#1e3a8a">${fmt(f.total)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Aging Report CxC</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:28px}
    .header{display:flex;justify-content:space-between;margin-bottom:20px}
    .emp-nombre{font-size:20px;font-weight:800;color:#1e3a8a;margin-bottom:3px}
    .emp-info{font-size:11px;color:#64748b;line-height:1.6}
    .titulo{font-size:22px;font-weight:800;color:#1d4ed8;text-align:right}
    .sub{font-size:11px;color:#64748b;text-align:right;line-height:1.7;margin-top:3px}
    hr{border:none;border-top:2.5px solid #1e3a8a;margin:16px 0}
    .resumen{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
    .rcard{border-radius:8px;padding:12px;text-align:center;border:1px solid #e2e8f0}
    .rcard-label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .rcard-val{font-size:16px;font-weight:800}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#1e3a8a}
    thead th{padding:8px 10px;font-size:11px;font-weight:600;color:#fff;text-align:right}
    thead th:first-child,thead th:nth-child(2){text-align:left}
    tfoot td{padding:8px 10px;font-size:12px;font-weight:700;background:#1e3a8a;color:#fff;text-align:right}
    tfoot td:first-child{text-align:left}
    .pie{margin-top:24px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
    @page{size:A4 landscape;margin:1.5cm}
  </style></head><body>
  <div class="header">
    <div>
      <div class="emp-nombre">${empresa.nombre}</div>
      <div class="emp-info">RUC: ${empresa.ruc}<br/>${empresa.direccion}</div>
    </div>
    <div>
      <div class="titulo">ANTIGÜEDAD DE SALDOS (CxC)</div>
      <div class="sub">Cuentas por Cobrar · ${filas.length} cliente(s)<br/>Fecha: ${fmtFecha(fechaReporte)}</div>
    </div>
  </div>
  <hr/>
  <div class="resumen">
    <div class="rcard" style="background:#f0fdf4"><div class="rcard-label" style="color:#166534">0–30 días</div><div class="rcard-val" style="color:#16a34a">${fmt(tot0)}</div></div>
    <div class="rcard" style="background:#fefce8"><div class="rcard-label" style="color:#854d0e">31–60 días</div><div class="rcard-val" style="color:#ca8a04">${fmt(tot31)}</div></div>
    <div class="rcard" style="background:#fff7ed"><div class="rcard-label" style="color:#9a3412">61–90 días</div><div class="rcard-val" style="color:#ea580c">${fmt(tot61)}</div></div>
    <div class="rcard" style="background:#fef2f2"><div class="rcard-label" style="color:#991b1b">+90 días</div><div class="rcard-val" style="color:#dc2626">${fmt(tot90)}</div></div>
    <div class="rcard" style="background:#eff6ff"><div class="rcard-label" style="color:#1e40af">TOTAL</div><div class="rcard-val" style="color:#1d4ed8">${fmt(totT)}</div></div>
  </div>
  <table>
    <thead><tr><th style="text-align:left">Cliente</th><th style="text-align:left">RUC</th><th>0–30 días</th><th>31–60 días</th><th>61–90 días</th><th>+90 días</th><th>TOTAL</th></tr></thead>
    <tbody>${filasTbl}</tbody>
    <tfoot><tr><td>TOTALES</td><td></td><td>${fmt(tot0)}</td><td>${fmt(tot31)}</td><td>${fmt(tot61)}</td><td>${fmt(tot90)}</td><td>${fmt(totT)}</td></tr></tfoot>
  </table>
  <div class="pie">SARA — Sistema Administrativo · Reporte generado el ${fmtFecha(fechaReporte)}</div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=1200,height=750')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Componente principal ────────────────────────────────────
export default function CxCReportesPage() {
  const [empresaId,    setEmpresaId]    = useState('')
  const [clientes,     setClientes]     = useState<Cliente[]>([])
  const [clienteId,    setClienteId]    = useState('')
  const [loadingData,  setLoadingData]  = useState(false)
  const [loadingAging, setLoadingAging] = useState(false)
  const [empresa,      setEmpresa]      = useState<Empresa | null>(null)

  useEffect(() => {
    async function init() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: nat }, { data: jur }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id, nombre_completo, numero_ruc, direccion, telefono, correo_electronico').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id, nombre_empresa, numero_ruc, direccion_legal, correo_electronico').eq('user_id', user.id).maybeSingle(),
      ])
      const eid = nat?.id ?? jur?.id ?? ''
      setEmpresaId(eid)
      if (nat) setEmpresa({ nombre: nat.nombre_completo, ruc: nat.numero_ruc, direccion: nat.direccion, correo: nat.correo_electronico, telefono: nat.telefono })
      if (jur) setEmpresa({ nombre: jur.nombre_empresa, ruc: jur.numero_ruc, direccion: jur.direccion_legal, correo: jur.correo_electronico, telefono: null })

      if (eid) {
        const { data: cl } = await supabase.from('clientes').select('id, nombre, ruc, telefono').eq('empresa_id', eid).eq('activo', true).order('nombre')
        setClientes(cl ?? [])
      }
    }
    init()
  }, [])

  async function handleEstadoCuenta() {
    if (!clienteId) return
    setLoadingData(true)
    const r = await fetch(`/api/cxc/reportes?empresa_id=${empresaId}&tipo=estado_cuenta&cliente_id=${clienteId}`)
    const d = await r.json()
    setLoadingData(false)
    if (r.ok) imprimirEstadoCuenta(d.empresa, d.cliente, d.saldos, d.abonos, d.fecha_reporte)
    else alert('Error: ' + d.error)
  }

  async function handleAging() {
    setLoadingAging(true)
    const r = await fetch(`/api/cxc/reportes?empresa_id=${empresaId}&tipo=aging`)
    const d = await r.json()
    setLoadingAging(false)
    if (r.ok) imprimirAging(d.empresa, d.filas, d.fecha_reporte)
    else alert('Error: ' + d.error)
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes CxC</h1>
        <p className="text-sm text-gray-500 mt-1">Documentos imprimibles de Cuentas por Cobrar</p>
      </div>

      {/* Estado de Cuenta por Cliente */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-xl"><Users className="text-blue-600" size={20} /></div>
          <div>
            <h2 className="font-bold text-gray-900">Estado de Cuenta por Cliente</h2>
            <p className="text-sm text-gray-500">Todas las facturas, abonos y saldo pendiente de un cliente. Ideal para cobros.</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Cliente</label>
          <div className="relative">
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-blue-300 outline-none pr-8"
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
            >
              <option value="">— Seleccionar cliente —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.ruc ? ` (${c.ruc})` : ''}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" size={16} />
          </div>
        </div>
        <button
          onClick={handleEstadoCuenta}
          disabled={!clienteId || loadingData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Printer size={16} />
          {loadingData ? 'Generando...' : 'Imprimir Estado de Cuenta'}
        </button>
      </div>

      {/* Aging Report */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-100 rounded-xl"><BarChart3 className="text-orange-600" size={20} /></div>
          <div>
            <h2 className="font-bold text-gray-900">Reporte de Antigüedad (Aging)</h2>
            <p className="text-sm text-gray-500">Toda la cartera clasificada por 0–30 / 31–60 / 61–90 / +90 días. Requerido por bancos y auditores.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          {[['0–30 días', 'bg-green-50 text-green-700'], ['31–60 días', 'bg-yellow-50 text-yellow-700'], ['61–90 días', 'bg-orange-50 text-orange-700'], ['+90 días', 'bg-red-50 text-red-700']].map(([label, cls]) => (
            <div key={label} className={`rounded-lg py-2 px-3 font-semibold ${cls}`}>{label}</div>
          ))}
        </div>
        <button
          onClick={handleAging}
          disabled={loadingAging || !empresaId}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Printer size={16} />
          {loadingAging ? 'Generando...' : 'Imprimir Aging Report'}
        </button>
        <p className="text-xs text-gray-400">Se imprime en formato horizontal (landscape A4)</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">ℹ️ Nota sobre reportes DGI</p>
        <p>Estos reportes son para uso interno y gestión de cobros. Los reportes oficiales para la DGI (Planilla de Ingresos, Crédito Fiscal IVA, Retenciones) se encuentran en el módulo <strong>Reportes DGI</strong>. Los abonos CxC no se reportan directamente a la DGI — Nicaragua usa el criterio de <strong>devengo</strong> (la factura se declara cuando se emite, no cuando se cobra).</p>
      </div>
    </div>
  )
}
