import { toSystemjsMain } from './to-systemjs.ts';

// @ts-ignore
self.addEventListener(
    'message',
    async (
        event: MessageEvent<{ args: Parameters<typeof toSystemjsMain> }>,
    ) => {
        // @ts-ignore
        const build = await toSystemjsMain(...event.data.args);
        // @ts-ignore
        self.postMessage({ build });
        // @ts-ignore
        self.close();
    },
);
