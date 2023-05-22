import 'dotenv';
import { serve } from 'http';

import { esmProxyRequestHandler } from './esm-proxy-request-handler.ts';

serve(esmProxyRequestHandler, { port: 8000 });
