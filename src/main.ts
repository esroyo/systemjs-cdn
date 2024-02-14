import { dotenvLoad, serve } from '../deps.ts';

import { sjsRequestHandler } from './sjs-request-handler.ts';

dotenvLoad({ export: true });

serve(sjsRequestHandler, { port: 8000 });
