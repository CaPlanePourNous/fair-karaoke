// app/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\-_\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function HomeInner() {
  const router = useRouter();
  const qs = useSearchParams();
  const [name, setName] = useState("");

  useEffect(() => {
    const q = qs.get("room");
    if (q) setName(q);
  }, [qs]);

  const slug = useMemo(() => slugify(name), [name]);
  const disabled = slug.length === 0;

  function go(e?: React.FormEvent) {
    e?.preventDefault();
    if (!disabled) router.push(`/room/${encodeURIComponent(slug)}`);
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '16px' }}>
      <div>
        <h1 className="text-2xl font-semibold mb-3">Fair-Karaoké</h1>
        <p className="text-sm text-neutral-600 mb-4">
          Entrez le <strong>code</strong> ou <strong>nom de la salle</strong> pour rejoindre.
        </p>

        <form onSubmit={go} className="space-y-3">
          <label className="block text-sm font-medium text-neutral-800">
            <div className="mt-1 max-w-sm">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Code ou nom de salle"
                maxLength={30}
                inputMode="text"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-800"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={disabled}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:opacity-50"
            title={disabled ? "Saisissez un code ou un nom valide" : `Aller à /room/${slug}`}
          >
            Rejoindre la salle
          </button>
        </form>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
