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

class Counter {
    init() {
        this.addEventListener("click", "reset");
        if (this._get("count") === undefined) {
            this._set("count", 0);
            this.future(1000).call("Counter", "next");
        }
        console.log("Counter.init");
    }

    next() {
        let c = this._get("count") + 1;
        this._set("count", c);
        this.value = "" + c;
        this.future(1000).call("Counter", "next");
    }

    reset() {
        let c = 0;
        this._set("count", c);
        this.value = "" + c;
    }
}

function beCounter(parent, json) {
    let text = parent.createElement("TextElement");
    text.style.setProperty("width", "200px");
    text.style.setProperty("height", "50px");
    text.setDefault("serif", 12);
    parent.appendChild(text);
    text.setCode("counter.Counter");
}

export const counter = {
    expanders: [Counter],
    functions: [beCounter]
};
