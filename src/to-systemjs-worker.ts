import { toSystemjs } from './to-systemjs.ts';

// @ts-ignore
self.addEventListener('message', async (event: MessageEvent<{ args: Parameters<typeof toSystemjs> }>) => {
    const transpiledCode = await toSystemjs(...event.data.args);
    // @ts-ignore
    self.postMessage({ code: transpiledCode });
    // @ts-ignore
    self.close();
});
