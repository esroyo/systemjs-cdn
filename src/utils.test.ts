import { assertEquals } from '@std/assert';
import { spy } from '@std/testing/mock';

Deno.test('sanitizeBasePath', async (t) => {
    const { sanitizeBasePath } = await import('./utils.ts');

    await t.step('should return "/" when input is empty', async () => {
        assertEquals(sanitizeBasePath(''), '/');
    });

    await t.step('should keep the initial slash', async () => {
        assertEquals(sanitizeBasePath('/'), '/');
    });

    await t.step('should remove ending slash', async () => {
        assertEquals(sanitizeBasePath('/sub-path/foo/'), '/sub-path/foo');
    });
});

Deno.test('sanitizeUpstreamOrigin', async (t) => {
    const { sanitizeUpstreamOrigin } = await import('./utils.ts');

    await t.step('should always return with a pathname', async () => {
        assertEquals(
            sanitizeUpstreamOrigin('https://remote.me'),
            'https://remote.me/',
        );
    });

    await t.step('should remove ending slash', async () => {
        assertEquals(
            sanitizeUpstreamOrigin('https://remote.me/foo/bar/'),
            'https://remote.me/foo/bar',
        );
    });

    await t.step('should remove search params and hash', async () => {
        assertEquals(
            sanitizeUpstreamOrigin('https://remote.me/foo/bar/?param=1#baz'),
            'https://remote.me/foo/bar',
        );
    });
});

Deno.test('parseSourceMapUrl', async (t) => {
    const { parseSourceMapUrl } = await import('./utils.ts');

    await t.step('should parse an absolute URL', async () => {
        assertEquals(
            parseSourceMapUrl(`
console.log('foo');

//# sourceMappingURL=http://example.com/path/to/your/sourcemap.map
`),
            'http://example.com/path/to/your/sourcemap.map',
        );
    });

    await t.step('should parse a relative URL', async () => {
        assertEquals(
            parseSourceMapUrl(`
console.log('foo');

//# sourceMappingURL=your-sourcemap.map
`),
            'your-sourcemap.map',
        );
    });

    await t.step('should require "start of line" matching', async () => {
        assertEquals(
            parseSourceMapUrl(`
console.log('//# sourceMappingURL=potato.map');

//# sourceMappingURL=http://example.com/path/to/your/sourcemap.map
`),
            'http://example.com/path/to/your/sourcemap.map',
        );
    });

    await t.step(
        'should complete a relative URL if a baseUrl is provided',
        async () => {
            assertEquals(
                parseSourceMapUrl(
                    `
console.log('foo');

//# sourceMappingURL=source.js.map
`,
                    'http://example.com/path/to/your/source.js',
                ),
                'http://example.com/path/to/your/source.js.map',
            );
        },
    );
});

Deno.test('buildSourceModule', async (t) => {
    const { buildSourceModule } = await import('./utils.ts');

    await t.step(
        'should return the same input when no sourceMapURL exists',
        async () => {
            const moduleUrl =
                'https://esm.sh/stable/@vue/runtime-dom@3.4.30/es2022/runtime-dom.mjs';
            const moduleCode = `
console.log('foo');
`;
            assertEquals(
                await buildSourceModule(moduleCode, moduleUrl),
                moduleCode,
            );
        },
    );

    await t.step(
        'should return a SourceModule object when sourceMapURL exists',
        async () => {
            const sourceMapContent = '{"mappings":[],"version":3}';
            const fetchMock = spy(() =>
                Promise.resolve(
                    new Response(sourceMapContent),
                )
            );
            const moduleUrl =
                'https://esm.sh/stable/@vue/runtime-dom@3.4.30/es2022/runtime-dom.mjs';
            const moduleCode = `
console.log('foo');
//# sourceMappingURL=rumtime-dom.js.map
`;
            assertEquals(
                await buildSourceModule(moduleCode, moduleUrl, fetchMock),
                { code: moduleCode, map: sourceMapContent, name: moduleUrl },
            );
        },
    );

    await t.step(
        'should return the same input when sourceMapURL fetching is not OK',
        async () => {
            const fetchMock = spy(() =>
                Promise.resolve(
                    new Response(null, { status: 404 }),
                )
            );
            const moduleUrl =
                'https://esm.sh/stable/@vue/runtime-dom@3.4.30/es2022/runtime-dom.mjs';
            const moduleCode = `
console.log('foo');
//# sourceMappingURL=rumtime-dom.js.map
`;
            assertEquals(
                await buildSourceModule(moduleCode, moduleUrl, fetchMock),
                moduleCode,
            );
        },
    );

    await t.step(
        'should return the same input upon network error',
        async () => {
            const fetchMock = spy(() =>
                Promise.reject(
                    new TypeError('Network request failed'),
                )
            );
            const moduleUrl =
                'https://esm.sh/stable/@vue/runtime-dom@3.4.30/es2022/runtime-dom.mjs';
            const moduleCode = `
console.log('foo');
//# sourceMappingURL=rumtime-dom.js.map
`;
            assertEquals(
                await buildSourceModule(moduleCode, moduleUrl, fetchMock),
                moduleCode,
            );
        },
    );
});
