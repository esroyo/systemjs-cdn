import { toSystemjsMain } from './to-systemjs.ts';

// @ts-ignore
self.addEventListener(
    'message',
    async (event: MessageEvent<{ args: Parameters<typeof toSystemjs> }>) => {
        // @ts-ignore
        const transpiledCode = await toSystemjsMain(...event.data.args);
        // @ts-ignore
        self.postMessage({ code: transpiledCode });
        // @ts-ignore
        self.close();
    },
);
