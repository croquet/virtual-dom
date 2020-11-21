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

/* we rely on the global state for the default version of code.
   If an element overrides an expander or a function, that would be stored in the model.
   The entry point, or makeMain, sets up the default part of the library, and store it in a global variable.

  There would be a kind of inheritance scheme where looking up library code involves to look up the parent tree.

  At the set up time:

  let library = new Library();
  libray.add(...);
  library.installAsBaseLibrary(); // => window.globalLibrary is set. In a common case, it should be called only once.

-------
  let code = this.getLibrary("boards.PeerView");

  ==> look up the key ("boards") from "this", until it finds a nested parent that has it, or hits the global one

  ==> return the entry from that library object
*/

/* global Croquet */

export class Library {
    constructor() {
        this.library = {};
    }

    find(path, tree) {
        if (!path) {throw new Error("path has to be specified");}
        path = path.split(".");

        let t = tree;
        while (path[0] && path[1]) {
            let p = path.shift();
            if (!t[p]) {
                t[p] = {};
            }
            t = t[p];
        }

        return [t, path[0]];
    }

    add(path, library) {
        let [t, p] = this.find(path, this.library);
        t[p] = library;
    }

    addLibrary(path, library) {
        let obj = {};

        if (library.expanders) {
            library.expanders.forEach(cls => {
                obj[cls.name] = cls.toString();
            });
        }

        if (library.functions) {
            library.functions.forEach(f => {
                let str = `return ${f.toString()};`;
                obj[f.name] = str;
            });
        }

        if (library.classes) {
            library.classes.forEach(cls => {
                obj[cls.name] = cls;
            });
        }

        this.add(path, obj);
    }

    has(base) {
        return !!this.library[base];
    }

    get(path) {
        let [t, p] = this.find(path, this.library);
        return t[p];
    }

    remove(path) {
        let [t, p] = this.find(path, this.library);
        delete t[p];
    }

    installAsBaseLibrary() {
        Croquet.Constants.library = this;
    }

    static getGlobalLibrary() {
        return Croquet.Constants.library;
    }
}
