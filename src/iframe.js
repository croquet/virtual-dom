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

import {Element, ElementView} from './element.js';

const attributes = {
    src: true,
    allow: true,
    importance: true,
    loading: true,
    name: true,
    referrerpolicy: true,
    sandbox: true,
    width: true
};

export class IFrameElement extends Element {
    static viewClass() {return IFrameView;}
    bePartsBinPrototype() {
        super.bePartsBinPrototype();
        this.style.setProperty("width", "600px");
        this.style.setProperty("height", "400px");
        this.style.setProperty("border", "5px solid blue");
        this._set("src", "");
    }

    _set(name, value) {
        super._set(name, value);

        if (attributes[name]) {
            this.needsUpdate();
        }
    }
}

IFrameElement.register("IFrameElement");

export class IFrameView extends ElementView {
    createDom() {
        this.iframe = document.createElement('iframe');
        this.iframe.style.setProperty("border", "5px solid blue");
        return this.iframe;
    }

    apply(time, elem, world) {
        super.apply(time, elem, world);
        for (let k in attributes) {
            let value = elem._get(k);
            if (this.lastValues[k] !== value) {
                this.lastValues[k] = value;
                try {
                    this.iframe[k] = value;
                } catch (e) {
                    console.log("may be some unknown attributes are specified", e);
                }
            }
        }
    }
}
