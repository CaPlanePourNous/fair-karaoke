"use client";
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

export default function HomePage() {
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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-4">Fair-Karaoké</h1>
        <p className="text-sm text-neutral-600 mb-4">
          Entrez le nom de la salle pour rejoindre la Room.
        </p>
        <form onSubmit={go} className="space-y-3">
          <label className="block text-sm font-medium">
            Nom de la salle
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. lantignie"
              className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={disabled}
            className="w-full rounded-lg border px-3 py-2 font-medium disabled:opacity-50"
            title={disabled ? "Saisir un nom de salle valide" : `Aller à /room/${slug}`}
          >
            Rejoindre la salle
          </button>
        </form>

        {slug && (
          <p className="mt-3 text-xs text-neutral-500">
            URL cible : <code>/room/{slug}</code>
          </p>
        )}
      </div>
    </main>
  );
}
