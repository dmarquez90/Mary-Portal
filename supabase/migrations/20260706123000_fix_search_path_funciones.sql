-- Endurecimiento: fija search_path en todas las funciones de public
-- que no lo tienen (lint function_search_path_mutable de Supabase).
-- Se incluye 'extensions' porque Supabase instala ahí las extensiones
-- (uuid-ossp, pgcrypto, etc.) que algunas funciones usan sin calificar.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.fn);
  END LOOP;
END $$;
