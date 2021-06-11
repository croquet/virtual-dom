/*
Copyright 2020 Croquet Corporation.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

function stringifyInner(node, seen) {
    if (node === undefined) return undefined;
    if (typeof node === 'number') return Number.isFinite(node) ? `${node}` : 'null';
    if (typeof node !== 'object') return JSON.stringify(node);

    let out;
    if (Array.isArray(node)) {
        out = '[';
        for (let i = 0; i < node.length; i++) {
            if (i > 0) out += ',';
            out += stringifyInner(node[i], seen) || 'null';
        }
        return out + ']';
    }

    if (node === null) return 'null';

    if (seen.has(node)) {
        throw new TypeError('Converting circular structure to JSON');
    }

    seen.add(node);

    if (node.constructor === window.Map) {
        let replacement = {__map: true, values: [...node]};
        return stringifyInner(replacement, seen);
    }

    let keys = Object.keys(node).sort();
    out = '';
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let value = stringifyInner(node[key], seen, out);
        if (!value) continue;
        if (out !== '') out += ',';
        out += JSON.stringify(key) + ':' + value;
    }
    seen.delete(node);
    return '{' + out + '}';
}

export function stringify(obj) {
    let seen = new Set();
    return stringifyInner(obj, seen);
}

export function parse(string) {
    return JSON.parse(string, (_key, value) => {
        if (typeof value === "object" && value !== null && value.__map) {
            return new Map(value.values);
        }
        return value;
    });
}
