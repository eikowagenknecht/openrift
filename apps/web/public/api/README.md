# Reserved path

This directory is reserved. In production, the container nginx proxies `/api/` to the API server. Do not place static assets here — they will be shadowed by the proxy.
