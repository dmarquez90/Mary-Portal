"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthorized: (adminId: string) => void;
  mensaje?: string;
}

export default function AutorizacionAdminModal({ open, onClose, onAuthorized, mensaje }: Props) {
  const [password, setPassword] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function verificar() {
    if (!password) { setError("Ingresa la contraseña del administrador"); return; }
    setVerificando(true);
    setError("");
    try {
      const r = await fetch("/api/auth/verificar-descuento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok || !d.authorized) {
        setError(d.error || "Contraseña incorrecta");
        setVerificando(false);
        return;
      }
      setPassword("");
      setVerificando(false);
      onAuthorized(d.admin_id);
    } catch {
      setError("No se pudo verificar la contraseña");
      setVerificando(false);
    }
  }

  function cerrar() {
    setPassword("");
    setError("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-700" />
            </div>
            <h3 className="font-display font-bold text-slate-900">Autorización requerida</h3>
          </div>
          <button onClick={cerrar} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-slate-500 text-sm mb-4">
          {mensaje ?? "Esta acción requiere la contraseña de un administrador."}
        </p>
        <input
          type="password"
          autoFocus
          className="input"
          placeholder="Contraseña del administrador"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") verificar(); }}
        />
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={verificar} disabled={verificando} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {verificando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Autorizar"}
          </button>
          <button onClick={cerrar} className="btn-secondary flex-1">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
