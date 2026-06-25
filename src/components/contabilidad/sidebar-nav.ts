// ============================================================
// SARA — Actualización del Sidebar
// Agregar sección Contabilidad con sus 4 sub-módulos
// Reemplaza o agrega en tu src/components/layout/Sidebar.tsx
// ============================================================
//
// Busca en tu Sidebar.tsx la sección de navegación y agrega
// este bloque de "Contabilidad" entre Reportes y Configuración:

// ── AGREGAR ESTE BLOQUE AL ARRAY navItems O DONDE TENGAS LOS LINKS ──

const CONTABILIDAD_NAV = [
  {
    label: 'Contabilidad',
    icon: '📊',
    href: '/dashboard/contabilidad',
    children: [
      { label: 'Plan de Cuentas',        href: '/dashboard/contabilidad/plan-cuentas', icon: '📋' },
      { label: 'Libro Diario',           href: '/dashboard/contabilidad/diario',       icon: '📝' },
      { label: 'Libro Mayor',            href: '/dashboard/contabilidad/mayor',        icon: '📚' },
      { label: 'Balance Comprobación',   href: '/dashboard/contabilidad/balance',      icon: '⚖️' },
    ],
  },
]

// ── JSX PARA AGREGAR EN EL SIDEBAR ──────────────────────────
// Copia este JSX dentro de tu componente Sidebar,
// dentro de la sección de navigation/ul:

/*
<li>
  <Link
    href="/dashboard/contabilidad"
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
      pathname.startsWith('/dashboard/contabilidad')
        ? 'bg-blue-50 text-blue-700 font-medium'
        : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    <span>📊</span>
    Contabilidad
  </Link>
  {pathname.startsWith('/dashboard/contabilidad') && (
    <ul className="mt-1 ml-6 space-y-0.5">
      {[
        { label: 'Plan de Cuentas',      href: '/dashboard/contabilidad/plan-cuentas', icon: '📋' },
        { label: 'Libro Diario',         href: '/dashboard/contabilidad/diario',       icon: '📝' },
        { label: 'Libro Mayor',          href: '/dashboard/contabilidad/mayor',        icon: '📚' },
        { label: 'Balance Comprobación', href: '/dashboard/contabilidad/balance',      icon: '⚖️' },
      ].map(item => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              pathname === item.href
                ? 'bg-blue-100 text-blue-800 font-medium'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )}
</li>
*/

export default CONTABILIDAD_NAV
