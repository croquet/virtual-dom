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

export class Menu {
    init()  {
        this.subscribe(this.id, "clicked", "Menu.clicked");
    }

    beMenu(evt, names) {
        this.domId = "owner";
        this._set("evt", evt);
        this.style.setProperty("left", evt.clientX + "px");
        this.style.setProperty("top", evt.clientY + "px");

        this.style.setProperty("display", "flex");
        this.style.setProperty("flex-direction", "column");
        this.style.setProperty("position", "absolute");
        this.style.setProperty("background-color", "white");
        this.style.setProperty("border", "1px solid black");

        names.forEach(n => {
            let child = this.createElement();
            child._set("name", n);
            child.innerHTML = n;
            child.setClassList(["no-select"]);
            child.style.setProperty("width", "fit-content");
            child.style.setProperty("margin", "4px");
            child.addEventListener("click", "MenuElement.click");
            child._set("menu", this.id);
            child.setCode(`
class MenuElement {
  click(evt) {
    this.publish(this._get("menu"), "clicked", this._get("name"));
  }
}`);
            this.appendChild(child);
        });
    }

    clicked(name) {
        this.publishToAll({name, evt: this._get("evt")});
        this.remove();
    }
}
