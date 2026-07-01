
-- BUG FIX #2: tasa_depreciacion_anual NUMERIC(5,4) no acepta valores >= 10
-- Tasas reales: 20% vehículos, 25% equipo, 50% cómputo (Art. 45 LCT Nicaragua)
ALTER TABLE activos_fijos ALTER COLUMN tasa_depreciacion_anual TYPE NUMERIC(6,2);
