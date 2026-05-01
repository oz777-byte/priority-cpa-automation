import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CanonicalInvoiceSchema,
  type CanonicalInvoice,
} from '@priority-cpa/invoice-schema';

const FIXTURES_DIR = resolve(
  process.cwd(),
  '../../packages/skills/movein-generator/tests/fixtures',
);

export interface PocInvoice extends CanonicalInvoice {
  slug: string;
  pdfPath: string;
}

const FIXTURES: Array<{ slug: string; jsonName: string; pdfName: string }> = [
  {
    slug: 'wertheim-4427930',
    jsonName: 'wertheim_4427930.json',
    pdfName: 'wertheim_4427930.pdf',
  },
  {
    slug: 'tzarfati-114390',
    jsonName: 'tzarfati_114390.json',
    pdfName: 'tzarfati_114390.pdf',
  },
];

export function loadPocInvoices(): PocInvoice[] {
  return FIXTURES.map(({ slug, jsonName, pdfName }) => {
    const json = JSON.parse(
      readFileSync(resolve(FIXTURES_DIR, jsonName), 'utf-8'),
    );
    const parsed = CanonicalInvoiceSchema.parse(json);
    return { ...parsed, slug, pdfPath: pdfName };
  });
}

export function findPocInvoice(slug: string): PocInvoice | null {
  return loadPocInvoices().find((inv) => inv.slug === slug) ?? null;
}
