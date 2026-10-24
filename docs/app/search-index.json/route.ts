import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

// The search index, built with the site and downloaded by the search dialog.
export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
});
