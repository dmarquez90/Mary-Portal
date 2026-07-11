# Manual rápido de registros — SARA ERP
Cómo registrar cada operación y qué hace el sistema en contabilidad automáticamente.

---

## 1. Configuración inicial (una sola vez)
En **Dashboard → Configuración**:
1. Datos de la empresa (RUC, régimen tributario, actividades económicas).
2. **Tasa INSS patronal:** 21.5% si tienes menos de 50 empleados, 22.5% si tienes 50 o más.
3. **Alícuota PMD / Anticipo IR:** 1% (resto), 2% (principales) o 3% (grandes contribuyentes), según la categoría que te asignó la DGI.
4. En **Caja y Bancos**, crea tus cuentas de caja y bancarias (córdobas y/o dólares). Si usas dólares, registra la tasa de cambio del día en **Tasa de Cambio** antes de operar.

## 2. Ventas
1. **Dashboard → Ventas → Nueva factura** (o el **POS** para ventas de mostrador con sesión de caja).
2. Agrega las líneas. El check "IVA" viene del producto: desmárcalo solo para productos exentos (canasta básica, Art. 127 LCT).
3. Elige el tipo de pago: contado (caja), crédito (CxC), transferencia/cheque/tarjeta (banco).
4. Al **Emitir**, el sistema hace solo: asiento de venta (Caja/CxC/Banco contra Ventas 4.1.01 e IVA 2.1.03), movimiento de caja o banco, rebaja de inventario y asiento de costo de ventas (5.1).

**Devolución:** usa **Notas de Crédito** (o POS → Devolución). Genera el asiento a `4.1.04 Devoluciones`, revierte el IVA y restaura el stock. Nunca edites una factura emitida; si está mal, anúlala o emite NC.

**Cobro de facturas al crédito:** **CxC → Abonos**. Cada abono debita caja/banco y acredita CxC.

## 3. Compras
1. **Dashboard → Compras → Nueva**.
2. Si el proveedor es persona natural, selecciona el **código de retención DGI** (2% general, 10% servicios profesionales, etc.). El sistema aplica el umbral legal: compras de C$1,000 o menos con código 22/23 no llevan retención.
3. Al marcar **Recibida**: entra el inventario (1.1.08), se registra el IVA crédito (1.1.09), la retención queda como pasivo (2.1.06) y se paga el neto por caja/banco o queda en CxP.
4. La retención acumulada del mes se declara en **Tributación → Retenciones** (se entera a la DGI en los primeros 5 días hábiles del mes siguiente).

## 4. Nómina (flujo mensual)
1. **Nómina → Planilla → Nueva**: ingresa días trabajados, horas extra, comisiones, adelantos, etc. El sistema calcula INSS 7%, IR laboral (tabla progresiva con acumulados), INSS patronal, INATEC y provisiones (vacaciones/aguinaldo/indemnización, 8.33% c/u). Estado: *calculada* — todavía sin contabilizar.
2. **Aprobar y contabilizar**: genera el asiento de devengado (gastos 6.1.01–06 contra pasivos 2.1.07–2.1.14; adelantos a 1.1.13).
3. **Pagar por banco / Pagar por caja** (botones nuevos): genera el asiento de pago del neto (2.1.10 contra banco/caja) y marca la planilla *pagada*.
4. Los reportes INSS, INATEC e IR laboral salen de **Nómina → Reportes**.

Regla práctica: **una planilla por mes**. Si te equivocaste, corrígela antes de aprobar.

## 5. Impuestos mensuales
- **Anticipo IR (PMD):** Tributación → Anticipos IR → calcular mes → marcar **Pagado** cuando pagues en el VET. Asiento automático: 1.1.10 contra caja/banco. Vence el 15 del mes siguiente.
- **IMI (alcaldía):** Tributación → IMI → calcular (1% ingresos) → marcar pagado. Genera gasto 6.1.18 y luego el pago.
- **IVA (DMI):** el sistema acumula débito (2.1.03) y crédito fiscal (1.1.09) automáticamente con cada venta/compra; el reporte para la DMI sale de **Reportes → DGI / VET**.

## 6. IR Anual (F-106)
1. **Tributación → IR Anual → Calcular automático**: toma ingresos, costo de ventas real (cuenta 5.1), nómina, depreciación, IMI pagado; aplica la tarifa del Art. 52 (progresiva si facturas ≤ C$12M, 30% si más) y compara contra el PMD.
2. Revisa y agrega gastos manuales si faltan. **Presentar** genera el asiento: Gasto IR (6.4.01) contra anticipos (1.1.10), retenciones a favor (1.1.11) y el saldo en 2.1.04.
3. **Pagar** cancela el 2.1.04 contra caja/banco.

## 7. Activos fijos
1. Registra el activo con su categoría y vida útil (el sistema sugiere las tasas del Art. 45 LCT).
2. Corre la **depreciación mensual**: ahora sí genera asiento automático (gasto 6.1.16 contra depreciación acumulada 1.2.07–1.2.11).

## 8. Cierre y estados financieros
- **Estados Financieros**: Balance General, Estado de Resultados, Flujo de Efectivo y Cambios en el Patrimonio se calculan solos desde los asientos. Revisa que "Diferencia de cuadre" del balance sea 0.
- **Cierre contable** (fin de mes/año): traslada ingresos y gastos a Utilidad del Ejercicio (3.2.03). Hazlo solo cuando el período esté completo.
- **VET**: usa **Dashboard → VET** para generar y validar la Planilla de Ingresos y demás reportes antes de subirlos al portal de la DGI (el validador avisa si la planilla no cuadra con el libro de ventas).

## 9. Reglas de oro
1. Nada se contabiliza en estado *borrador/calculada* — solo al emitir/recibir/aprobar.
2. No edites documentos ya contabilizados: anula o usa notas de crédito/débito.
3. Si usas cuentas en dólares, registra la tasa de cambio ANTES de operar ese día.
4. Revisa el Diario (Contabilidad → Diario) después de operaciones importantes: cada documento debe tener su asiento con debe = haber.
