# Croquet Virtual DOM

last modified on 2025-06-12

## Introduction
Croquet Virtual DOM is an application framework that helps to develop an application based on the Document Object Model and real time collaboration over the Croquet library.

For basic concepts and examples, please refer to `docs/en/vdom.md.html`.

## Installation

There is exactly one external dependency, which is the Croquet Client library. You can simply copy that library to your local directory:

~~~~~~~~
# mkdir -p croquet; curl -L -o croquet/croquet-latest.min.js https://cdn.jsdelivr.net/npm/@croquet/croquet
~~~~~~~~

The `-L` option specifies to follow redirection. You may copy the file from `https://cdn.jsdelivr.net/npm/@croquet/croquet@1/pub/croquet.min.js`.

You can also change the `script` tag of your html file to refer to the latest code at `https://cdn.jsdelivr.net/npm/@croquet/croquet`. The advantage of copying the file to a local directory is that you can develop your application off the internet.

For those example applications to run, you need to obtain the API key from croquet.io/keys. Once you create an API key, replace `"<put your apiKey from croquet.io/keys>"` line in apiKey.js with it.

An application can be developed without using npm or additional package manager. You can run the simple http server (written in JavaScript):

~~~~~~~~
# node server.js &
~~~~~~~~

and point your browser to an example such as `localhost:8000/apps/text-chat.html`. There is an equivalent server written in Python (server.py), for those who don't install Node.js but has Python.

Alternatively, you can specify `@croquet/croquet` as dependency in package.json and use a bundler. Howeever, the expander code requires the class and method names are retained. Refer to the Deployment section below for more information.

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

run `npm install`, and run something the following to make a distributable set of minified files in a directory called `dist`.

~~~~~~~~
mkdir -p dist/examples
mkdir -p dist/src
mkdir -p dist/widgets
cp examples/<your example.js> dist/examples/
npx rollup src/croquet-virtual-dom.js --config rollup.config.js --file dist/src/croquet-virtual-dom.js --format es
npx rollup widgets/widgets.js --config rollup.config.js --file dist/widgets/widgets.js --format es
cp croquet/croquet-latest.min.js dist/croquet/croquet-latest.min.js
~~~~~~~~

## Alternative Deployment Scheme

Lately, many apps that use the Croquet Virtual DOM Framework have its own directory. All they need is to load the croquet library and `croquet-virtual-dom.js` from jsdelivr. Please refer to the [description on npmjs.com](https://www.npmjs.com/package/@croquet/virtual-dom).
