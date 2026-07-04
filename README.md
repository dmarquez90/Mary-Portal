# FacturaNIC — Sistema Contable para Nicaragua

Sistema de facturación y contabilidad diseñado para empresas nicaragüenses,
cumpliendo con los estándares de tributación de la DGI.

---

## 🚀 Stack Tecnológico

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Backend / DB**: Supabase (PostgreSQL + Auth + RLS)
- **Deploy**: Vercel

---

## ⚙️ Configuración Paso a Paso

### 1. Clonar el proyecto
```bash
git clone https://github.com/tu-usuario/factura-nic.git
cd factura-nic
npm install
```

### 2. Configurar Supabase

1. Crea un nuevo proyecto en [supabase.com](https://supabase.com)
2. Ve a **SQL Editor** y ejecuta el archivo:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. En **Authentication > Settings**, habilita el proveedor Email/Password.

### 3. Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto:
```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Puedes encontrar estas credenciales en:
**Supabase > Settings > API**

### 4. Correr en desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000)

---

## 📤 Deploy en Vercel

1. Sube el código a GitHub
2. Importa el repo en [vercel.com](https://vercel.com)
3. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` (tu dominio de Vercel)
4. Deploy automático ✅

---

## 📁 Estructura del Proyecto

```
src/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── auth/
│   │   ├── login/page.tsx        # Inicio de sesión
│   │   └── register/page.tsx     # Registro (Persona Natural/Jurídica/Cuota Fija)
│   └── dashboard/
│       ├── page.tsx              # Home dashboard con stats
│       ├── ventas/               # Módulo de ventas y facturas
│       ├── compras/              # Módulo de compras
│       ├── inventario/           # Módulo de inventario
│       ├── reportes/             # Reportes DGI
│       └── empresa/              # Info de la empresa
├── components/
│   └── layout/
│       └── Sidebar.tsx           # Barra de navegación lateral
├── lib/
│   ├── supabase/                 # Clientes Supabase (browser, server, middleware)
│   └── utils.ts                  # Funciones utilitarias (currency, RUC, etc.)
└── types/
    └── index.ts                  # TypeScript types del sistema
```

---

## 💰 Normativa DGI Implementada

| Concepto | Valor |
|----------|-------|
| IVA general | 15% |
| IR retención en la fuente | 2% |
| Formato RUC | 14 dígitos |
| Libro de ventas | Mensual |
| Libro de compras | Mensual |

---

## 🔒 Seguridad

- **Row Level Security (RLS)** activo en todas las tablas
- Cada empresa solo ve sus propios datos
- Autenticación gestionada por Supabase Auth
- Sesiones manejadas via cookies httpOnly (Next.js SSR)

---

## 📌 Próximos módulos a desarrollar

- [ ] Vista de detalle de factura con PDF exportable
- [ ] Gestión de clientes y proveedores
- [ ] Exportación libro de ventas/compras a Excel
- [ ] Declaración de IVA mensual en PDF
- [ ] Módulo de cuentas por cobrar/pagar
- [ ] Multi-usuario por empresa