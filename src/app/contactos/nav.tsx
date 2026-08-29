import Link from 'next/link';

const PESTANAS = [
  { clave: 'directorio', texto: 'Directorio', href: '/contactos' },
  { clave: 'etiquetas', texto: 'Etiquetas', href: '/contactos/etiquetas' },
  { clave: 'listas', texto: 'Listas y segmentos', href: '/contactos/listas' },
] as const;

export function NavContactos({ activo }: { activo: (typeof PESTANAS)[number]['clave'] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-2 text-sm">
      {PESTANAS.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            p.clave === activo
              ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
