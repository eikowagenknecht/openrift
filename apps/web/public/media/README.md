# Reserved path

This directory is reserved. In production, the container nginx proxies `/media/` to the local filesystem ./media. Do not place static assets here — they will be shadowed by the proxy.
