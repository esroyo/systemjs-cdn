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
                await buildSourceModule(
                    moduleCode,
                    moduleUrl,
                    undefined,
                    fetchMock,
                ),
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
                await buildSourceModule(
                    moduleCode,
                    moduleUrl,
                    undefined,
                    fetchMock,
                ),
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
                await buildSourceModule(
                    moduleCode,
                    moduleUrl,
                    undefined,
                    fetchMock,
                ),
                moduleCode,
            );
        },
    );
});

Deno.test('parseRequestUrl', async (t) => {
    const { parseRequestUrl } = await import('./utils.ts');

    await t.step('should return the correct upstreamUrl', async (t) => {
        await t.step('when there is a basePath', async () => {
            const { upstreamUrl } = parseRequestUrl({
                url: 'http://0.0.0.0:8000/sjs/vue',
                basePath: '/sjs',
                upstreamOrigin: 'https://esm.sh/',
            });
            assertEquals(
                upstreamUrl.toString(),
                'https://esm.sh/vue',
            );
        });

        await t.step('when there is not a basePath', async () => {
            const { upstreamUrl } = parseRequestUrl({
                url: 'http://0.0.0.0:8000/vue',
                basePath: '/',
                upstreamOrigin: 'https://esm.sh/',
            });
            assertEquals(
                upstreamUrl.toString(),
                'https://esm.sh/vue',
            );
        });
    });

    await t.step('should return the correct publicUrl', async (t) => {
        await t.step('when there is a realOrigin', async () => {
            const { publicUrl } = parseRequestUrl({
                url: 'http://0.0.0.0:8000/sjs/vue',
                basePath: '/sjs',
                realOrigin: 'https://systemjs.comu.cat',
                upstreamOrigin: 'https://esm.sh/',
            });
            assertEquals(
                publicUrl.toString(),
                'https://systemjs.comu.cat/sjs/vue',
            );
        });

        await t.step('when there is not a realOrigin', async () => {
            const { publicUrl } = parseRequestUrl({
                url: 'http://0.0.0.0:8000/sjs/vue',
                basePath: '/sjs',
                // realOrigin: 'https://systemjs.comu.cat',
                upstreamOrigin: 'https://esm.sh/',
            });
            assertEquals(
                publicUrl.toString(),
                'http://0.0.0.0:8000/sjs/vue',
            );
        });
    });

    await t.step('should return a replaceOrigin fn that', async (t) => {
        await t.step(
            'should replace the upstream origin with the public url',
            async (_t) => {
                const { replaceUrls } = parseRequestUrl({
                    url: 'http://0.0.0.0:8000/sjs/vue',
                    basePath: '/sjs',
                    realOrigin: 'https://systemjs.comu.cat',
                    upstreamOrigin: 'https://esm.sh/',
                });
                assertEquals(
                    replaceUrls(
                        'System.register(["https://esm.sh/stable/vue@3.3.2/es2022/vue.mjs","https://esm.sh/stable/vue@3.3.2/es2022/vue.mjs"],(function(exports){}));',
                    ),
                    'System.register(["https://systemjs.comu.cat/sjs/stable/vue@3.3.2/es2022/vue.mjs","https://systemjs.comu.cat/sjs/stable/vue@3.3.2/es2022/vue.mjs"],(function(exports){}));',
                );
            },
        );

        await t.step(
            'should add the basePath to the absolute paths',
            async (_t) => {
                const { replaceUrls } = parseRequestUrl({
                    url: 'http://0.0.0.0:8000/sjs/vue',
                    basePath: '/sjs',
                    realOrigin: 'https://systemjs.comu.cat',
                    upstreamOrigin: 'https://esm.sh/',
                });

                const input = `
System.register(['/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs', '/stable/vue@3.3.4/es2022/vue.mjs'], (function (exports, module) {
	return {
		execute: (function () {

			const foo = exports("foo", () => module.import('/stable/monaco-editor@0.45.0/es2022/monaco-editor.css'));
			const bar = exports("bar", () => module.import('https://unpkg.com/systemjs/dist/s.js'));

		})
	};
}));
`;
                const expected = `
System.register(['/sjs/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs', '/sjs/stable/vue@3.3.4/es2022/vue.mjs'], (function (exports, module) {
	return {
		execute: (function () {

			const foo = exports("foo", () => module.import('/sjs/stable/monaco-editor@0.45.0/es2022/monaco-editor.css'));
			const bar = exports("bar", () => module.import('https://unpkg.com/systemjs/dist/s.js'));

		})
	};
}));
`;

                assertEquals(
                    replaceUrls(input),
                    expected,
                );
            },
        );

        await t.step(
            'should do nothing to absolute paths if basePath is "empty"',
            async (_t) => {
                const { replaceUrls } = parseRequestUrl({
                    url: 'http://0.0.0.0:8000/sjs/vue',
                    basePath: '/',
                    realOrigin: 'https://systemjs.comu.cat',
                    upstreamOrigin: 'https://esm.sh/',
                });

                const input = `
System.register(['/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs', '/stable/vue@3.3.4/es2022/vue.mjs'], (function (exports, module) {
	return {
		execute: (function () {

			const foo = exports("foo", () => module.import('/stable/monaco-editor@0.45.0/es2022/monaco-editor.css'));
			const bar = exports("bar", () => module.import('https://unpkg.com/systemjs/dist/s.js'));

		})
	};
}));
`;
                const expected = `
System.register(['/stable/@vue/runtime-dom@3.3.4/es2022/runtime-dom.mjs', '/stable/vue@3.3.4/es2022/vue.mjs'], (function (exports, module) {
	return {
		execute: (function () {

			const foo = exports("foo", () => module.import('/stable/monaco-editor@0.45.0/es2022/monaco-editor.css'));
			const bar = exports("bar", () => module.import('https://unpkg.com/systemjs/dist/s.js'));

		})
	};
}));
`;

                assertEquals(
                    replaceUrls(input),
                    expected,
                );
            },
        );
    });
});
