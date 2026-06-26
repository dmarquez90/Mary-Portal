'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  BookOpen,
  Settings,
  LogOut,
  ChevronRight,
  BanknoteIcon,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard/inicio', label: 'Inicio', icon: Home },
  { href: '/dashboard/ventas', label: 'Ventas', icon: ShoppingCart },
  { href: '/dashboard/compras', label: 'Compras', icon: Package },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/proveedores', label: 'Proveedores', icon: Users },
  { href: '/dashboard/inventario', label: 'Inventario', icon: TrendingUp },
  { href: '/dashboard/reportes', label: 'Reportes', icon: BookOpen },
]

const contabilidadItems = [
  { href: '/dashboard/contabilidad', label: 'Contabilidad', icon: BookOpen, submenu: true },
  { href: '/dashboard/caja-bancos', label: 'Caja y Bancos', icon: BanknoteIcon },
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

  return (
    <aside className="w-56 bg-slate-800 text-white flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">SARA</h1>
        <p className="text-xs text-gray-400 mt-1">Sistema Administrativo</p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname === item.href}
          />
        ))}

        {/* Contabilidad Section */}
        <div className="pt-4 mt-4 border-t border-slate-700">
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
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-slate-700 p-4 space-y-2">
        <button className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-gray-300 hover:bg-slate-700 transition-colors">
          <LogOut size={20} />
          <span className="text-sm font-medium">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
