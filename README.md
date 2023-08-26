# [systemjs.sh](https://systemjs.sh) 
A fast, smart, &amp; global content delivery network (CDN) for modern(es2015+) web development.

[systemjs.sh](https://systemjs.sh) provides a fast, global CDN served using the [SystemJS module format](https://github.com/systemjs/systemjs/blob/main/docs/system-register.md).

Under the hood It is a simple proxy layer on top of the excellent [esm.sh](https://esm.sh) CDN service, powered by [esbuild](https://esbuild.github.io/), [rollup](https://rollupjs.org/), [Deno](https://deno.com) and [Cloudflare](https://cloudflare.com).

The main use case for this service is to off-load bundling budget while targeting SystemJS, specially when providing a third-party service.

## Example case

This is an example case of code distributed by a third-party domain `esroyo.github.io`, and executed on a first-party domain `foo.com`. The code imports modules from the systemjs.sh CDN without any pollution nor creation of global variables (aside from `System` itself):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to foo.com</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!--
    My third-party service just needs to load SystemJS.
    The only global variable defined will be `System`.
  -->
  <script src="https://unpkg.com/systemjs/dist/s.min.js"></script>
  <!--
    Once `System` is loaded we can add an importmap with maps that are
    scoped/limited to our third-party domain (for example: esroyo.github.io).
    We are not interferring with other consumers of `System`, if they exist.
  -->
  <script>
  System.addImportMap({
    "scopes": {
      "https://esroyo.github.io/": {
        // vue will be loaded from the systemjs.sh CDN
        "vue": "https://systemjs.sh/vue",
      }
    },
  });
  </script>
  <!--
    Finally, we introduce our third-party service script.
    It will use `System` and the scoped importmap.
    It will not pollute or collision in any possible way with foo.com
    Our third-party service format is SystemJS with externals (for example "vue").
  -->
  <script src="https://esroyo.github.io/systemjs.sh-examples/dist/assets/index.js"></script>
</head>
<body>
  <div id="app"></div>
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
