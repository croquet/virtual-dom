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
        this.values = {local: {}, classes: null};
    }

    get() {
        return this.values;
    }

    setProperty(name, value) {
        this.values.local[name] = value;
    }

    removeProperty(name) {
        delete this.values.local[name];
    }

    getPropertyValue(name) {
        return this.values.local[name];
    }

    getStyleString() {
        let r = this.values;
        let c = [];
        for (let k in r.local) {
            let value = r.local[k];
            let v;

            if (k.startsWith("-cards-")) {
                if (k === "-cards-background-image-asset") {
                    let id = Croquet.Data.toId(value.handle);
                    v = id + "." + value.type;
                } else {
                    v = JSON.stringify(value);
                }
            } else {
                v = `${value}`;
            }
            c.push(`${k}: ${v};`);
        }
        if (r.classes) {
            c.push(r.classes);
        }
        return c.join('\n');
    }

    setStyleString(string) {
        if (!string) {return;}
        let simpleRE = /^[ \t]*([^:]+)[ \t]*:[ \t]*([^{]+)[ \t]*[;][ \t]*$/;
        let index = 0;
        let array = string.split('\n');
        let dict = {};

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
                dict[key] = value;
                index++;
            } else {
                break;
            }
        }

        let rest = array.slice(index).join('\n');

        if (rest.trim().length === 0) {
            rest = null;
        }

        this.values = {local: dict, classes: rest};
    }

    setClasses(string) {
        this.values.classes = string;
    }

    getClasses() {
        return this.values.classes;
    }

    getTransform() {
        let r = this.values.local;
        if (r['-cards-direct-manipulation']) {
            return r['-cards-transform'];
        }
        return [1, 0, 0, 1, 0, 0];
    }

    setTransform(array) {
        // canonical value should be array.  But there is a chance that we might also allow
        // symbolic spec
        let r = this.values;
        let local = {...r.local, ...{'-cards-transform': array}};
        let n = {local, classes: r.classes};
        this.values = n;
    }

    getTransformOrigin() {
        let r = this.values.local;
        if (r['-cards-direct-manipulation']) {
            return r['-cards-transform-origin'];
        }
        return "";
    }

    setTransformOrigin(string) {
        let r = this.values;
        let local = {...r.local, ...{'-cards-transform-origin': string}};
        let n = {local, classes: r.classes};
        this.values = n;
    }
}
