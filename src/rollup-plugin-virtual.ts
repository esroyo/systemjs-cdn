import type { Plugin } from '../deps.ts';
import { dirname, resolve } from '../deps.ts';
import type { RollupVirtualOptions, SourceDescription } from './types.ts';

const PREFIX = `virtual:`;

/**
 * A Rollup plugin which loads virtual modules from memory.
 */
export default function virtual(modules: RollupVirtualOptions) {
    const resolvedIds = new Map<
        string,
        string | SourceDescription
    >();

    Object.keys(modules).forEach((id) => {
        resolvedIds.set(resolve(id), modules[id]);
    });

    return {
        name: 'virtual',

        resolveId(this: any, id: string, importer?: string) {
            if (id in modules) return PREFIX + id;

            if (importer) {
                const importerNoPrefix = importer.startsWith(PREFIX)
                    ? importer.slice(PREFIX.length)
                    : importer;
                const resolved = resolve(dirname(importerNoPrefix), id);
                if (resolvedIds.has(resolved)) return PREFIX + resolved;
            }

            return null;
        },

        load(this: any, id: string) {
            if (id.startsWith(PREFIX)) {
                const idNoPrefix = id.slice(PREFIX.length);

                return idNoPrefix in modules
                    ? modules[idNoPrefix]
                    : resolvedIds.get(idNoPrefix);
            }

            return null;
        },
    } satisfies Plugin;
}
