import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex flex-col">
      <div className="p-6">
        <Link
          href="/"
          className="inline-block hover:opacity-80 transition-opacity"
        >
          <span className="font-display text-xl font-bold text-white">Siconic</span>
          <span className="text-blue-300 text-xs font-medium ml-2 hidden sm:inline">
            Sistema Contable de Nicaragua
          </span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        {children}
      </div>
    </div>
  );
}
