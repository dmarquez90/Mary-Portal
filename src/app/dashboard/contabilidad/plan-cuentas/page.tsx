'use client'
// src/app/dashboard/contabilidad/plan-cuentas/page.tsx
import { useEffect, useState } from 'react'

type Cuenta = {
  id: string
  codigo: string
  nombre: string
  tipo: string
  naturaleza: string
  nivel: number
  permite_movimiento: boolean
  activa: boolean
  descripcion?: string
}

const TIPO_COLORS: Record<string, string> = {
  activo:     'bg-blue-100 text-blue-700',
  pasivo:     'bg-red-100 text-red-700',
  patrimonio: 'bg-purple-100 text-purple-700',
  ingreso:    'bg-green-100 text-green-700',
  costo:      'bg-orange-100 text-orange-700',
  gasto:      'bg-gray-100 text-gray-600',
}

const TIPO_LABEL: Record<string, string> = {
  activo: 'Activo', pasivo: 'Pasivo', patrimonio: 'Patrimonio',
  ingreso: 'Ingreso', costo: 'Costo', gasto: 'Gasto',
}

export default function PlanCuentasPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set(['1','2','3','4','5','6']))
  const [mostrarModal, setMostrarModal] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nueva, setNueva] = useState({
    codigo: '', nombre: '', tipo: 'activo', naturaleza: 'deudora',
    nivel: 3, descripcion: '', permite_movimiento: true,
  })

  useEffect(() => { cargarCuentas() }, [])

  async function cargarCuentas() {
    setLoading(true)
    const res = await fetch('/api/plan-cuentas')
    const dat = await res.json()
    setCuentas(dat.cuentas || [])
    setLoading(false)
  }

  async function guardarCuenta() {
    if (!nueva.codigo || !nueva.nombre) return
    setGuardando(true)
    const res = await fetch('/api/plan-cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nueva),
    })
    if (res.ok) {
      setMostrarModal(false)
      setNueva({ codigo: '', nombre: '', tipo: 'activo', naturaleza: 'deudora', nivel: 3, descripcion: '', permite_movimiento: true })
      cargarCuentas()
    }
    setGuardando(false)
  }

  const hayFiltro = !!(busqueda || filtroTipo || filtroNivel)

  // Filtrado plano para búsqueda/filtros
  const cuentasFiltradas = cuentas.filter(c => {
    const termino = busqueda.toLowerCase().trim()
    const matchBusq = !termino ||
      c.codigo.toLowerCase().includes(termino) ||
      c.nombre.toLowerCase().includes(termino)
    const matchTipo = !filtroTipo || c.tipo === filtroTipo
    const matchNivel = !filtroNivel || c.nivel === parseInt(filtroNivel)
    return matchBusq && matchTipo && matchNivel
  })

  // Para árbol jerárquico (sin filtros)
  const grupos = cuentas.filter(c => c.nivel === 1)

  function getCuentasHijas(codigoPadre: string, nivel: number) {
    return cuentas.filter(c => {
      if (c.nivel !== nivel) return false
      const partes = c.codigo.split('.')
      const prefix = partes.slice(0, partes.length - 1).join('.')
      return prefix === codigoPadre
    }).sort((a, b) => a.codigo.localeCompare(b.codigo))
  }

  function toggleExpandir(codigo: string) {
    const s = new Set(expandidos)
    if (s.has(codigo)) s.delete(codigo)
    else s.add(codigo)
    setExpandidos(s)
  }

  const totalActivas = cuentas.filter(c => c.activa && c.permite_movimiento).length

  const nivelIndent: Record<number, string> = { 1: '', 2: 'pl-4', 3: 'pl-8', 4: 'pl-12' }
  const nivelFont: Record<number, string> = { 1: 'font-bold text-gray-800', 2: 'font-semibold text-gray-700', 3: 'text-gray-800', 4: 'text-gray-700' }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Plan de Cuentas</h1>
          <p className="text-sm text-gray-500">{totalActivas} cuentas activas con movimiento · NIIF PYMES Nicaragua</p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
        >
          + Nueva cuenta
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar código o nombre..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos los tipos</option>
          {Object.keys(TIPO_LABEL).map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
        </select>
        <select
          value={filtroNivel}
          onChange={e => setFiltroNivel(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todos los niveles</option>
          <option value="1">Nivel 1 — Grupo</option>
          <option value="2">Nivel 2 — Subgrupo</option>
          <option value="3">Nivel 3 — Cuenta</option>
          <option value="4">Nivel 4 — Subcuenta</option>
        </select>
        {hayFiltro && (
          <button
            onClick={() => { setBusqueda(''); setFiltroTipo(''); setFiltroNivel('') }}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando plan de cuentas...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Encabezado tabla */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium uppercase tracking-wider">
            <div className="col-span-2">Código</div>
            <div className="col-span-4">Nombre</div>
            <div className="col-span-2">Tipo</div>
            <div className="col-span-2">Naturaleza</div>
            <div className="col-span-2">Referencia Legal</div>
          </div>

          {/* ── MODO BÚSQUEDA: lista plana ── */}
          {hayFiltro ? (
            cuentasFiltradas.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No se encontraron cuentas con esos filtros
              </div>
            ) : (
              cuentasFiltradas
                .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
                .map(cuenta => (
                  <div
                    key={cuenta.id}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 transition-colors ${!cuenta.activa ? 'opacity-40' : ''}`}
                  >
                    <div className={`col-span-2 text-sm font-mono font-medium text-gray-700 ${nivelIndent[cuenta.nivel] || ''}`}>
                      {cuenta.codigo}
                    </div>
                    <div className="col-span-4">
                      <p className={`text-sm ${nivelFont[cuenta.nivel] || 'text-gray-800'}`}>{cuenta.nombre}</p>
                      {cuenta.descripcion && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{cuenta.descripcion}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      {cuenta.tipo && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[cuenta.tipo] || 'bg-gray-100 text-gray-600'}`}>
                          {TIPO_LABEL[cuenta.tipo] || cuenta.tipo}
                        </span>
                      )}
                      {cuenta.permite_movimiento && (
                        <span className="ml-1 text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded border border-green-100">
                          Mov.
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-xs text-gray-500 capitalize">{cuenta.naturaleza}</div>
                    <div className="col-span-2 text-xs text-gray-400">
                      {cuenta.descripcion?.match(/LCT.*|Ley.*|Reglamento.*|Código.*|art\..*/)?.[0]?.substring(0, 25) ?? '—'}
                    </div>
                  </div>
                ))
            )
          ) : (
            /* ── MODO ÁRBOL: jerarquía completa ── */
            grupos.map(grupo => (
              <div key={grupo.id}>
                {/* Nivel 1 */}
                <button
                  onClick={() => toggleExpandir(grupo.codigo)}
                  className="w-full grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 transition-colors border-b border-gray-200 text-left"
                >
                  <div className="col-span-2 font-bold text-gray-700 text-sm flex items-center gap-1">
                    <span className="text-gray-400">{expandidos.has(grupo.codigo) ? '▾' : '▸'}</span>
                    {grupo.codigo}
                  </div>
                  <div className="col-span-4 font-bold text-gray-700 text-sm">{grupo.nombre}</div>
                  <div className="col-span-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[grupo.tipo]}`}>
                      {TIPO_LABEL[grupo.tipo]}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-gray-500 capitalize">{grupo.naturaleza}</div>
                  <div className="col-span-2 text-xs text-gray-400">—</div>
                </button>

                {expandidos.has(grupo.codigo) && getCuentasHijas(grupo.codigo, 2).map(subgrupo => (
                  <div key={subgrupo.id}>
                    {/* Nivel 2 */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="col-span-2 text-sm font-semibold text-gray-600 pl-4">{subgrupo.codigo}</div>
                      <div className="col-span-4 text-sm font-semibold text-gray-600">{subgrupo.nombre}</div>
                      <div className="col-span-2" />
                      <div className="col-span-2 text-xs text-gray-400 capitalize">{subgrupo.naturaleza}</div>
                      <div className="col-span-2" />
                    </div>

                    {/* Nivel 3 */}
                    {getCuentasHijas(subgrupo.codigo, 3).map(cuenta => (
                      <div
                        key={cuenta.id}
                        className={`grid grid-cols-12 gap-2 px-4 py-2 hover:bg-blue-50 border-b border-gray-50 transition-colors ${!cuenta.activa ? 'opacity-40' : ''}`}
                      >
                        <div className="col-span-2 text-sm text-gray-500 pl-8 font-mono">{cuenta.codigo}</div>
                        <div className="col-span-4">
                          <p className="text-sm text-gray-800">{cuenta.nombre}</p>
                          {cuenta.descripcion && (
                            <p className="text-xs text-gray-400 mt-0.5">{cuenta.descripcion.substring(0, 60)}{cuenta.descripcion.length > 60 ? '...' : ''}</p>
                          )}
                        </div>
                        <div className="col-span-2">
                          {cuenta.permite_movimiento && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded border border-green-100">
                              Movimiento
                            </span>
                          )}
                        </div>
                        <div className="col-span-2 text-xs text-gray-500 capitalize">{cuenta.naturaleza}</div>
                        <div className="col-span-2 text-xs text-gray-400">
                          {cuenta.descripcion?.match(/LCT.*|Ley.*|Reglamento.*|Código.*|art\..*/)?.[0]?.substring(0, 25) ?? '—'}
                        </div>
                      </div>
                    ))}

                    {/* Nivel 4 */}
                    {getCuentasHijas(subgrupo.codigo, 3).flatMap(c3 =>
                      getCuentasHijas(c3.codigo, 4).map(cuenta => (
                        <div
                          key={cuenta.id}
                          className={`grid grid-cols-12 gap-2 px-4 py-2 hover:bg-blue-50 border-b border-gray-50 transition-colors ${!cuenta.activa ? 'opacity-40' : ''}`}
                        >
                          <div className="col-span-2 text-sm text-gray-400 pl-12 font-mono">{cuenta.codigo}</div>
                          <div className="col-span-4">
                            <p className="text-sm text-gray-700">{cuenta.nombre}</p>
                          </div>
                          <div className="col-span-2">
                            {cuenta.permite_movimiento && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded border border-green-100">
                                Movimiento
                              </span>
                            )}
                          </div>
                          <div className="col-span-2 text-xs text-gray-400 capitalize">{cuenta.naturaleza}</div>
                          <div className="col-span-2 text-xs text-gray-400">—</div>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal nueva cuenta */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Nueva Cuenta Contable</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Código *</label>
                  <input
                    type="text"
                    value={nueva.codigo}
                    onChange={e => setNueva({...nueva, codigo: e.target.value})}
                    placeholder="Ej: 1.1.13"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nivel</label>
                  <select
                    value={nueva.nivel}
                    onChange={e => setNueva({...nueva, nivel: parseInt(e.target.value)})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={1}>1 — Grupo</option>
                    <option value={2}>2 — Subgrupo</option>
                    <option value={3}>3 — Cuenta</option>
                    <option value={4}>4 — Subcuenta</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={nueva.nombre}
                  onChange={e => setNueva({...nueva, nombre: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                  <select
                    value={nueva.tipo}
                    onChange={e => {
                      const tipo = e.target.value
                      const nat = ['activo','costo','gasto'].includes(tipo) ? 'deudora' : 'acreedora'
                      setNueva({...nueva, tipo, naturaleza: nat})
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    {Object.entries(TIPO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Naturaleza</label>
                  <select
                    value={nueva.naturaleza}
                    onChange={e => setNueva({...nueva, naturaleza: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="deudora">Deudora</option>
                    <option value="acreedora">Acreedora</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descripción / Referencia Legal</label>
                <input
                  type="text"
                  value={nueva.descripcion}
                  onChange={e => setNueva({...nueva, descripcion: e.target.value})}
                  placeholder="Ej: LCT art. 45 — Deducible IR"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={nueva.permite_movimiento}
                  onChange={e => setNueva({...nueva, permite_movimiento: e.target.checked})}
                  className="rounded"
                />
                Permite movimiento (puede usarse en asientos)
              </label>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setMostrarModal(false)} className="text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
              <button
                onClick={guardarCuenta}
                disabled={guardando || !nueva.codigo || !nueva.nombre}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
