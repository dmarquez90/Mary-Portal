
-- BUG FIX #3a: categoria CHECK no incluye equipo_computo (nombre real en SARA UI)
-- BUG FIX #3b: metodo_depreciacion CHECK solo permite linea_recta — ampliar
ALTER TABLE activos_fijos DROP CONSTRAINT IF EXISTS activos_fijos_categoria_check;
ALTER TABLE activos_fijos ADD CONSTRAINT activos_fijos_categoria_check
  CHECK (categoria = ANY (ARRAY[
    'edificio','terreno','vehiculo','mobiliario',
    'equipo_tic','equipo_computo','equipo_produccion',
    'herramientas','otro'
  ]));

ALTER TABLE activos_fijos DROP CONSTRAINT IF EXISTS activos_fijos_metodo_depreciacion_check;
ALTER TABLE activos_fijos ADD CONSTRAINT activos_fijos_metodo_depreciacion_check
  CHECK (metodo_depreciacion = ANY (ARRAY['linea_recta','saldo_decreciente','unidades_produccion']));
