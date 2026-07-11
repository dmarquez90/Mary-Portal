# Auditoría técnica y contable — SARA ERP
**Fecha:** 11 de julio de 2026
**Alcance:** cálculos de nómina, tributación, asientos automáticos (TS + triggers SQL), estados financieros, relaciones entre módulos.

> No se modificó ningún archivo. Este documento solo reporta hallazgos y propuestas.

---

## 1. BUGS CRÍTICOS (afectan la contabilidad hoy)

### 1.1 Doble asiento de nómina al aprobar planilla
- `POST /api/nomina/planillas` crea el asiento de devengado al **calcular** la planilla (estado `calculada`).
- `PATCH aprobar` vuelve a llamar `crearAsientoPlanilla` y crea un **segundo asiento idéntico** (la función TS no verifica duplicados; el trigger SQL sí, pero el TS no).
- **Efecto:** gastos de nómina duplicados en Diario, Mayor y Estado de Resultados.
- **Fix:** crear el asiento solo al aprobar, o agregar chequeo de duplicado por `referencia_tipo + referencia_id` en `crearAsientoPlanilla` (idealmente un `UNIQUE` en BD, ver §4.2).

### 1.2 Planilla con adelantos/préstamos queda SIN asiento
En `crearAsientoPlanilla` (src/lib/nomina/asientos.ts) los créditos son: neto + INSS lab + INSS pat + INATEC + IR + provisiones. Pero `neto = bruto − INSS − IR − adelantos − préstamos − otros descuentos`. Si algún empleado tiene adelantos, préstamos INSS u otros descuentos, **débitos ≠ créditos**, la función detecta el descuadre, devuelve `null` y la planilla queda aprobada **sin asiento contable** (fallo silencioso).
- **Fix:** agregar línea de crédito por adelantos (contra la cuenta de activo "Adelantos a empleados" — habría que crearla, p.ej. `1.1.13`) y por otros descuentos.

### 1.3 La depreciación NUNCA llega a contabilidad
El trigger `fn_contabilizar_depreciacion` (migración `20260628234542`) busca la cuenta de gasto `6.2.12`, **que no existe en el plan**, y aborta en silencio. El API de depreciación tampoco crea asiento.
- **Efecto:** Estado de Resultados línea G002 (Depreciación 6.1.16) siempre C$0; el Balance no refleja depreciación acumulada; el gasto deducible del Art. 45 LCT no aparece en libros aunque sí en el F-106 (inconsistencia libros vs declaración).
- Además, si existiera la cuenta, el trigger acreditaría `1.2.02/1.2.04/1.2.06` (Equipos de Cómputo, Vehículos y **Terrenos** — activos brutos) en vez de `1.2.07–1.2.11` (Dep. Acumulada).
- **Fix:** reescribir el trigger para debitar `6.1.16` y acreditar la Dep. Acumulada correcta según categoría del activo.

### 1.4 Nota de Crédito debita "Ventas Exentas de IVA" en vez de "Devoluciones"
`fn_contabilizar_nota_credito` debita `4.1.03`. En el plan real, `4.1.03 = Ventas Exentas de IVA`; devoluciones es `4.1.04`.
- **Efecto:** cada NC infla/contamina la cifra de ventas exentas — esto distorsiona directamente la **Planilla de Ingresos del VET** y la DMI (casilla de ingresos exentos), y el renglón I002 del Estado de Resultados nunca refleja devoluciones.
- **Fix:** cambiar a `4.1.04` en el trigger.

### 1.5 Liquidación de IR anual sin cuenta de gasto (asiento incorrecto)
`asientoIRAnualLiquidacion` debita `2.1.04 IR por Pagar` (pasivo) por el IR total y acredita anticipos/retenciones/saldo. Nunca se reconoce el **Gasto por IR** (no existe cuenta 6.x para ello).
- **Efecto:** `2.1.04` queda con saldo **deudor** por el monto de anticipos + retenciones (pasivo negativo en el Balance); la utilidad neta en libros nunca refleja el IR.
- Relacionado: en `estados-financieros.ts`, R002 toma movimientos de `2.1.04` y R003 **resta** movimientos de `1.1.10` (anticipos, un activo) para llegar a "Utilidad Neta" — mezcla cuentas de balance en el Estado de Resultados y descuenta anticipos dos veces (los anticipos no son gasto).
- **Fix:** crear cuenta `6.4.01 Gasto por Impuesto sobre la Renta`; asiento correcto: DB 6.4.01 (ir_a_pagar) / CR 1.1.10 (anticipos) / CR 1.1.11 (retenciones) / CR 2.1.04 (saldo neto). En el ER, R002 debe leer `6.4.01` y eliminar R003.

### 1.6 Trigger de planilla en SQL con mapa de cuentas totalmente corrido
`fn_contabilizar_planilla` (misma migración) usa: sueldos → `6.2.01` (**Intereses Bancarios**), INSS patronal → `6.2.02` (**Pérdida Cambiaria**), INATEC/provisiones → `6.2.03–6.2.06` (no existen), INSS patronal por pagar → `2.1.05` (**Anticipos IR por Enterar**), IR salarios → `2.1.08` (**INSS Laboral**), aguinaldo → `2.1.10` (**Sueldos por Pagar**), neto → `2.1.02` (Otras CxP)…
Hoy está "dormido" porque el API crea el asiento antes y el trigger se salta por duplicado, **pero si el API falla, este trigger contamina la contabilidad con cuentas equivocadas**. Lo mismo aplica al trigger de anticipo IR, que debita `1.1.09` (**IVA Crédito Fiscal**) en vez de `1.1.10`.
- **Fix:** nueva migración que alinee (o elimine) los 3 triggers de `20260628234542` (planilla, depreciación, anticipo) con el plan real. Hay **dos motores contables en paralelo** (librerías TS + triggers SQL) con mapas distintos — ver propuesta §5.1.

### 1.7 Posible error al emitir factura directamente (INSERT)
`fn_contabilizar_factura` evalúa `OLD.estado` y su trigger es `AFTER INSERT OR UPDATE`. En PostgreSQL, referenciar `OLD` en un INSERT lanza "record old is not assigned yet". Si el formulario inserta la factura ya con estado `emitida` (así lo hace `ventas/nueva`), el INSERT puede fallar o comportarse errático.
- **Fix:** iniciar la función con `IF TG_OP = 'UPDATE' AND OLD.estado = 'emitida' THEN RETURN NEW; END IF;` (verificar en Supabase con una factura de prueba).

---

## 2. ERRORES DE CÁLCULO FISCAL / LEGAL

### 2.1 IR anual: 30% plano para todos
El F-106 aplica siempre `renta_neta × 0.30`. El Art. 52 LCT establece **tarifa progresiva (10%–30%)** para contribuyentes con ingresos brutos anuales ≤ C$12 millones. Un negocio pequeño pagaría de más.
- **Fix:** aplicar la tabla progresiva cuando `renta_bruta ≤ 12,000,000`.

### 2.2 PMD fijo en 1%
Desde la reforma de 2019 (Ley 987), el pago mínimo definitivo es **1%, 2% o 3%** según la categoría del contribuyente (resto / principales / grandes). Igual aplica al anticipo mensual.
- **Fix:** campo configurable por empresa (como ya hicieron con INSS patronal).

### 2.3 Costo de ventas del F-106 = total de compras del año
El cálculo automático usa `SUM(compras.subtotal)` como costo de ventas. Eso es **compras**, no costo de ventas (ignora variación de inventario). El sistema ya calcula el costo real (cuenta `5.1` vía `fn_costear_linea_venta`) — úsenlo.
- **Efecto:** renta neta gravable distorsionada en cualquier año donde el inventario suba o baje.

### 2.4 Retención 2% sin umbral de C$1,000
En compras se retiene 2% desde C$0.01. El Reglamento LCT (Art. 44, num. 2.2) aplica la retención a compras de bienes y servicios **mayores a C$1,000**.
- **Fix:** no sugerir/aplicar retención código 22 si `subtotal < 1000` (permitir override manual).

### 2.5 Vencimiento del anticipo IR: día 5
`anticipos-ir/route.ts` fija el vencimiento el día 5 del mes siguiente. El plazo de **5 días hábiles aplica a retenciones**; el anticipo IR/PMD se declara en la DMI dentro de los primeros **15 días** del mes siguiente. Verificar con el calendario tributario DGI vigente y corregir.

### 2.6 Renta bruta del F-106 solo desde el módulo de facturas
Ignora ingresos registrados por asientos manuales u otros ingresos (4.2.x). Derivarla de contabilidad (saldo 4.x del año) y conciliar contra facturación.

### 2.7 Nómina: prorrateo por días trabajados mal aplicado
En `calcularEmpleadoPlanilla` el factor `dias_trabajados/30` se aplica sobre el bruto **completo**, incluyendo horas extra, comisiones y bonificaciones. Esos conceptos son montos ya devengados y no deben prorratearse (si trabajó 15 días y ganó C$1,000 de comisión, el sistema paga C$500).
- Además el resultado devuelve `valorHorasExtra` sin prorratear pero `salarioBruto` prorrateado → el detalle impreso de la colilla no suma.
- **Fix:** prorratear solo el salario base: `bruto = base×(días/30) + HE + comisiones + bonos + otros`.

### 2.8 Liquidación: renuncia sin indemnización
`calcularLiquidacion` excluye `renuncia` de la indemnización. En Nicaragua (Arts. 43 y 45 CT), el trabajador que renuncia **con preaviso de 15 días** conserva el derecho a la indemnización por antigüedad. Consúltenlo con su contador/abogado laboral, pero tal como está probablemente subliquida.
- También falta: retención IR sobre vacaciones pagadas y salario pendiente en la liquidación, y la regla de indemnización **exenta hasta C$500,000** (10% sobre el exceso) del Art. 19 LCT.

---

## 3. OBSERVACIONES DE ESTADOS FINANCIEROS

- **Flujo de Efectivo:** "Pago de Préstamos Bancarios" lee la cuenta `6.2.01` (Intereses Bancarios — eso es gasto financiero, no amortización de principal) y "Venta de Activos Fijos" lee `4.2.02` (utilidad en venta, no el efectivo recibido). Ambos renglones quedan mal en cuanto haya préstamos o venta de activos.
- El fix de `get_saldos_multiple` que excluye asientos de cierre para cuentas 4/5/6 está bien resuelto. ✔
- El Balance usa saldo acumulado desde 2000-01-01 — correcto, pero depende de que 1.5 y 1.3 se corrijan para cuadrar.

---

## 4. BUGS TÉCNICOS / INTEGRIDAD

1. **Numeración de asientos con condición de carrera:** `get_next_numero_asiento` (y sus copias en TS) hacen `MAX(numero)+1` sin bloqueo. Dos operaciones simultáneas generan el mismo `numero_asiento`. No encontré `UNIQUE` que lo detecte. Fix: `UNIQUE(empresa_id, periodo_anio, periodo_mes, numero)` + advisory lock o secuencia por empresa.
2. **Sin protección contra asientos duplicados a nivel BD:** agregar `UNIQUE (empresa_id, referencia_tipo, referencia_id) WHERE estado <> 'anulado'` (índice parcial). Esto elimina de raíz el bug 1.1 y protege todos los flujos.
3. **Fallos silenciosos por diseño:** casi todos los generadores de asientos devuelven `null` si falta una cuenta o no cuadra, y la operación de negocio sigue (pago marcado "pagado" sin asiento). Debería fallar la transacción completa o al menos registrar en una tabla `alertas_contables` visible en el dashboard.
4. **Acumulados IR/prestaciones se actualizan al CREAR la planilla** (estado `calculada`), no al aprobar. Si se recalcula o borra una planilla del mismo período, los acumulados quedan duplicados o huérfanos. Fix: mover la actualización al momento de aprobar y revertirla al anular/eliminar; agregar `UNIQUE(empresa_id, periodo_anio, periodo_mes)` en `planillas` (si no existe).
5. **Anulación de factura:** decide si ya hubo NC total con un umbral heurístico del 95% del total — frágil; mejor un flag explícito o comparar contra la suma real de NCs vigentes.
6. **Redondeo de IVA:** en ventas se suma el IVA por línea sin redondear cada línea antes (`s + calcLinea(l).iva`); redondear por línea y luego sumar para que el impreso cuadre centavo a centavo con la BD.

---

## 5. PROPUESTAS DE MEJORA (priorizadas)

### 5.1 Un solo motor contable (la mejora más importante)
Hoy conviven **dos motores**: librerías TS (`src/lib/*/asientos.ts`) y triggers SQL, con mapas de cuentas distintos y chequeos de duplicado desiguales. Propuesta:
- Mover toda la generación de asientos a **funciones SQL** (transaccionales, no se saltan con fallos de red del API) y que el API solo cambie estados.
- Crear una tabla `cuentas_evento (empresa_id, evento, codigo_cuenta)` para mapear evento→cuenta de forma configurable, en vez de códigos "hardcodeados" en 10 archivos.

### 5.2 Corto plazo (orden sugerido de corrección)
1. NC → `4.1.04` (bug 1.4, afecta VET directamente).
2. Depreciación → trigger nuevo con `6.1.16` / `1.2.07–11` (bug 1.3) + asiento retroactivo de ajuste.
3. Doble asiento + descuadre de planilla (bugs 1.1, 1.2) + UNIQUE de referencia (4.2).
4. Gasto IR `6.4.01` + corrección del asiento de liquidación y del ER (bug 1.5).
5. Neutralizar los triggers corridos de la migración `20260628234542` (bug 1.6).
6. Guard `TG_OP` en `fn_contabilizar_factura` (bug 1.7).
7. Retención con umbral C$1,000, tarifa progresiva IR, PMD configurable, costo de ventas real en F-106 (§2).
8. Prorrateo de nómina y reglas de liquidación (§2.7, 2.8).

### 5.3 Calidad y confianza
- **Tests unitarios** para `calculos.ts` (nómina) y los cálculos de tributación: son funciones puras, fáciles de testear; casos: salario en cada tramo IR, días parciales, adelantos, régimen IVM-RP.
- **Test de cuadre global:** query programada que verifique `SUM(debe) = SUM(haber)` por asiento y que Activo = Pasivo + Patrimonio por empresa; mostrar alerta en dashboard si descuadra.
- **Trigger de validación en `asientos_detalle`:** al cerrar la transacción, que el total del detalle coincida con `total_debe/total_haber` de la cabecera.
- Renombrar `TABLA_IR_LABORAL_2024` (los tramos del Art. 23 no cambian cada año) y moverla a configuración para cuando la ley cambie.

---

## 6. Lo que está bien hecho ✔
- Tabla progresiva IR laboral (Art. 23) y método de proyección acumulada: correctos.
- Tasas INSS 7% / 21.5–22.5% configurable / INATEC 2% / provisiones 8.33%: correctas.
- IVA 15% con manejo de líneas exentas por producto.
- Manejo de pérdida fiscal (no forzar renta a 0) y PMD sobre renta bruta: bien razonado.
- Multi-moneda: asiento siempre en córdobas y lado operativo convertido — enfoque correcto.
- Exclusión de asientos de cierre en cuentas de resultado: bien resuelto.
- Validador VET de cuadre planilla vs libro de ventas: buena idea, consérvenlo y amplíenlo.
