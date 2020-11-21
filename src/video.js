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

export class VideoElement extends Element {
    static viewClass() {return VideoView;}

    bePartsBinPrototype() {
        super.bePartsBinPrototype();
        this.style.setProperty("width", "300px");
        this.style.setProperty("height", "200px");
        this.style.setProperty("border", "5px solid blue");
    }
}

VideoElement.register("VideoElement");

export class VideoView extends ElementView {
    createDom() {
        return document.createElement('video');
    }

    play() {
        return this.dom.play();
    }

    set srcObject(obj) {
        return this.dom.srcObject = obj;
    }

    get srcObject() {
        return this.dom.srcObject;
    }

    set muted(flag) {
        return this.dom.muted = flag;
    }

    get muted() {
        return this.dom.muted;
    }

    set playsInline(flag) {
        return this.dom.playsInline = flag;
    }

    get playsInline() {
        return this.dom.playsInline;
    }

    apply(time, elem, world) {
        super.apply(time, elem, world);

        let k = "src";
        let value = elem._get(k);
        if (this.lastValues[k] !== value) {
            this.lastValues[k] = value;
            this.dom.src = value;
        }
    }
}
