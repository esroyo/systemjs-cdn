import { assertEquals } from '../dev_deps.ts';
/*
Deno.test('buildUpstreamUrl', async (t) => {
  const { buildUpstreamUrl } = await import('./utils.ts');

  await t.step(
    'should replace the input url origin with the upstream origin',
    async () => {
      const config = {
        BASE_PATH: '/',
        UPSTREAM_ORIGIN: 'https://remote.me/',
      };
      const url = 'https://local.me/?topic=1';
      assertEquals(buildUpstreamUrl(url, config), 'https://remote.me/?topic=1');
    },
  );

  await t.step('should remove the BASE_PATH from the input url', async (t) => {
    const config = {
      BASE_PATH: '/sub-path',
      UPSTREAM_ORIGIN: 'https://remote.me/',
    };

    await t.step('when the input url path has an ending slash', async () => {
      const url = 'https://local.me/sub-path/?topic=1';
      assertEquals(buildUpstreamUrl(url, config), 'https://remote.me/?topic=1');
    });

    await t.step(
      'when the input url path has not an ending slash',
      async () => {
        const url = 'https://local.me/sub-path?topic=1';
        assertEquals(
          buildUpstreamUrl(url, config),
          'https://remote.me/?topic=1',
        );
      },
    );
  });

  await t.step(
    'should use the full UPSTREAM_ORIGIN including path',
    async (t) => {
      const config = {
        BASE_PATH: '/sub-path',
        UPSTREAM_ORIGIN: 'https://remote.me/foo/bar',
      };

      await t.step('when the input url path has an ending slash', async () => {
        const url = 'https://local.me/sub-path/?topic=1';
        assertEquals(
          buildUpstreamUrl(url, config),
          'https://remote.me/foo/bar?topic=1',
        );
      });

      await t.step(
        'when the input url path has not an ending slash',
        async () => {
          const url = 'https://local.me/sub-path?topic=1';
          assertEquals(
            buildUpstreamUrl(url, config),
            'https://remote.me/foo/bar?topic=1',
          );
        },
      );
    },
  );
});
*/

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
