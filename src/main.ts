import { serve } from '../deps.ts';

import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';

serve(esmProxyRequestHandler, { port: 8000 });
