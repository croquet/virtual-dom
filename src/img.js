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

import {Element, ElementView} from './element.js';

const attributes = ["alt", "crossorigin", "height", "ismap", "loading", "longdesc", "referrerpolicy", "sizes", "src", "srcset", "usemap", "width"];

export class ImageElement extends Element {
    static viewClass() {return ImageView;}
    bePartsBinPrototype() {
        super.bePartsBinPrototype();
        this.style.setProperty("width", "200px");
        this.style.setProperty("height", "200px");
        this._set("width", 200);
        this._set("height", 200);
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

ImageElement.register("ImageElement");

export class ImageView extends ElementView {
    createDom() {
        this.img = document.createElement("img");
        this.img.onload = () => {
            if (this.onload) {
                this.call(...this.onload, this);
            }
        };

        this.img.onerror = () => {
            if (this.onerror)  {
                this.call(...this.onerror, this);
            }
        };
        return this.img;
    }

    apply(time, elem, world) {
        super.apply(time, elem, world);

        let updated = attributes.filter((k) => {
            let value = elem._get(k);
            return this._lastValues.get(k) !== value;
        }).map((k) => [k, elem._get(k)]);

        try {
            updated.forEach(([k, value]) => {
                this._lastValues.set(k, value);
                if (k === "src") {
                    if (value) {
                        if (typeof value === "string") {
                            this.img.src = value;
                        } else {
                            Croquet.Data.fetch(this.sessionId, value.handle).then((data) => {
                                const blob = new Blob([data], {type: value.type});
                                if (this._objectURL) {
                                    URL.revokeObjectURL(this._objectURL);
                                }
                                this._objectURL = URL.createObjectURL(blob);
                                this.dom.src =  this._objectURL;
                            });
                        }
                    } else {
                        this.dom.removeAttribute("src");
                        if (this._objectURL) {
                            URL.revokeObjectURL(this._objectURL);
                        }
                    }
                } else {
                    this.img[k] = value;
                }
            });
        }  catch (e) {
            console.log("may be some unknown attributes are specified", e);
        }
    }
}
