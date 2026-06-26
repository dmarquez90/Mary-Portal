'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import {
  Home,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  BookOpen,
  LogOut,
  ChevronRight,
  Wallet,
  Building2,
  Settings,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',            label: 'Inicio',      icon: Home },
  { href: '/dashboard/ventas',     label: 'Ventas',      icon: ShoppingCart },
  { href: '/dashboard/compras',    label: 'Compras',     icon: Package },
  { href: '/dashboard/clientes',   label: 'Clientes',    icon: Users },
  { href: '/dashboard/proveedores',label: 'Proveedores', icon: Users },
  { href: '/dashboard/inventario', label: 'Inventario',  icon: TrendingUp },
  { href: '/dashboard/reportes',   label: 'Reportes',    icon: BookOpen },
]

const contabilidadItems = [
  { href: '/dashboard/contabilidad', label: 'Contabilidad', icon: BookOpen, submenu: true },
]

const financieroItems = [
  { href: '/dashboard/caja',   label: 'Caja',   icon: Wallet },
  { href: '/dashboard/bancos', label: 'Bancos', icon: Building2 },
]

const sistemaItems = [
  { href: '/dashboard/configuracion', label: 'Configuración', icon: Settings },
]

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  submenu,
}: {
  href: string
  label: string
  icon: any
  active: boolean
  submenu?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <Icon size={20} />
      <span className="text-sm font-medium flex-1">{label}</span>
      {submenu && <ChevronRight size={16} />}
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-56 bg-slate-800 text-white flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">SARA</h1>
        <p className="text-xs text-gray-400 mt-1">Sistema Administrativo</p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)}
          />
        ))}

        {/* Financiero Section — Caja y Bancos independientes */}
        <div className="pt-4 mt-3 border-t border-slate-700">
          <p className="text-xs font-semibold text-gray-500 uppercase px-4 mb-2">
            Financiero
          </p>
          {financieroItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </div>

        {/* Contabilidad Section */}
        <div className="pt-4 mt-3 border-t border-slate-700">
          <p className="text-xs font-semibold text-gray-500 uppercase px-4 mb-2">
            Contabilidad
          </p>
          {contabilidadItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
              submenu={item.submenu}
            />
          ))}
        </div>

        {/* Sistema Section */}
        <div className="pt-4 mt-3 border-t border-slate-700">
          <p className="text-xs font-semibold text-gray-500 uppercase px-4 mb-2">
            Sistema
          </p>
          {sistemaItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-slate-700 p-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-gray-300 hover:bg-slate-700 transition-colors"
        >
          <LogOut size={20} />
          <span className="text-sm font-medium">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
