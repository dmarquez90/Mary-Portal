// ============================================================
// SARA – Plan de Cuentas Predeterminado
// Basado en NIIF para PYMES adaptado a Nicaragua (Ley 822)
// Se llama al crear una nueva empresa o desde Configuración
// ============================================================

export interface CuentaBase {
  codigo: string
  nombre: string
  tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto'
  naturaleza: 'deudora' | 'acreedora'
  nivel: number
  permite_movimiento: boolean
  descripcion?: string
}

export const PLAN_CUENTAS_NICARAGUA: CuentaBase[] = [
  // ── 1. ACTIVO ──────────────────────────────────────────────
  { codigo: '1',        nombre: 'ACTIVO',                          tipo: 'activo', naturaleza: 'deudora',   nivel: 1, permite_movimiento: false},
  { codigo: '1.1',      nombre: 'Activo Corriente',                tipo: 'activo', naturaleza: 'deudora',   nivel: 2, permite_movimiento: false},
  { codigo: '1.1.01',   nombre: 'Caja General',                    tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Efectivo en caja' },
  { codigo: '1.1.02',   nombre: 'Caja Chica',                      tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true },
  { codigo: '1.1.03',   nombre: 'Banco Moneda Nacional',           tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Cuentas bancarias en Córdobas' },
  { codigo: '1.1.04',   nombre: 'Banco Moneda Extranjera',         tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Cuentas bancarias en USD' },
  { codigo: '1.1.05',   nombre: 'Cuentas por Cobrar Clientes',     tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Facturas de crédito pendientes de cobro' },
  { codigo: '1.1.06',   nombre: 'Otras Cuentas por Cobrar',        tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true },
  { codigo: '1.1.07',   nombre: 'Anticipo a Proveedores',          tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true },
  { codigo: '1.1.08',   nombre: 'Inventario de Mercancías',        tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Costo de mercancías para venta (LCT art. 44)' },
  { codigo: '1.1.09',   nombre: 'IVA Crédito Fiscal',              tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'IVA pagado en compras acreditable contra débito' },
  { codigo: '1.1.10',   nombre: 'IR Pagado por Anticipado',        tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Anticipos IR mensual 1% (LCT art. 63)' },
  { codigo: '1.1.11',   nombre: 'Retenciones IR a Favor',          tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Retenciones en la fuente recibidas de clientes' },
  { codigo: '1.1.12',   nombre: 'Gastos Pagados por Anticipado',   tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true },

  { codigo: '1.2',      nombre: 'Activo No Corriente',             tipo: 'activo', naturaleza: 'deudora',   nivel: 2, permite_movimiento: false},
  { codigo: '1.2.01',   nombre: 'Edificios e Instalaciones',       tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Dep. 5% anual (LCT art. 45 num 1a)' },
  { codigo: '1.2.02',   nombre: 'Equipos de Cómputo y TIC',        tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Dep. 50% anual (LCT art. 45 num 1e)' },
  { codigo: '1.2.03',   nombre: 'Maquinaria y Equipos',            tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Dep. 20% anual (LCT art. 45 num 1c)' },
  { codigo: '1.2.04',   nombre: 'Vehículos',                       tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Dep. 20% anual (LCT art. 45 num 1d)' },
  { codigo: '1.2.05',   nombre: 'Mobiliario y Equipo de Oficina',  tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Dep. 20% anual (LCT art. 45 num 1b)' },
  { codigo: '1.2.06',   nombre: 'Terrenos',                        tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'No depreciable' },
  { codigo: '1.2.07',   nombre: 'Dep. Acum. Edificios',            tipo: 'activo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Cuenta contra-activo (saldo acreedor)' },
  { codigo: '1.2.08',   nombre: 'Dep. Acum. Equipos Cómputo',      tipo: 'activo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},
  { codigo: '1.2.09',   nombre: 'Dep. Acum. Maquinaria',           tipo: 'activo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '1.2.10',   nombre: 'Dep. Acum. Vehículos',            tipo: 'activo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '1.2.11',   nombre: 'Dep. Acum. Mobiliario',           tipo: 'activo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },

  { codigo: '1.3',      nombre: 'Activo Diferido',                 tipo: 'activo', naturaleza: 'deudora',   nivel: 2, permite_movimiento: false},
  { codigo: '1.3.01',   nombre: 'Gastos de Organización',          tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Amort. 3 años (LCT art. 45 num 6)' },
  { codigo: '1.3.02',   nombre: 'Gastos Pre-operativos',           tipo: 'activo', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Amort. 3 años (LCT art. 45 num 7)' },
  { codigo: '1.3.03',   nombre: 'Amort. Acum. Diferidos',          tipo: 'activo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },

  // ── 2. PASIVO ──────────────────────────────────────────────
  { codigo: '2',        nombre: 'PASIVO',                          tipo: 'pasivo', naturaleza: 'acreedora', nivel: 1, permite_movimiento: false},
  { codigo: '2.1',      nombre: 'Pasivo Corriente',                tipo: 'pasivo', naturaleza: 'acreedora', nivel: 2, permite_movimiento: false},
  { codigo: '2.1.01',   nombre: 'Cuentas por Pagar Proveedores',   tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '2.1.02',   nombre: 'Otras Cuentas por Pagar',         tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '2.1.03',   nombre: 'IVA Débito Fiscal',               tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'IVA cobrado en ventas (15%) a pagar DGI' },
  { codigo: '2.1.04',   nombre: 'IR por Pagar (Renta Anual)',       tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Tasa 30% renta neta o 1% ingresos brutos (LCT 52)' },
  { codigo: '2.1.05',   nombre: 'Anticipos IR por Enterar',        tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Pago mínimo definitivo mensual 1%' },
  { codigo: '2.1.06',   nombre: 'Retenciones IR por Enterar',      tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'IR 2% retenido a personas naturales proveedores' },
  { codigo: '2.1.07',   nombre: 'INSS Patronal por Pagar',         tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: '22.5% sobre salario base (Ley 539)' },
  { codigo: '2.1.08',   nombre: 'INSS Laboral por Pagar',          tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: '7% sobre salario base, retenido al trabajador' },
  { codigo: '2.1.09',   nombre: 'INATEC por Pagar',                tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: '2% sobre planilla salarial' },
  { codigo: '2.1.10',   nombre: 'Sueldos y Salarios por Pagar',    tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '2.1.11',   nombre: 'IR Laboral por Enterar',          tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'IR retenido a trabajadores (tabla progresiva art. 23)' },
  { codigo: '2.1.12',   nombre: 'Vacaciones por Pagar',            tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Provisión vacaciones 8.33% mensual' },
  { codigo: '2.1.13',   nombre: 'Aguinaldo por Pagar',             tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Provisión aguinaldo 8.33% mensual' },
  { codigo: '2.1.14',   nombre: 'Indemnización por Pagar',         tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Provisión indemnización 8.33% mensual' },
  { codigo: '2.1.15',   nombre: 'IMI por Pagar (Alcaldía)',         tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: '1% ingresos brutos mensual (Plan de Arbitrios)' },
  { codigo: '2.1.16',   nombre: 'Préstamos Bancarios C/P',         tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},
  { codigo: '2.1.17',   nombre: 'Anticipo de Clientes',            tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },

  { codigo: '2.2',      nombre: 'Pasivo No Corriente',             tipo: 'pasivo', naturaleza: 'acreedora', nivel: 2, permite_movimiento: false},
  { codigo: '2.2.01',   nombre: 'Préstamos Bancarios L/P',         tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},
  { codigo: '2.2.02',   nombre: 'Otras Deudas a Largo Plazo',      tipo: 'pasivo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },

  // ── 3. PATRIMONIO ──────────────────────────────────────────
  { codigo: '3',        nombre: 'PATRIMONIO',                      tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 1, permite_movimiento: false },
  { codigo: '3.1',      nombre: 'Capital Social',                  tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 2, permite_movimiento: false },
  { codigo: '3.1.01',   nombre: 'Capital Aportado',                tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '3.1.02',   nombre: 'Reserva Legal',                   tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: '10% de utilidad neta (Código Mercantil)' },
  { codigo: '3.2',      nombre: 'Resultados',                      tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 2, permite_movimiento: false },
  { codigo: '3.2.01',   nombre: 'Utilidades Retenidas',            tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '3.2.02',   nombre: 'Pérdidas Acumuladas',             tipo: 'patrimonio', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true },
  { codigo: '3.2.03',   nombre: 'Utilidad/Pérdida del Ejercicio',  tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Se cierra al final del período fiscal' },
  { codigo: '3.3',      nombre: 'Dividendos',                      tipo: 'patrimonio', naturaleza: 'deudora',   nivel: 2, permite_movimiento: false },
  { codigo: '3.3.01',   nombre: 'Dividendos Decretados',           tipo: 'patrimonio', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Ret. definitiva 10% (LCT art. 87)' },

  // ── 4. INGRESOS ────────────────────────────────────────────
  { codigo: '4',        nombre: 'INGRESOS',                        tipo: 'ingreso', naturaleza: 'acreedora', nivel: 1, permite_movimiento: false },
  { codigo: '4.1',      nombre: 'Ingresos Operacionales',          tipo: 'ingreso', naturaleza: 'acreedora', nivel: 2, permite_movimiento: false },
  { codigo: '4.1.01',   nombre: 'Ventas de Bienes',                tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Ventas gravadas con IVA 15%' },
  { codigo: '4.1.02',   nombre: 'Ventas de Servicios',             tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},
  { codigo: '4.1.03',   nombre: 'Ventas Exentas de IVA',           tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true, descripcion: 'Canasta básica y otros exentos (LCT art. 127)' },
  { codigo: '4.1.04',   nombre: 'Devoluciones en Ventas',          tipo: 'ingreso', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true, descripcion: 'Nota de crédito – contra ingreso' },
  { codigo: '4.1.05',   nombre: 'Descuentos en Ventas',            tipo: 'ingreso', naturaleza: 'deudora',   nivel: 3, permite_movimiento: true},
  { codigo: '4.2',      nombre: 'Ingresos No Operacionales',       tipo: 'ingreso', naturaleza: 'acreedora', nivel: 2, permite_movimiento: false },
  { codigo: '4.2.01',   nombre: 'Ingresos Financieros',            tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},
  { codigo: '4.2.02',   nombre: 'Utilidad en Venta de Activos',    tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},
  { codigo: '4.2.03',   nombre: 'Otros Ingresos',                  tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true},

  // ── 5. COSTOS ──────────────────────────────────────────────
  { codigo: '5',        nombre: 'COSTOS',                          tipo: 'costo', naturaleza: 'deudora', nivel: 1, permite_movimiento: false },
  { codigo: '5.1',      nombre: 'Costo de Ventas',                 tipo: 'costo', naturaleza: 'deudora', nivel: 2, permite_movimiento: false },
  { codigo: '5.1.01',   nombre: 'Costo de Mercancías Vendidas',    tipo: 'costo', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'Costo de inventario dado de baja por venta' },
  { codigo: '5.1.02',   nombre: 'Compras de Mercancías',           tipo: 'costo', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '5.1.03',   nombre: 'Devoluciones en Compras',         tipo: 'costo', naturaleza: 'acreedora', nivel: 3, permite_movimiento: true },
  { codigo: '5.1.04',   nombre: 'Fletes sobre Compras',            tipo: 'costo', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },

  // ── 6. GASTOS ──────────────────────────────────────────────
  { codigo: '6',        nombre: 'GASTOS',                          tipo: 'gasto', naturaleza: 'deudora', nivel: 1, permite_movimiento: false },
  { codigo: '6.1',      nombre: 'Gastos de Operación',             tipo: 'gasto', naturaleza: 'deudora', nivel: 2, permite_movimiento: false },
  { codigo: '6.1.01',   nombre: 'Sueldos y Salarios',              tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.02',   nombre: 'INSS Patronal',                   tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: '22.5% sobre planilla – deducible IR (LCT art. 39)' },
  { codigo: '6.1.03',   nombre: 'INATEC',                          tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: '2% sobre planilla – deducible IR' },
  { codigo: '6.1.04',   nombre: 'Vacaciones',                      tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.05',   nombre: 'Aguinaldo',                       tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.06',   nombre: 'Indemnización',                   tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.07',   nombre: 'Alquileres',                      tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.08',   nombre: 'Servicios Básicos',               tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'Agua, luz, teléfono, internet' },
  { codigo: '6.1.09',   nombre: 'Publicidad y Mercadeo',           tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.10',   nombre: 'Materiales y Suministros',        tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.11',   nombre: 'Gastos de Transporte',            tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.12',   nombre: 'Mantenimiento y Reparaciones',    tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.13',   nombre: 'Gastos Legales y Notariales',     tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.14',   nombre: 'Honorarios Profesionales',        tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'Sujeto a retención IR 10% persona natural' },
  { codigo: '6.1.15',   nombre: 'Seguros',                         tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.16',   nombre: 'Depreciación del Ejercicio',      tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'Dep. anual según art. 45 LCT' },
  { codigo: '6.1.17',   nombre: 'Amortización del Ejercicio',      tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.18',   nombre: 'IMI – Impuesto Municipal',        tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: '1% ingresos brutos – deducible IR parcialmente' },
  { codigo: '6.1.19',   nombre: 'Comisiones y Gastos Bancarios',   tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.1.20',   nombre: 'Gastos de Viaje y Viáticos',      tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.2',      nombre: 'Gastos Financieros',              tipo: 'gasto', naturaleza: 'deudora', nivel: 2, permite_movimiento: false },
  { codigo: '6.2.01',   nombre: 'Intereses Bancarios',             tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'Deducible hasta 1.5x tasa prom BCN (LCT art. 48)' },
  { codigo: '6.2.02',   nombre: 'Pérdida Cambiaria',               tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
  { codigo: '6.3',      nombre: 'Gastos No Deducibles',            tipo: 'gasto', naturaleza: 'deudora', nivel: 2, permite_movimiento: false },
  { codigo: '6.3.01',   nombre: 'Multas y Recargos DGI',           tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'No deducibles del IR (LCT art. 43)' },
  { codigo: '6.3.02',   nombre: 'Gastos Personales',               tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true, descripcion: 'No deducibles del IR' },
  { codigo: '6.3.03',   nombre: 'Otros Gastos No Deducibles',      tipo: 'gasto', naturaleza: 'deudora', nivel: 3, permite_movimiento: true },
]

// ── Función para insertar el plan en Supabase ──────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedPlanCuentas(
  supabase: any,
  empresaId: string
): Promise<{ error: string | null }> {
  try {
    // Verificar si ya existe plan para esta empresa
    const { count } = await supabase
      .from('plan_cuentas')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)

    if ((count ?? 0) > 0) {
      return { error: null } // Ya tiene plan de cuentas
    }

    // Insertar en orden para respetar relaciones padre-hijo
    const niveles = [1, 2, 3, 4]
    for (const nivel of niveles) {
      const cuentasNivel = PLAN_CUENTAS_NICARAGUA.filter(c => c.nivel === nivel)
      if (cuentasNivel.length === 0) continue

      const cuentasConId = await Promise.all(
        cuentasNivel.map(async (cuenta) => {
          let padre_id = null

          if (cuenta.nivel > 1) {
            const partes = cuenta.codigo.split('.')
            const codigoPadre = partes.slice(0, partes.length - 1).join('.')

            const { data: padre } = await supabase
              .from('plan_cuentas')
              .select('id')
              .eq('empresa_id', empresaId)
              .eq('codigo', codigoPadre)
              .single()

            padre_id = padre?.id ?? null
          }

          return {
            empresa_id: empresaId,
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            tipo: cuenta.tipo,
            naturaleza: cuenta.naturaleza,
            nivel: cuenta.nivel,
            permite_movimiento: cuenta.permite_movimiento,
            descripcion: cuenta.descripcion ?? null,
            padre_id,
          }
        })
      )

      const { error } = await supabase.from('plan_cuentas').insert(cuentasConId)
      if (error) return { error: error.message }
    }

    // Crear período contable para el mes/año actual
    const ahora = new Date()
    await supabase.from('periodos_contables').upsert({
      empresa_id: empresaId,
      anio: ahora.getFullYear(),
      mes: ahora.getMonth() + 1,
      estado: 'abierto',
      nombre: `Período ${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`,
      fecha_inicio: new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().slice(0, 10),
      fecha_fin: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).toISOString().slice(0, 10),
    }, { onConflict: 'empresa_id,anio,mes', ignoreDuplicates: true })

    return { error: null }
  } catch (e) {
    return { error: String(e) }
  }
}
