
DO $$
DECLARE
  eid uuid := '1c71f63d-3979-4639-a81c-7e6df095841d';
  pid_1 uuid; pid_11 uuid; pid_12 uuid; pid_13 uuid;
  pid_2 uuid; pid_21 uuid; pid_22 uuid;
  pid_3 uuid; pid_31 uuid; pid_32 uuid; pid_33 uuid;
  pid_4 uuid; pid_41 uuid; pid_42 uuid;
  pid_5 uuid; pid_51 uuid;
  pid_6 uuid; pid_61 uuid; pid_62 uuid; pid_63 uuid;
  anio_actual int := EXTRACT(YEAR FROM now())::int;
  mes_actual  int := EXTRACT(MONTH FROM now())::int;
BEGIN
  -- Salir si ya hay cuentas
  IF EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id = eid) THEN RETURN; END IF;

  -- ── NIVEL 1 ─────────────────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'1','ACTIVO','activo','deudora',1,false) RETURNING id INTO pid_1;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'2','PASIVO','pasivo','acreedora',1,false) RETURNING id INTO pid_2;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'3','PATRIMONIO','patrimonio','acreedora',1,false) RETURNING id INTO pid_3;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'4','INGRESOS','ingreso','acreedora',1,false) RETURNING id INTO pid_4;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'5','COSTOS','costo','deudora',1,false) RETURNING id INTO pid_5;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'6','GASTOS','gasto','deudora',1,false) RETURNING id INTO pid_6;

  -- ── NIVEL 2 – ACTIVO ────────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1','Activo Corriente','activo','deudora',2,false,pid_1) RETURNING id INTO pid_11;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2','Activo No Corriente','activo','deudora',2,false,pid_1) RETURNING id INTO pid_12;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.3','Activo Diferido','activo','deudora',2,false,pid_1) RETURNING id INTO pid_13;

  -- ── NIVEL 2 – PASIVO ────────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1','Pasivo Corriente','pasivo','acreedora',2,false,pid_2) RETURNING id INTO pid_21;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.2','Pasivo No Corriente','pasivo','acreedora',2,false,pid_2) RETURNING id INTO pid_22;

  -- ── NIVEL 2 – PATRIMONIO ────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.1','Capital Social','patrimonio','acreedora',2,false,pid_3) RETURNING id INTO pid_31;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.2','Resultados','patrimonio','acreedora',2,false,pid_3) RETURNING id INTO pid_32;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.3','Dividendos','patrimonio','deudora',2,false,pid_3) RETURNING id INTO pid_33;

  -- ── NIVEL 2 – INGRESOS ──────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.1','Ingresos Operacionales','ingreso','acreedora',2,false,pid_4) RETURNING id INTO pid_41;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2','Ingresos No Operacionales','ingreso','acreedora',2,false,pid_4) RETURNING id INTO pid_42;

  -- ── NIVEL 2 – COSTOS ────────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1','Costo de Ventas','costo','deudora',2,false,pid_5) RETURNING id INTO pid_51;

  -- ── NIVEL 2 – GASTOS ────────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1','Gastos de Operación','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_61;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.2','Gastos Financieros','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_62;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.3','Gastos No Deducibles','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_63;

  -- ── NIVEL 3 – ACTIVO CORRIENTE ──────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.01','Caja General','activo','deudora',3,true,'Efectivo en caja',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.02','Caja Chica','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.03','Banco Moneda Nacional','activo','deudora',3,true,'Cuentas bancarias en Córdobas',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.04','Banco Moneda Extranjera','activo','deudora',3,true,'Cuentas bancarias en USD',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.05','Cuentas por Cobrar Clientes','activo','deudora',3,true,'Facturas de crédito pendientes de cobro',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.06','Otras Cuentas por Cobrar','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.07','Anticipo a Proveedores','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.08','Inventario de Mercancías','activo','deudora',3,true,'Costo de mercancías para venta (LCT art. 44)',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.09','IVA Crédito Fiscal','activo','deudora',3,true,'IVA pagado en compras acreditable contra débito',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.10','IR Pagado por Anticipado','activo','deudora',3,true,'Anticipos IR mensual 1% (LCT art. 63)',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.11','Retenciones IR a Favor','activo','deudora',3,true,'Retenciones en la fuente recibidas de clientes',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.12','Gastos Pagados por Anticipado','activo','deudora',3,true,pid_11);

  -- ── NIVEL 3 – ACTIVO NO CORRIENTE ───────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.01','Edificios e Instalaciones','activo','deudora',3,true,'Dep. 5% anual (LCT art. 45 num 1a)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.02','Equipos de Cómputo y TIC','activo','deudora',3,true,'Dep. 50% anual (LCT art. 45 num 1e)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.03','Maquinaria y Equipos','activo','deudora',3,true,'Dep. 20% anual (LCT art. 45 num 1c)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.04','Vehículos','activo','deudora',3,true,'Dep. 20% anual (LCT art. 45 num 1d)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.05','Mobiliario y Equipo de Oficina','activo','deudora',3,true,'Dep. 20% anual (LCT art. 45 num 1b)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.06','Terrenos','activo','deudora',3,true,'No depreciable',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.07','Dep. Acum. Edificios','activo','acreedora',3,true,'Cuenta contra-activo (saldo acreedor)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.08','Dep. Acum. Equipos Cómputo','activo','acreedora',3,true,pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.09','Dep. Acum. Maquinaria','activo','acreedora',3,true,pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.10','Dep. Acum. Vehículos','activo','acreedora',3,true,pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.11','Dep. Acum. Mobiliario','activo','acreedora',3,true,pid_12);

  -- ── NIVEL 3 – ACTIVO DIFERIDO ───────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.3.01','Gastos de Organización','activo','deudora',3,true,'Amort. 3 años (LCT art. 45 num 6)',pid_13);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.3.02','Gastos Pre-operativos','activo','deudora',3,true,'Amort. 3 años (LCT art. 45 num 7)',pid_13);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.3.03','Amort. Acum. Diferidos','activo','acreedora',3,true,pid_13);

  -- ── NIVEL 3 – PASIVO CORRIENTE ──────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.01','Cuentas por Pagar Proveedores','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.02','Otras Cuentas por Pagar','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.03','IVA Débito Fiscal','pasivo','acreedora',3,true,'IVA cobrado en ventas (15%) a pagar DGI',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.04','IR por Pagar (Renta Anual)','pasivo','acreedora',3,true,'Tasa 30% renta neta o 1% ingresos brutos (LCT 52)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.05','Anticipos IR por Enterar','pasivo','acreedora',3,true,'Pago mínimo definitivo mensual 1%',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.06','Retenciones IR por Enterar','pasivo','acreedora',3,true,'IR 2% retenido a personas naturales proveedores',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.07','INSS Patronal por Pagar','pasivo','acreedora',3,true,'22.5% sobre salario base (Ley 539)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.08','INSS Laboral por Pagar','pasivo','acreedora',3,true,'7% sobre salario base, retenido al trabajador',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.09','INATEC por Pagar','pasivo','acreedora',3,true,'2% sobre planilla salarial',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.10','Sueldos y Salarios por Pagar','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.11','IR Laboral por Enterar','pasivo','acreedora',3,true,'IR retenido a trabajadores (tabla progresiva art. 23)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.12','Vacaciones por Pagar','pasivo','acreedora',3,true,'Provisión vacaciones 8.33% mensual',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.13','Aguinaldo por Pagar','pasivo','acreedora',3,true,'Provisión aguinaldo 8.33% mensual',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.14','Indemnización por Pagar','pasivo','acreedora',3,true,'Provisión indemnización 8.33% mensual',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.15','IMI por Pagar (Alcaldía)','pasivo','acreedora',3,true,'1% ingresos brutos mensual (Plan de Arbitrios)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.16','Préstamos Bancarios C/P','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.17','Anticipo de Clientes','pasivo','acreedora',3,true,pid_21);

  -- ── NIVEL 3 – PASIVO NO CORRIENTE ───────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.2.01','Préstamos Bancarios L/P','pasivo','acreedora',3,true,pid_22);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.2.02','Otras Deudas a Largo Plazo','pasivo','acreedora',3,true,pid_22);

  -- ── NIVEL 3 – PATRIMONIO ────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.1.01','Capital Aportado','patrimonio','acreedora',3,true,pid_31);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.1.02','Reserva Legal','patrimonio','acreedora',3,true,'10% de utilidad neta (Código Mercantil)',pid_31);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.2.01','Utilidades Retenidas','patrimonio','acreedora',3,true,pid_32);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.2.02','Pérdidas Acumuladas','patrimonio','deudora',3,true,pid_32);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.2.03','Utilidad/Pérdida del Ejercicio','patrimonio','acreedora',3,true,'Se cierra al final del período fiscal',pid_32);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.3.01','Dividendos Decretados','patrimonio','deudora',3,true,'Ret. definitiva 10% (LCT art. 87)',pid_33);

  -- ── NIVEL 3 – INGRESOS ──────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'4.1.01','Ventas de Bienes','ingreso','acreedora',3,true,'Ventas gravadas con IVA 15%',pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.1.02','Ventas de Servicios','ingreso','acreedora',3,true,pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'4.1.03','Ventas Exentas de IVA','ingreso','acreedora',3,true,'Canasta básica y otros exentos (LCT art. 127)',pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'4.1.04','Devoluciones en Ventas','ingreso','deudora',3,true,'Nota de crédito – contra ingreso',pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.1.05','Descuentos en Ventas','ingreso','deudora',3,true,pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2.01','Ingresos Financieros','ingreso','acreedora',3,true,pid_42);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2.02','Utilidad en Venta de Activos','ingreso','acreedora',3,true,pid_42);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2.03','Otros Ingresos','ingreso','acreedora',3,true,pid_42);

  -- ── NIVEL 3 – COSTOS ────────────────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'5.1.01','Costo de Mercancías Vendidas','costo','deudora',3,true,'Costo de inventario dado de baja por venta',pid_51);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1.02','Compras de Mercancías','costo','deudora',3,true,pid_51);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1.03','Devoluciones en Compras','costo','acreedora',3,true,pid_51);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1.04','Fletes sobre Compras','costo','deudora',3,true,pid_51);

  -- ── NIVEL 3 – GASTOS DE OPERACIÓN ───────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.01','Sueldos y Salarios','gasto','deudora',3,true,'Neto pagado a trabajadores',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.02','INSS Patronal','gasto','deudora',3,true,'22.5% sobre salario base – gasto deducible',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.03','INATEC','gasto','deudora',3,true,'2% sobre planilla – gasto deducible',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.04','Vacaciones','gasto','deudora',3,true,'Provisión 8.33% mensual (CT art. 76)',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.05','Aguinaldo','gasto','deudora',3,true,'Provisión 8.33% mensual (CT art. 93)',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.06','Indemnización','gasto','deudora',3,true,'Provisión 8.33% mensual (CT art. 45)',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.07','Alquileres','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.08','Energía Eléctrica','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.09','Agua y Alcantarillado','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.10','Telecomunicaciones','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.11','Papelería y Útiles de Oficina','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.12','Publicidad y Mercadeo','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.13','Gastos Legales y Notariales','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.14','Honorarios Profesionales','gasto','deudora',3,true,'Sujeto a retención IR 10% persona natural',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.15','Seguros','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.16','Depreciación del Ejercicio','gasto','deudora',3,true,'Dep. anual según art. 45 LCT',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.17','Amortización del Ejercicio','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.18','IMI – Impuesto Municipal','gasto','deudora',3,true,'1% ingresos brutos – deducible IR parcialmente',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.19','Comisiones y Gastos Bancarios','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.20','Gastos de Viaje y Viáticos','gasto','deudora',3,true,pid_61);

  -- ── NIVEL 3 – GASTOS FINANCIEROS ────────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.2.01','Intereses Bancarios','gasto','deudora',3,true,'Deducible hasta 1.5x tasa prom BCN (LCT art. 48)',pid_62);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.2.02','Pérdida Cambiaria','gasto','deudora',3,true,pid_62);

  -- ── NIVEL 3 – GASTOS NO DEDUCIBLES ──────────────────────────
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.3.01','Multas y Recargos DGI','gasto','deudora',3,true,'No deducibles del IR (LCT art. 43)',pid_63);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.3.02','Gastos Personales','gasto','deudora',3,true,'No deducibles del IR',pid_63);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.3.03','Otros Gastos No Deducibles','gasto','deudora',3,true,pid_63);

  -- Crear período contable actual
  INSERT INTO periodos_contables(empresa_id, anio, mes, estado, nombre, fecha_inicio, fecha_fin)
  VALUES(
    eid, anio_actual, mes_actual, 'abierto',
    'Período ' || anio_actual || '-' || LPAD(mes_actual::text, 2, '0'),
    DATE_TRUNC('month', now())::date,
    (DATE_TRUNC('month', now()) + INTERVAL '1 month - 1 day')::date
  )
  ON CONFLICT DO NOTHING;

END $$;
