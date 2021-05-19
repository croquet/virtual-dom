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
import {start, TopModel, Element} from "./element.js";
import {initializeElementClasses} from "./globals.js";
import {loader, svgSpriteLoader} from "./loader.js";

function single(code, sessionOptions, sessionName, init) {
    class Model extends TopModel {
        init(options, persistentData) {
            super.init(options, persistentData);
            this.future(0).load(options, persistentData);
        }

        load(options, persistentData) {
            let element = Element.create();
            element.beWorld();
            element.style.setProperty("height", "100%");
            element.topChild = true;
            element.evaluate(options.code, options.json, options.projectCode, persistentData);
        }
    }

    Model.register("Model");

    if (sessionName) {
        return loader(code, null, Model, Element, start, sessionOptions, sessionName);
    }

    Croquet.App.autoSession("q").then((name) => {
        name = `${init}-${name}`;
        loader(code, null, Model, Element, start, sessionOptions, name);
    });
}

export function makeMain(init, sessionOptions, library, sessionName, svgFileName) {
    let projectCode = `
return function projectCode(parent, json, persistentData) {
    parent.topChild = true;
    parent.domId = "top";
    parent.style.setProperty("position", "relative");
    parent.style.setProperty("overflow", "hidden");
    parent.style.setProperty("width", "100%");
    parent.style.setProperty("height", "100%");
    let initializer = parent.getLibrary("${init}");
    let func = new Function(initializer)();
    func(parent, json, persistentData);
    return parent;
}`;

    if (svgFileName) {
        svgSpriteLoader(svgFileName);
    }
    return async function main() {
        initializeElementClasses();
        library.installAsBaseLibrary();
        single(projectCode, sessionOptions, sessionName, init);
    };
}
