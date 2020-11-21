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

export class Tab {
    init() {
        this.subscribe(this.id, "clicked", "Tab.click");
        this.style.setProperty("margin-left", "auto");
        this.style.setProperty("background-color", "#f8ffff");
    }

    click(name) {
        this.getChildNodes().forEach(elem => {
            elem.style.setProperty("border-bottom", elem.domId === name ? "2px solid blue" : "0px");
        });
        this.publishToAll(name);
    }

    beTab(names) {
        let ids = {};
        names.forEach(n => {
            if (n) {
                ids[n] = n;
            }
        });

        if (Object.keys(ids).length !== names.length) {
            throw Error("ids of elems are not unique");
        }

        this.domId = "owner";
        this.style.setProperty("display", "flex");

        names.forEach(n => {
            let child = this.createElement();
            child.domId = n;
            child.innerHTML = n;
            child.classList.add("no-select");
            child.style.setProperty("width", "fit-content");
            child.style.setProperty("margin", "4px");
            child.addEventListener('click', 'TabElement.click');
            child._set("tab", this.id);

            child.setCode(`
class TabElement {
    click(evt) {
      this.publish(this._get("tab"), "clicked", this.domId);
    }
}`);

            this.appendChild(child);
        });
    }
}
