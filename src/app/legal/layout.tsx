import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-6">
        <Link href="/" className="inline-block hover:opacity-80 transition-opacity">
          <span className="font-display text-xl font-bold text-white">SARA</span>
          <span className="text-blue-300 text-xs font-medium ml-2 hidden sm:inline">
            sara-app
          </span>
        </Link>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-modal p-8">{children}</div>
        <div className="text-center text-sm text-slate-500 mt-6">
          <Link href="/auth/register" className="text-brand-700 font-semibold hover:underline">
            Volver a crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
