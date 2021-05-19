# Croquet Virtual DOM

last modified on 2021-05-19, or May 19th, 2021

## Introduction
Croquet Virtual DOM is an application framework that helps to develop an application based on the Document Object Model and real time collaboration over the Croquet library.

For basic concepts and examples, please refer to `docs/en/vdom.md.html`.

## Installation

There is exactly one external dependency, which is the Croquet SDK library. You can simply copy the SDK to your local directory:

~~~~~~~~
# mkdir -p croquet; curl -L -o croquet/croquet-latest.min.js https://unpkg.com/@croquet/croquet@0.5.0
~~~~~~~~

The `-L` option specifies to follow redirection. You may copy the file from `https://unpkg.com/@croquet/croquet@0.5.0/pub/croquet.min.js`.

You can also change the `script` tag of your html file to refer to the latest code at `https://unpkg.com/@croquet/croquet@0.5.0`.  The advantage of copying the file to a local directory is that you can develop your application off the internet.

An application can be developed without using npm or additional package manager. You can run the simple http server (written in JavaScript):

~~~~~~~~
# node server.js &
~~~~~~~~

and point your browser to an example such as `localhost:8000/apps/text-chat.html`. There is an equivalent server written in Python (server.py), for those who don't install Node.js but has Python.

Alternatively, You can run `npm install`, modify the `import` statments to refer to use the npm package (namely, `@croquet/croquet`), and use a bundler. Howeever, the expander code requires the class and method names are retained. Refer to the Deployment section below for more information.

## Deployment

When you prefer to create a minified and simplified deployment, you can roll up some files. Add `devDependencies` to your package.json:

~~~~~~~~
  "devDependencies": {
    "@babel/core": "^7.9.0",
    "rollup": "^2.17.0",
    "rollup-plugin-babel": "^4.4.0",
    "rollup-plugin-terser": "^5.2.0"
  }
~~~~~~~~

run `npm install`, and run the following:

~~~~~~~~
mkdir -p dist/examples
mkdir -p dist/src
mkdir -p dist/widgets
cp examples/<your example.js> dist/examples/
npx rollup src/framework.js --config rollup.config.js --file dist/src/framework.js --format es
npx rollup widgets/widgets.js --config rollup.config.js --file dist/widgets/widgets.js --format es
cp croquet/croquet-latest.min.js dist/croquet/croquet-latest.min.js
~~~~~~~~

to create minified files. in this example, the `dist` directory contains all files you need to copy to a server.
