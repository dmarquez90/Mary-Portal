# Resumen de correcciones y mejoras — SARA ERP
**Fecha:** 11 de julio de 2026
**Estado:** TypeScript compila sin errores ✔ · Migración aplicada a Supabase (SARA-app) ✔ · Datos históricos reparados ✔

---

## 1. Base de datos (migración `20260711120000_auditoria_correcciones_integrales.sql` — YA APLICADA)

**Cuentas nuevas en el plan (creadas para todas las empresas existentes y para las nuevas):**
`6.4 / 6.4.01 IR del Ejercicio` (gasto por IR anual), `1.1.13 Adelantos y Préstamos a Empleados`, y en el seed: `6.1.21 ISC` y `2.1.18 ISC por Pagar`.

**Triggers corregidos:**
1. **Nota de crédito** ahora debita `4.1.04 Devoluciones en Ventas` (antes `4.1.03 Ventas Exentas` — contaminaba la Planilla de Ingresos del VET). Las NC históricas fueron reclasificadas.
2. **Depreciación** ahora sí se contabiliza: DB `6.1.16` / CR `1.2.07–1.2.11` según categoría del activo (antes buscaba una cuenta inexistente y nunca generaba asiento). Se contabilizaron retroactivamente todas las depreciaciones históricas que estaban sin asiento.
3. **Planilla (trigger de respaldo)** usa los códigos correctos del plan (antes mandaba sueldos a "Intereses Bancarios" y los pasivos quedaban corridos). Incluye adelantos → `1.1.13` y otros descuentos → `2.1.02`.
4. **Anticipo IR** debita `1.1.10 IR Pagado por Anticipado` (antes `1.1.09 IVA Crédito Fiscal`).
5. **Facturas y compras**: guard `TG_OP` que evita el error al emitir/recibir directamente por INSERT.
6. **Compras**: el trigger ya NO sobreescribe la retención elegida en el formulario con un 2% plano; respeta el código DGI (ej. 10% servicios profesionales) y aplica el umbral de C$1,000.
7. **Numeración de asientos** con advisory lock (elimina correlativos duplicados bajo concurrencia). Todas las librerías usan ahora el mismo RPC.

**Reparación de datos históricos:** asientos de planilla duplicados anulados, NC reclasificadas, liquidaciones IR reclasificadas a gasto. Verificado: **0 asientos descuadrados** en la base.

**Configuración nueva:** columna `pmd_alicuota` (1%/2%/3% según categoría DGI) en ambas tablas de empresa, editable en Configuración.

## 2. Nómina
- **Doble asiento eliminado:** el devengado se contabiliza solo al APROBAR la planilla (antes se creaba al calcular Y al aprobar → gasto duplicado). Además hay chequeo de duplicados en la librería y en el trigger.
- **Adelantos/préstamos/otros descuentos** ya no descuadran el asiento (antes la planilla quedaba SIN contabilizar en silencio): se acreditan a `1.1.13` y `2.1.02`.
- **Prorrateo por días trabajados** ahora solo afecta el salario base — las horas extra, comisiones y bonos se pagan completos.
- **Pago de nómina:** nuevos botones "Pagar por banco / caja" en la planilla aprobada; genera el asiento de pago (DB `2.1.10` / CR banco o caja). Antes el pago nunca tocaba caja/banco en libros.
- **Liquidación:** la renuncia con preaviso conserva la indemnización (Arts. 43/45 CT); se calcula la exención de C$500,000 y el 10% sobre el exceso (Art. 19 LCT).

## 3. Tributación
- **IR anual (F-106):**
  - Tarifa progresiva del Art. 52 LCT (10–30%) para ingresos ≤ C$12 millones; 30% solo arriba de eso.
  - Costo de ventas real desde contabilidad (cuenta 5.1), no el total de compras.
  - PMD con alícuota configurable (Ley 987).
  - El asiento de liquidación reconoce el **Gasto por IR (6.4.01)**; `2.1.04` ya no queda con saldo deudor. Si anticipos+retenciones exceden el IR, el excedente queda como saldo a favor (activo).
- **Anticipo IR:** alícuota configurable y vencimiento el día 15 del mes siguiente (el día 5 es para retenciones).
- **Retenciones en compras:** umbral legal de C$1,000 para el 2% general (código 22/23); nueva función `calcularRetencion()` usada en compras nueva y editar.

## 4. Estados financieros
- **Estado de Resultados:** la utilidad neta se calcula como Utilidad antes de IR − Gasto IR (6.4). Se eliminó el renglón que restaba anticipos (descontaba el IR dos veces). Se agregó `6.1.21 ISC` a gastos operativos.
- **Flujo de Efectivo:** corregidos los signos de todas las cuentas acreedoras (CxP, IVA, retenciones, préstamos, capital — estaban invertidos); la utilidad se deriva de las cuentas de resultado (antes usaba 3.2.03 y daba 0 en períodos abiertos); "pago de préstamos" ya no usa la cuenta de intereses; venta de activos tratada correctamente como ajuste.
- **Balance:** `1.1.13` y `2.1.18` integrados a las secciones correspondientes.

## 5. Ventas / POS
- Redondeo del IVA por línea antes de sumar (los totales cuadran centavo a centavo con la BD) en ventas nueva, editar y POS.

## 6. Pendiente de tu lado
1. **Commit y push a GitHub** para que Vercel despliegue el código corregido (la BD ya está actualizada; el código corre en tu máquina/repo).
2. En **Configuración**, revisa la nueva alícuota PMD de tu empresa (quedó en 1% por defecto).
3. Si tienes planillas históricas con adelantos que quedaron sin asiento, re-aprobar no es necesario: al no existir asiento, puedes regenerarlo aprobando desde la interfaz (el sistema detecta duplicados y no repite).
4. Recomendado a futuro: tests unitarios para `calculos.ts` y consolidar toda la contabilización en SQL (hoy el API crea los asientos y los triggers actúan de respaldo).

> Nota: soy una IA, no un contador autorizado — valida las reglas fiscales (tarifa progresiva, PMD, umbral de retención, indemnización en renuncia) con tu contador antes de declarar en el VET.
