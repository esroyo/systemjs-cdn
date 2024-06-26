import { resolve } from '../deps.ts';
import { assertEquals } from '../dev_deps.ts';
import virtual from './rollup-plugin-virtual.ts';

Deno.test('loads a bare module ID from memory', (t) => {
    const plugin = virtual({
        foo: 'export default 42',
    });

    const resolved = plugin.resolveId('foo');

    assertEquals(resolved, 'virtual:foo');
    assertEquals(resolved && plugin.load(resolved), 'export default 42');
});

Deno.test('loads an absolute path from memory', (t) => {
    const plugin = virtual({
        'src/foo.js': 'export default 42',
    });

    const resolved = plugin.resolveId('./foo.js', 'src/main.js');

    assertEquals(resolved, `virtual:${resolve('src/foo.js')}`);
    assertEquals(resolved && plugin.load(resolved), 'export default 42');
});

Deno.test('can load code+map objects', (t) => {
    const sourceDescription = {
        code: 'export function increment(e){return e+=1,e}',
        map: {
            'version': 3,
            'sources': ['../some.ts'],
            'sourcesContent': [
                'export function increment(num: number): number {\n  num += 1;\n  return num;\n}\n',
            ],
            'mappings': 'AAAO,gBAAS,UAAUA,EAAqB,CAC7C,OAAAA,GAAO,EACAA,CACT',
            'names': ['num'],
        },
    };
    const plugin = virtual({
        'someTs': sourceDescription,
    });

    const resolved = plugin.resolveId('someTs');

    assertEquals(resolved, 'virtual:someTs');
    assertEquals(resolved && plugin.load(resolved), sourceDescription);
});
