\'use client\'
/**
 * ComboCargo — campo de cargo con búsqueda + creación al vuelo
 * Muestra los cargos existentes de la empresa y permite escribir uno nuevo.
 * Si el texto no coincide con ningún cargo existente, ofrece "Crear cargo X".
 */
import { useEffect, useRef, useState } from \'react\'

interface Cargo { id: string; nombre: string; departamento?: string }

interface Props {
  empresaId:  string
  value:      string          // cargo_id seleccionado (o '' si es nuevo/no seleccionado)
  inputValue: string          // texto visible en el input
  onChange:   (cargoId: string, nombreCargo: string) => void
}

export default function ComboCargo({ empresaId, value, inputValue, onChange }: Props) {
  const [cargos, setCargos]       = useState<Cargo[]>([])
  const [abierto, setAbierto]     = useState(false)
  const [texto, setTexto]         = useState(inputValue)
  const [creando, setCreando]     = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Sincronizar texto externo
  useEffect(() => { setTexto(inputValue) }, [inputValue])

  // Cargar cargos de la empresa
  useEffect(() => {
    if (!empresaId) return
    fetch(`/api/nomina/cargos?empresa_id=${empresaId}`)
      .then(r => r.json())
      .then(d => setCargos(Array.isArray(d) ? d : []))
  }, [empresaId])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener(\'mousedown\', handler)
    return () => document.removeEventListener(\'mousedown\', handler)
  }, [])

  const filtrados = cargos.filter(c =>
    c.nombre.toLowerCase().includes(texto.toLowerCase())
  )

  const mostrarCrear = texto.trim().length > 0 &&
    !cargos.some(c => c.nombre.toLowerCase() === texto.trim().toLowerCase())

  async function crearCargo() {
    if (!texto.trim() || !empresaId) return
    setCreando(true)
    try {
      const res = await fetch(\'/api/nomina/cargos\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({ empresa_id: empresaId, nombre: texto.trim(), activo: true }),
      })
      if (res.ok) {
        const nuevo: Cargo = await res.json()
        setCargos(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        onChange(nuevo.id, nuevo.nombre)
        setTexto(nuevo.nombre)
        setAbierto(false)
      }
    } finally {
      setCreando(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={texto}
        onChange={e => { setTexto(e.target.value); setAbierto(true); onChange(\'\', e.target.value) }}
        onFocus={() => setAbierto(true)}
        placeholder="Buscar o escribir cargo…"
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {abierto && (filtrados.length > 0 || mostrarCrear) && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtrados.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => { onChange(c.id, c.nombre); setTexto(c.nombre); setAbierto(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between ${
                  value === c.id ? \'bg-blue-50 font-medium text-blue-700\' : \'text-gray-700\'
                }`}
              >
                <span>{c.nombre}</span>
                {c.departamento && (
                  <span className="text-xs text-gray-400">{c.departamento}</span>
                )}
              </button>
            </li>
          ))}
          {mostrarCrear && (
            <li className="border-t border-gray-100">
              <button
                type="button"
                onClick={crearCargo}
                disabled={creando}
                className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 font-medium disabled:opacity-50"
              >
                <span className="text-base leading-none">+</span>
                {creando ? \'Creando…\' : `Crear cargo "${texto.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
