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

const attributes = ["src", "allow", "importance", "loading", "name", "referrerpolicy", "sandbox", "width"];

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
        let old = this._get(name);
        super._set(name, value);

        if (attributes.indexOf(name) >= 0) {
            if (old !== value || name === "src") {
                this.needsUpdate();
            }
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
        let parent = this.iframe.parentNode;
        let refNode = this.iframe.nextSibling;

        let updated = attributes.filter((k) => {
            let value = elem._get(k);
            return this.lastValues[k] !== value || (k === "src" && typeof value === "string");
        }).map((k) => [k, elem._get(k)]);

        // Remove the actual iframe element temporarily so that setting src does not
        // mutate browser history

        try {
            if (parent) {
                this.iframe.remove();
            }
            updated.forEach(([k, value]) => {
                this.iframe[k] = value;
            });
        }  catch (e) {
            console.log("may be some unknown attributes are specified", e);
        } finally {
            if (parent) {
                parent.insertBefore(this.iframe, refNode);
            }
        }
    }
}
