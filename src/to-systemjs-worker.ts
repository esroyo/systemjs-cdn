import { toSystemjsMain } from './to-systemjs.ts';

declare global {
    interface Window extends Worker {}
}

self.onmessage = async (
    event: MessageEvent<{ args: Parameters<typeof toSystemjsMain> }>,
) => {
    const build = await toSystemjsMain(...event.data.args);
    self.postMessage({ build });
};
