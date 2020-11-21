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

export class CanvasElement extends Element {
    static viewClass() {return CanvasView;}

    init() {
        super.init();
    }

    setExtent(pixelWidth, pixelHeight, retain) {
        this.style.setProperty("-cards-pixelWidth", pixelWidth);
        this.style.setProperty("-cards-pixelHeight", pixelHeight);
        if (retain !== undefined) {
            this.style.setProperty("-cards-retain-pixels", retain);
        }
    }

    bePartsBinPrototype() {
        super.bePartsBinPrototype();
        this.style.setProperty("width", "200px");
        this.style.setProperty("height", "200px");
        this.style.setProperty("-cards-pixelWidth", "200px");
        this.style.setProperty("-cards-pixelHeight", "200px");
    }
}

CanvasElement.register("CanvasElement");

export class CanvasView extends ElementView {
    createDom() {
        return document.createElement('canvas');
    }

    apply(time, elem, world) {
        super.apply(time, elem, world);
        let style = elem._style.get(time).local;

        let changed = false;
        let imageData;
        ["-cards-pixelWidth", "-cards-pixelHeight"].forEach(k => {
            let value = style[k] || 200;
            if (this.lastValues[k] !== value) {
                changed = changed || true;
            }
        });

        if (changed && style["-cards-retain-pixels"]) {
            if (this.dom.width > 0 && this.dom.height > 0) {
                let ctx = this.dom.getContext("2d");
                imageData = ctx.getImageData(0, 0, this.dom.width, this.dom.height);
            }
        }

        [["-cards-pixelWidth", "width"], ["-cards-pixelHeight", "height"]].forEach(pair => {
            let [k, p] = pair;
            let value = style[k] || 200;
            if (this.lastValues[k] !== value) {
                this.lastValues[k] = value;
                this.dom[p] = parseFloat(value);
            }
        });

        if (imageData) {
            let ctx = this.dom.getContext("2d");
            ctx.putImageData(imageData, 0, 0);
        }

        if (style["-cards-resize-callback"]) {
            let split = style["-cards-resize-callback"].split(".");
            this.call(split[0], split[1]);
        }
    }
}
