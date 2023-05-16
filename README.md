# [systemjs.sh](https://systemjs.sh) 
A fast, smart, &amp; global content delivery network (CDN) for modern(es2015+) web development.

[systemjs.sh](https://systemjs.sh) provides a fast, global CDN served using the [SystemJS module format](https://github.com/systemjs/systemjs/blob/main/docs/system-register.md).

Under the hood It is a simple proxy layer on top of the excellent [esm.sh](https://esm.sh) CDN service, powered by [esbuild](https://esbuild.github.io/), [rollup](https://rollupjs.org/), [Deno](https://deno.com) and [Cloudflare](https://cloudflare.com).

The main use case for this service is to off-load bundling budget while targeting SystemJS. Although (for demostration) It's possible to use it directly on HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>SystemJS CDN Example</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script type="systemjs-importmap">
    {
      "imports": {
        "react": "https://systemjs.sh/react",
        "react-dom": "https://systemjs.sh/react-dom"
      }
    }
  </script>
  <script src="https://unpkg.com/systemjs/dist/s.min.js"></script>
</head>
<body>
  <div id="react-root"></div>
  <script>
System.register(["react", "react-dom"], function (_export, _context) {
  "use strict";

  var React, ReactDOM;
  return {
    setters: [function (_react) {
      React = _react.default;
    }, function (_reactDom) {
      ReactDOM = _reactDom.default;
    }],
    execute: function () {
      ReactDOM.render(React.createElement("button", null, "A button created by React"), document.getElementById('react-root'));
    }
  };
});
  </script>
</body>
</html>
```
