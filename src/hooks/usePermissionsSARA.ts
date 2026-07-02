"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MATRIX, NAV_PERMISOS, PERMISO_A_MODULO, type Permiso, type Rol, type PermisosCustom } from "@/lib/permissions";

interface EstadoPermisos {
  loading: boolean;
  rol: Rol | null;
  isSuperAdmin: boolean;
  usuarioSuspendido: boolean;
  empresaSuspendida: boolean;
  empresaId: string | null;
  permisosCustom: PermisosCustom | null;
}

const ESTADO_INICIAL: EstadoPermisos = {
  loading: true,
  rol: null,
  isSuperAdmin: false,
  usuarioSuspendido: false,
  empresaSuspendida: false,
  empresaId: null,
  permisosCustom: null,
};

// Sin selector de "empresa activa" todavía (ver decisión de alcance): si no se
// pasa empresaIdActiva, se resuelve automáticamente a la única empresa donde
// el usuario tiene una fila en empresa_usuarios. Cuando exista invitación a
// múltiples empresas, este hook deberá recibir el id desde un switcher real.
export function usePermissionsSARA(empresaIdActiva?: string) {
  const [estado, setEstado] = useState<EstadoPermisos>(ESTADO_INICIAL);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelado) setEstado({ ...ESTADO_INICIAL, loading: false });
        return;
      }

      const { data: superAdminRow } = await supabase
        .from("super_admins")
        .select("usuario_id")
        .eq("usuario_id", user.id)
        .maybeSingle();
      const isSuperAdmin = !!superAdminRow;

      let empresaId: string | null = empresaIdActiva ?? null;
      let rol: Rol | null = null;
      let usuarioSuspendido = false;
      let permisosCustom: PermisosCustom | null = null;

      let query = supabase
        .from("empresa_usuarios")
        .select("empresa_id, rol, permisos_custom, suspendido")
        .eq("usuario_id", user.id);
      if (empresaIdActiva) query = query.eq("empresa_id", empresaIdActiva);

      const { data: filas } = await query;
      const fila = filas?.[0];
      if (fila) {
        empresaId = fila.empresa_id;
        rol = fila.rol as Rol;
        usuarioSuspendido = fila.suspendido;
        permisosCustom = fila.permisos_custom as PermisosCustom | null;
      }

      let empresaSuspendida = false;
      if (empresaId) {
        const [{ data: ej }, { data: en }] = await Promise.all([
          supabase.from("empresas_juridicas").select("suspendida").eq("id", empresaId).maybeSingle(),
          supabase.from("empresas_persona_natural").select("suspendida").eq("id", empresaId).maybeSingle(),
        ]);
        empresaSuspendida = !!(ej?.suspendida || en?.suspendida);
      }

      if (!cancelado) {
        setEstado({
          loading: false,
          rol,
          isSuperAdmin,
          usuarioSuspendido,
          empresaSuspendida,
          empresaId,
          permisosCustom,
        });
      }
    }

    cargar();
    return () => { cancelado = true; };
  }, [empresaIdActiva]);

  // Espejo exacto de fn_tiene_permiso() en Postgres (migración rbac_02/05):
  // 1) empresa suspendida bloquea todo, salvo super_admin en modo solo-lectura
  //    (para poder evaluar/reactivar sin poder operar)
  // 2) super_admin bypasea todo lo demás
  // 3) usuario suspendido en esa empresa bloquea todo
  // 4) permisos_custom sobrescribe el módulo/tipo si está definido
  // 5) matriz por rol
  const can = useCallback((permiso: Permiso): boolean => {
    if (estado.empresaSuspendida) {
      return estado.isSuperAdmin && permiso.endsWith("_ver");
    }
    if (estado.isSuperAdmin) return true;
    if (!estado.rol || estado.usuarioSuspendido) return false;

    if (estado.permisosCustom) {
      const mapped = PERMISO_A_MODULO[permiso];
      if (mapped) {
        const [modulo, tipo] = mapped;
        const val = estado.permisosCustom[modulo]?.[tipo];
        if (val !== undefined) return val === true;
      }
    }

    const row = MATRIX[permiso];
    if (!row) return false;
    return row[estado.rol] === true;
  }, [estado]);

  const canView = useCallback((modulo: string): boolean => {
    if (estado.empresaSuspendida) return estado.isSuperAdmin;
    if (estado.isSuperAdmin) return true;
    if (!estado.rol || estado.usuarioSuspendido) return false;

    if (estado.permisosCustom?.[modulo]?.ver !== undefined) {
      return estado.permisosCustom[modulo].ver === true;
    }
    const row = MATRIX[`${modulo}_ver` as Permiso];
    if (!row) return true; // sin entrada explícita de _ver => permitir (igual que Mary)
    return row[estado.rol] === true;
  }, [estado]);

  const canEdit = useCallback((modulo: string): boolean => {
    if (estado.empresaSuspendida) return false; // nadie edita una empresa suspendida, ni super_admin
    if (estado.isSuperAdmin) return true;
    if (!estado.rol || estado.usuarioSuspendido) return false;

    if (estado.permisosCustom?.[modulo]?.editar !== undefined) {
      return estado.permisosCustom[modulo].editar === true;
    }
    const row = MATRIX[`${modulo}_editar` as Permiso];
    if (!row) return false; // sin entrada explícita de _editar => bloquear (igual que Mary)
    return row[estado.rol] === true;
  }, [estado]);

  const navVisible = useCallback((id: string): boolean => {
    if (estado.isSuperAdmin) return true;
    if (estado.empresaSuspendida || estado.usuarioSuspendido) return false;
    if (estado.permisosCustom?.[id]?.ver !== undefined) return estado.permisosCustom[id].ver === true;
    if (!estado.rol) return false;
    return (NAV_PERMISOS[estado.rol] || []).includes(id);
  }, [estado]);

  return {
    loading: estado.loading,
    rol: estado.rol,
    isSuperAdmin: estado.isSuperAdmin,
    estaSuspendido: estado.usuarioSuspendido || estado.empresaSuspendida,
    empresaId: estado.empresaId,
    can,
    canView,
    canEdit,
    navVisible,
  };
}
