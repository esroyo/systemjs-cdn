# [systemjs.sh](https://systemjs.sh)

[![codecov](https://codecov.io/gh/esroyo/systemjs-cdn/graph/badge.svg?token=MRNXPM2JNH)](https://codecov.io/gh/esroyo/systemjs-cdn)

A fast, smart, &amp; global content delivery network (CDN) for modern(es2015+)
web development.

[systemjs.sh](https://systemjs.sh) provides a fast, global CDN served using the
[SystemJS module format](https://github.com/systemjs/systemjs/blob/main/docs/system-register.md).

Under the hood It is a simple proxy layer on top of the excellent
[esm.sh](https://esm.sh) CDN service, powered by
[esbuild](https://esbuild.github.io/), [rollup](https://rollupjs.org/),
[Deno](https://deno.com) and [Cloudflare](https://cloudflare.com).

The main use case for this service is to off-load bundling budget while
targeting SystemJS, specially when providing a third-party service.

## Example case

This is [a live example case](https://systemjs-cdn-examples.netlify.app/) of code distributed by a third-party domain
`github.io`, and executed on a first-party domain `netlify.app`. The code
imports modules from the systemjs.sh CDN without any pollution nor creation of
global variables (aside from `System` itself):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to netlify.app</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!--
    SystemJS could be loaded from any CDN (for instance "https://unpkg.com/systemjs/dist/s.min.js")
    The only global variable defined will be `System`.
  -->
  <script src="https://systemjs.sh/systemjs/dist/s.min.js?raw"></script>
  <!--
    Once `System` is loaded we can add an importmap with maps that are
    scoped/limited to our third-party domain (for example: esroyo.github.io).
    We are not interferring with other consumers of `System`, if they exist.
  -->
  <script>
    System.addImportMap({
      // The first-party code will use vue@latest
      "imports": {
        "vue": "https://systemjs.sh/vue",
      },
      "scopes": {
        // The third-party code will use vue@3.3
        "https://esroyo.github.io/systemjs-cdn-examples/": {
          "vue": "https://systemjs.sh/vue@3.3",
        }
      },
    });
  </script>
  <!--
    Finally, we introduce our third-party service script.
    It will use `System` and the scoped importmap.
    It will not pollute or collision in any possible way with the netlify.app code.
    Our third-party service format is SystemJS with externals.
    The "vue" external of that code will resolve to "https://systemjs.sh/vue@3.3"
  -->
  <script src="https://esroyo.github.io/systemjs.sh-examples/dist/assets/index.js"></script>
</head>
<body>
  <div id="app"></div>
  <script>
// This first-party code will resolve to "https://systemjs.sh/vue"
System.import('vue').then((m) => {
  // Will print the "latest" vue version
  console.log(`First party code is using vue@${m.version}`);
});
  </script>
</body>
</html>
```

## Local environment

```sh
# build a docker image of this service
docker build -t systemjs.sh .

# run the service on localhost:8000
docker run -p 8000:8000 systemjs.sh
```

## Purging cache

Only supports purging specific URLs:

```sh
curl -v http://localhost:8000/_purge -F "url=http://localhost:8000/vue@3.4.1"
```
