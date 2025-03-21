/*
  1. Uses an alternative remote repository to download traineddata if fails
  2. Reports the progress
*/

self.fetch = new Proxy(self.fetch, {
    apply(target, self, args) {
        const [href, options] = args;

        if (href.includes('.traineddata.gz')) {
            const validate = r => {
                if (r.ok) return r;
                throw Error('[Extract Text From Image] Cannot download traineddata (' + r.status + ')');
            };

            const promise = new Promise(resolve => resolve()).then(async () => {
                let cache = null;
                try {
                    cache = await caches.open('traineddata');
                } catch (e) {
                    console.warn('[Extract Text From Image] CacheStorage unavailable:', e);
                }

                if (cache) {
                    const cachedResponse = await cache.match(href);
                    if (cachedResponse) {
                        console.log('[Extract Text From Image] Cache hit for:', href);
                        return cachedResponse;
                    }
                }

                const r = await Reflect.apply(target, self, args).then(validate).catch(e => {
                    console.warn('[Extract Text From Image] Failed to fetch:', href, e);
                    const path = href.split('.com/')[1] || href.split('/tessdata/')[1];
                    return Reflect.apply(target, self, [`https://github.com/naptha/tessdata/blob/gh-pages/${path}?raw=true`, options]).then(validate);
                });

                if (cache) cache.put(href, r.clone());

                return Object.assign(r, {
                    async arrayBuffer() {
                        const reader = r.body.getReader();
                        const chunks = [];
                        let bytes = 0;
                        const length = Number(r.headers.get('Content-Length'));

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            bytes += value.byteLength;
                            postMessage({
                                status: 'progress',
                                data: {
                                    status: 'loading language traineddata',
                                    progress: bytes / length
                                }
                            });
                            chunks.push(value);
                        }
                        return await new Blob(chunks).arrayBuffer();
                    }
                });
            });

            return promise;
        } else {
            return Reflect.apply(target, self, args);
        }
    }
});

self.importScripts('tesseract/worker.min.js');