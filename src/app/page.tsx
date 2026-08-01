"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import {
  BarChart3,
  ShoppingCart,
  Package,
  FileText,
  Building2,
  Shield,
  CheckCircle2,
  ArrowRight,
  Zap,
} from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
};

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      custom={delay}
      variants={fadeUp}
    >
      {children}
    </motion.div>
  );
}

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1200;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-100/80">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          <span className="font-display text-xl font-bold bg-gradient-to-r from-brand-800 to-glow bg-clip-text text-transparent">
            Siconic
          </span>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="btn-ghost text-sm">
              Iniciar sesión
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-1.5 bg-brand-800 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all hover:shadow-glow"
            >
              Registrarse gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-40 pb-32 px-6 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white overflow-hidden">
        {/* Blobs animados */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-glow/40 rounded-full blur-3xl animate-blob" />
          <div className="absolute top-1/3 -right-24 w-[28rem] h-[28rem] bg-accent-DEFAULT/30 rounded-full blur-3xl animate-blob-slow" />
          <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-brand-400/30 rounded-full blur-3xl animate-blob" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-white/10 text-white/90 px-4 py-1.5 rounded-full text-sm font-medium mb-8 border border-white/20 animate-pulse-soft"
          >
            <Zap className="w-4 h-4 text-accent-DEFAULT" />
            Cumple con las normas de la DGI Nicaragua
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl md:text-7xl font-bold leading-tight mb-4 bg-gradient-to-r from-white via-white to-blue-200 bg-clip-text text-transparent"
          >
            Siconic
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-blue-200 text-lg font-medium mb-4 tracking-wide uppercase"
          >
            Sistema Contable de Nicaragua
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg text-blue-100 max-w-2xl mx-auto mb-10"
          >
            Factura, compra, controla tu inventario y genera reportes listos
            para la DGI — todo desde un solo lugar, en línea y seguro.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/auth/register"
              className="group inline-flex items-center justify-center gap-2 bg-accent-DEFAULT hover:bg-accent-dark text-white font-bold px-8 py-4 rounded-xl transition-all duration-300 text-base hover:shadow-glow-amber hover:-translate-y-0.5"
            >
              Comenzar ahora
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold px-8 py-4 rounded-xl transition-all duration-300 text-base hover:-translate-y-0.5"
            >
              Iniciar sesión
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── MÓDULOS ── */}
      <section className="relative py-24 px-6 bg-surface">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="text-accent-dark font-semibold text-sm uppercase tracking-widest mb-3">
              Módulos del sistema
            </p>
            <h2 className="font-display text-4xl font-bold text-slate-900">
              Todo lo que tu negocio necesita
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULOS.map((m, i) => (
              <Reveal key={m.titulo} delay={i * 0.5}>
                <motion.div
                  whileHover={{ y: -6, scale: 1.015 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="h-full bg-white/80 backdrop-blur rounded-2xl border border-surface-border p-6 shadow-card hover:shadow-soft hover:border-brand-200 transition-shadow group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:from-brand-100 group-hover:to-brand-200 transition-all duration-300">
                    <m.icon className="w-6 h-6 text-brand-700" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900 mb-2">
                    {m.titulo}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {m.descripcion}
                  </p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── DGI COMPLIANCE ── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <p className="text-accent-dark font-semibold text-sm uppercase tracking-widest mb-3">
                Normativa DGI
              </p>
              <h2 className="font-display text-4xl font-bold text-slate-900 mb-6">
                Diseñado para cumplir con la DGI
              </h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                Generamos todos los reportes que la Dirección General de
                Ingresos exige: libro de ventas, libro de compras, declaración
                de IVA mensual y retenciones IR en la fuente.
              </p>
              <ul className="space-y-3">
                {CUMPLIMIENTO.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700 text-sm">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="relative bg-gradient-to-br from-brand-800 to-brand-900 rounded-2xl p-8 text-white overflow-hidden shadow-soft">
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 bg-glow/30 rounded-full blur-3xl" />
                <div className="relative grid grid-cols-2 gap-6">
                  {STATS.map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="font-display text-4xl font-bold text-accent-DEFAULT mb-1">
                        {typeof s.num === "number" ? (
                          <Counter target={s.num} suffix={s.suffix} />
                        ) : (
                          s.valor
                        )}
                      </div>
                      <div className="text-blue-200 text-sm">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── TIPOS EMPRESA ── */}
      <section className="py-20 px-6 bg-surface">
        <div className="max-w-5xl mx-auto text-center">
          <Reveal>
            <h2 className="font-display text-3xl font-bold text-slate-900 mb-4">
              Para todo tipo de contribuyente
            </h2>
            <p className="text-slate-500 mb-12">
              Siconic se adapta al régimen tributario de tu empresa
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TIPOS.map((t, i) => (
              <Reveal key={t.titulo} delay={i * 0.5}>
                <motion.div
                  whileHover={{ y: -6 }}
                  className="h-full bg-white rounded-2xl text-center border-2 border-surface-border hover:border-brand-400 hover:shadow-soft transition-all duration-300 p-6"
                >
                  <div className="text-4xl mb-4">{t.emoji}</div>
                  <h3 className="font-display font-bold text-slate-900 mb-2">
                    {t.titulo}
                  </h3>
                  <p className="text-slate-500 text-sm">{t.desc}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-24 px-6 bg-brand-900 text-white text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-glow/25 rounded-full blur-3xl animate-blob-slow" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-DEFAULT/20 rounded-full blur-3xl animate-blob" />
        </div>
        <Reveal className="relative max-w-2xl mx-auto">
          <Shield className="w-12 h-12 text-accent-DEFAULT mx-auto mb-6" />
          <h2 className="font-display text-4xl font-bold mb-4">
            Empieza a facturar hoy
          </h2>
          <p className="text-blue-200 mb-8">
            Registro rápido, sin tarjeta de crédito. Tu información siempre
            segura y respaldada.
          </p>
          <Link
            href="/auth/register"
            className="group inline-flex items-center gap-2 bg-accent-DEFAULT hover:bg-accent-dark text-white font-bold px-10 py-4 rounded-xl transition-all duration-300 text-base hover:shadow-glow-amber hover:-translate-y-0.5"
          >
            Crear mi cuenta gratis
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-900 text-slate-400 py-10 px-6 text-center text-sm">
        <p className="font-display font-bold text-white text-lg mb-1">Siconic</p>
        <p className="text-slate-500 text-xs mb-2">Sistema Contable de Nicaragua</p>
        <p>Sistema Contable para Nicaragua · Cumple con normativas DGI</p>
        <p className="mt-4">© {new Date().getFullYear()} Siconic. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

const MODULOS = [
  {
    icon: FileText,
    titulo: "Ventas & Facturación",
    descripcion:
      "Emite facturas numeradas, controla cobros, gestiona clientes y aplica IVA automáticamente.",
  },
  {
    icon: ShoppingCart,
    titulo: "Compras",
    descripcion:
      "Registra compras a proveedores, controla pagos y actualiza el inventario en tiempo real.",
  },
  {
    icon: Package,
    titulo: "Inventario",
    descripcion:
      "Control de existencias, alertas de stock mínimo, entradas y salidas por categoría.",
  },
  {
    icon: BarChart3,
    titulo: "Reportes DGI",
    descripcion:
      "Libro de ventas, libro de compras, declaración de IVA mensual y reporte de retenciones.",
  },
  {
    icon: Building2,
    titulo: "Información de Empresa",
    descripcion:
      "Gestiona los datos de tu empresa, logo, RUC y datos del representante legal.",
  },
  {
    icon: Shield,
    titulo: "Seguridad & Respaldo",
    descripcion:
      "Datos cifrados, acceso por usuario y contraseña, respaldo automático en la nube.",
  },
];

const CUMPLIMIENTO = [
  "Formato de factura según disposición DGI",
  "IVA 15% automático por producto",
  "Libro de ventas mensual exportable",
  "Libro de compras mensual exportable",
  "Reporte de retenciones IR 2%",
  "Exportación PDF y Excel para presentar en renta",
];

const STATS = [
  { num: 15, suffix: "%", label: "IVA automático" },
  { num: 2, suffix: "%", label: "IR retención fuente" },
  { num: 100, suffix: "%", label: "En línea y seguro" },
  { valor: "DGI", label: "Formato compatible" },
];

const TIPOS = [
  {
    emoji: "🧑‍💼",
    titulo: "Persona Natural",
    desc: "Comerciantes independientes con RUC y cédula de identidad.",
  },
  {
    emoji: "🏪",
    titulo: "Cuota Fija",
    desc: "Pequeños negocios acogidos al régimen simplificado de cuota fija.",
  },
  {
    emoji: "🏢",
    titulo: "Persona Jurídica",
    desc: "Sociedades anónimas, cooperativas y cualquier entidad legal registrada.",
  },
];
