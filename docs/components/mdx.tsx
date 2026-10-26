import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import type { MDXComponents } from 'mdx/types';
import { Badge } from '@/components/badge';
import { Path, Paths, Tile, Tiles } from '@/components/home';
import { Diagram } from '@/components/diagram';
import { Table } from '@/components/table';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    table: Table,
    Tab,
    Tabs,
    Step,
    Steps,
    TypeTable,
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    Badge,
    Path,
    Paths,
    Tile,
    Tiles,
    Diagram,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
