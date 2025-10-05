// app/api/search/route.ts
import { NextResponse } from 'next/server';
import Papa from 'papaparse';

export const runtime = 'nodejs'; // PapaParse nécessite Node, pas Edge.

type Row = {
  title: string;
  artist: string;
  karafun_id?: string;
  url?: string;
};

// --- Config ---
const REMOTE_CSV =
  'https://www.karafun.fr/cl/3107312/de746f0516a28e34c9802584192dc6d3/'; // ton lien
const LOCAL_CSV_PATH = '/karafun.csv';   // mets le fichier dans /public/karafun.csv
const LOCAL_JSON_PATH = '/karafun.json'; // fallback si tu préfères le JSON
const MAX_RESULTS = 20;
const REVALIDATE_MS = 10 * 60 * 1000; // 10 minutes

// --- Cache en mémoire ---
let CACHE: { data: Row[]; ts: number } | null = null;

// --- utilitaire de normalisation pour la recherche ---
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

// --- helpers ---
async function fetchText(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  return res.text();
}

function csvToRows(csv: string): Row[] {
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    // je n’édulcore pas : on remonte la première erreur
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }
  const rows = (parsed.data as any[]).map((r) => {
    const title = (r.title ?? r.TITLE ?? r.Titre ?? '').toString(
