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

/* globals Croquet */
let _id = 0;

export function newId(isRandom) {
    if (!isRandom) {
        return (++_id).toString().padStart(4, '0');
    }

    function hex() {
        let r = Math.random();
        return Math.floor(r * 256).toString(16).padStart(2, "0");
    }
    return `${hex()}${hex()}`;
}

export class Style { // extends TimeObject
    constructor() {
        this.local = new Map();
        this.classes = null; // or string
    }

    setProperty(name, value) {
        this.local.set(name, value);
    }

    removeProperty(name) {
        this.local.delete(name);
    }

    getPropertyValue(name) {
        return this.local.get(name);
    }

    getStyleString() {
        let c = [];
        let local = this.local;
        local.forEach((value, key) => {
            let v;

            if (key.startsWith("-cards-")) {
                if (key === "-cards-background-image-asset") {
                    let id = Croquet.Data.toId(value.handle);
                    v = id + "." + value.type;
                } else {
                    if (typeof value === "object" && value.constructor !== Array) {
                        console.log("potentially dangerous value", value);
                    }
                    v = JSON.stringify(value);
                }
            } else {
                v = `${value}`;
            }
            c.push(`${key}: ${v};`);
        });

        if (this.classes) {
            c.push(this.classes);
        }
        return c.join("\n");
    }

    setStyleString(string) {
        if (!string) {return;}
        let simpleRE = /^[ \t]*([^:]+)[ \t]*:[ \t]*([^{]+)[ \t]*[;][ \t]*$/;
        let index = 0;
        let array = string.split('\n');
        let dict = new Map();

        while (true) {
            let line = array[index];
            let match = simpleRE.exec(line);
            if (match) {
                let key = match[1];
                let value = match[2];
                if (key.startsWith("-cards-")) {
                    if (key === "-cards-background-image-asset") {
                        let split = value.split(".");
                        value = {handle: Croquet.Data.fromId(split[0]), type: split[1]};
                    } else {
                        value = JSON.parse(value);
                    }
                }
                dict.set(key, value);
                index++;
            } else {
                break;
            }
        }

        let rest = array.slice(index).join('\n');

        if (rest.trim().length === 0) {
            rest = null;
        }

        this.local = dict;
        this.classes = rest;
    }

    setClasses(string) {
        this.classes = string;
    }

    getClasses() {
        return this.classes;
    }

    getTransform() {
        let local = this.local;
        if (local.get('-cards-direct-manipulation')) {
            return local.get('-cards-transform');
        }
        return [1, 0, 0, 1, 0, 0];
    }

    setTransform(array) {
        // canonical value should be array.  But there is a chance that we might also allow
        // symbolic spec

        this.local.set("-cards-transform", array);
    }

    getTransformOrigin() {
        let local = this.local;
        if (local['-cards-direct-manipulation']) {
            return local['-cards-transform-origin'];
        }
        return "";
    }

    setTransformOrigin(string) {
        this.local.set('-cards-transform-origin', string);
    }
}
