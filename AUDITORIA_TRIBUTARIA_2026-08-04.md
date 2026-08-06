# Auditoría fiscal y contable — SICONIC ERP
**Fecha:** 4 de agosto de 2026
**Alcance:** Municipal (IMI/Matrícula), IR Anual/PMD/Anticipos, Retenciones, ISC, Nómina (INSS/INATEC), validador VET.
**Método:** inspección directa del código (`src/`, `supabase/migrations/`), consulta a la base de datos real (`sisco-nicaragua`) y verificación de puntos legales clave contra fuentes actuales cuando había duda.

> No se corrigió nada más allá de lo ya autorizado (bug del IVA en IMI, confirmado por ti antes). El resto de hallazgos está aquí para que decidas qué corregir y en qué orden, como pediste.

---

## Antes que nada: honestidad sobre mis límites

No soy contador público autorizado ni abogado — soy una IA que lee el código y contrasta contra la ley que puedo consultar. Para los puntos donde no encontré una fuente primaria (Gaceta/texto oficial) sino artículos de firmas contables o resúmenes, lo digo explícitamente. Antes de presentar cualquier declaración real ante DGI, INSS o la Alcaldía, valida los montos grandes con tu contador. Eso no es una fórmula de cortesía — es literalmente la única forma honesta de decirte "hice lo que pude verificar, pero esto no reemplaza a un profesional matriculado."

---

## 1. Hallazgos NUEVOS de esta auditoría (no reportados antes)

### 1.1 El validador VET usa tasas de INSS obsoletas — invalida su propio propósito
`src/lib/validaciones/vet-compliance.ts`, función `validarNominaINSS`, compara la nómina contra **INSS obrero 6.25% / INSS patronal 14.75%**.

El motor real de nómina (`src/lib/nomina/calculos.ts`, `TASAS_NOMINA`) usa **INSS laboral 7%** y **INSS patronal 21.5%–22.5%** (Decreto 06-2019, régimen integral) — que es lo correcto y ya fue verificado en la auditoría del 11 de julio.

**Efecto:** cualquier nómina calculada *correctamente* con el motor real va a disparar una advertencia falsa en el validador VET, porque el validador la compara contra un 14.75% patronal que ya no existe desde la reforma de 2019. Es un validador de consistencia que hoy está inconsistente consigo mismo.
**Prioridad:** alta — es barato de corregir (dos constantes) y el propósito del validador es justamente evitar que se presente algo mal a la DGI; ahora mismo hace lo contrario, genera ruido.

### 1.2 Cuenta 6.4.01 mal rotulada en la base de datos real
En el plan de cuentas de las dos empresas activas en Supabase, la cuenta `6.4.01` aparece con el nombre **"Anticipo IR (1% PMD)"**, pero el trigger de liquidación del IR anual (migración del 11-jul) la usa para el **gasto por IR del ejercicio** (la liquidación anual, no el anticipo mensual). El anticipo mensual sí va correctamente a `1.1.10` (activo) — ese código está bien. El problema es solo el rótulo de `6.4.01` en la base viva: no coincide con lo que el sistema realmente contabiliza ahí.

**Por qué importa:** si tu contador o cualquiera revisa el Estado de Resultados o el plan de cuentas, va a ver "Anticipo IR (1% PMD)" cargado con el gasto del IR anual — confuso y potencialmente engañoso al conciliar con el F-106.
**Causa probable:** la cuenta ya existía con ese nombre antes de que corriera la migración del 11-jul (que solo inserta si el código no existe), así que el `IF NOT EXISTS` se saltó el nombre correcto ("IR del Ejercicio").
**Prioridad:** alta, corrección simple (`UPDATE plan_cuentas SET nombre = 'IR del Ejercicio' WHERE codigo = '6.4.01'` en las dos empresas), pero lo dejo para que confirmes antes de tocar datos en producción.

### 1.3 ISC: no hay catálogo de tasas por producto, todo es manual
El módulo ISC (`src/app/api/tributacion/isc/route.ts`) recibe `tasa` y `base_imponible` como campos libres del formulario — no existe un catálogo como el de retenciones (`retenciones-catalogo.ts`) con las tasas por partida (bebidas alcohólicas, cigarrillos, gaseosas, vehículos, etc., Anexos I-III de la LCT).
**Matiz honesto:** los Anexos del ISC tienen cientos de partidas arancelarias — un catálogo completo es un proyecto en sí mismo, probablemente no vale la pena para la mayoría de negocios que no venden productos gravados con ISC. Si tus clientes objetivo no manejan alcohol/tabaco/gaseosas/vehículos, esto es bajo impacto.
**Prioridad:** baja, salvo que tengas clientes que sí facturan productos con ISC — en ese caso dime cuáles categorías priorizar y armo un catálogo acotado (no los cientos de partidas completas).

---

## 2. Confirmado: lo que ya se corrigió el 11-jul sigue intacto hoy

Revisé el código y la base de datos actual, no solo el documento de esa fecha:
- Nota de crédito → debita `4.1.04` (Devoluciones), no `4.1.03` (Ventas Exentas). ✔ confirmado en el trigger vigente.
- Depreciación → contabiliza a `6.1.16` / `1.2.07-11`. ✔ confirmado.
- Anticipo IR mensual → `1.1.10` (activo), no `1.1.09` (IVA Crédito Fiscal). ✔ confirmado.
- `pmd_alicuota` configurable (1%/2%/3%, Ley 987) existe en ambas tablas de empresa y el API de IR anual la lee correctamente. ✔ confirmado.
- Retenciones: catálogo con umbral de C$1,000 para el código 22 (compra de bienes/servicios en general) y sin umbral para arrendamiento, agropecuario, madera, servicios profesionales — consistente con el Art. 44 del Reglamento LCT. ✔ confirmado.

## 3. IR Anual (F-106): verificado con investigación adicional

El código aplica la tarifa del Art. 52 LCT como **no marginal** — es decir, la alícuota del estrato donde cae la renta neta se aplica sobre el **total** de la renta neta, no solo sobre el excedente (a diferencia de la tabla de rentas del trabajo del Art. 23, que sí es marginal). Confirmé esto con una búsqueda adicional porque es un punto donde un error es costoso, y las fuentes que encontré (no el texto oficial de la Gaceta, sino resúmenes de firmas y guías fiscales) coinciden con lo que ya tenía el código. **Confianza media-alta, no absoluta** — te recomiendo que la próxima vez que declares un F-106 grande, tu contador confirme el monto contra el texto vigente antes de presentar.

Estratos vigentes en el código (renta neta anual, solo aplica si ingresos brutos ≤ C$12,000,000):
- C$0 – 100,000 → 10%
- 100,000.01 – 200,000 → 15%
- 200,000.01 – 350,000 → 20%
- 350,000.01 – 500,000 → 25%
- > 500,000 → 30%
- Ingresos brutos > C$12,000,000 → 30% plano, sin importar la renta neta.

## 4. Municipal (IMI / Matrícula) — retomando lo de hoy mismo

Ya corregido: base gravable del IMI usa `subtotal - descuento_total`, no `total` con IVA incluido.
Pendiente (ver `ROADMAP_REPORTES_MUNICIPALES_MANAGUA_2026-08-04.md`): notas de crédito no se restan de la base del IMI, no hay tasa configurable por municipio, y la matrícula anual (2% + 1% certificado) no está implementada, solo reservada en el esquema.

## 5. Lo que quedó fuera de esta pasada (honesto, no lo revisé a fondo)

- **VET — Libro de Ventas/Compras y exportación al portal:** solo miré la estructura general de `dashboard/vet/page.tsx` y el validador de consistencia; no revisé línea por línea el formato de exportación contra lo que exige el portal VET.
- **Liquidaciones laborales, vacaciones, subsidios INSS por enfermedad:** ya auditado el 11-jul, no repetí la revisión completa hoy, solo confirmé que las tasas base (INSS/INATEC) no cambiaron en el código.
- **Estados financieros (Balance, Flujo de Efectivo):** no re-auditados hoy: el documento del 11-jul ya cubrió los signos y las cuentas mal referenciadas y fueron corregidas; no verifiqué de nuevo cada renglón.

---

## 6. Qué necesito que decidas

No corregí nada de lo nuevo (§1) todavía. Los tres hallazgos son independientes entre sí y de bajo riesgo de romper algo:

1. ¿Corrijo las tasas de INSS en `vet-compliance.ts` (7% / 21.5-22.5%)? — recomendado, es solo texto.
2. ¿Renombro la cuenta `6.4.01` en las dos empresas de producción a "IR del Ejercicio"? — es un `UPDATE` de una fila, pero toca datos reales, prefiero tu visto bueno.
3. ISC: ¿tienes clientes que facturan productos gravados con ISC (licor, cigarrillos, gaseosas, vehículos)? Si sí, dime cuáles categorías para armar el catálogo; si no, lo dejamos como está.

Y decide también si quieres que siga con el pase profundo de VET (Libro de Ventas/Compras y exportación), que quedó fuera de esta auditoría.
