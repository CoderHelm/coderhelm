'use client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useStaticSearch } from 'fumadocs-core/search/client';
import { useEffect, useRef } from 'react';
import { track } from '@/components/analytics';

/**
 * Search runs in the browser over an index built with the site
 * (/search-index.json, a static file), so it needs no server and no third party.
 * Analytics counts that a search was made, once per open, never what was typed.
 */
export default function DocsSearchDialog(props: SharedProps) {
  const search = useStaticSearch({ from: '/search-index.json' });
  const counted = useRef(false);
  useEffect(() => {
    if (!props.open) counted.current = false;
  }, [props.open]);
  useEffect(() => {
    if (counted.current || !search.search.trim()) return;
    counted.current = true;
    track({ name: 'docs_search' });
  }, [search.search]);
  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
      </SearchDialogContent>
    </SearchDialog>
  );
}
