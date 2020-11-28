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

export class DOMMenu {
    makeMenuItem(asset, className, value, label, receiver, menuSelected) {
        let opt = document.createElement("div");

        if (value === null) {
            // make it the title
            opt.classList.add("no-select");
            opt.classList.add(className + "-title");
            opt.innerHTML = `<span>${label}</span>`;
            return opt;
        }

        let html = "";
        if (asset && !asset.trim().startsWith("<svg")) {
            let sectionName = "img-" + asset;
            html = `<div class="${className}-icon"><svg viewBox="0 0 24 24" class="${className}-icon-svg"><use href="#${sectionName}"></use></svg></div>`;
        } else if (asset && asset.trim().startsWith("<svg")) {
            html = `<div class="${className}-icon">${asset}</div>`;
        }
        html += `<span class="${className}-label">${label}</span>`;
        opt.innerHTML = html;
        opt.classList.add(`${className}-item`);
        opt.value = value;
        if (menuSelected) {
            opt.addEventListener("click", (evt) => menuSelected.call(receiver, evt), true);
        } else {
            opt.addEventListener("click", (evt) => console.log(evt), true);
        }
        return opt;
    }

    makeMenu(elem, className, triples, receiver, menuSelected) {
        // triples = [{value, label, asset}]
        // value is the id of the choice, label is what is shown on screen,
        // and asset is svg name (for now)

        let select = document.createElement("div");
        select.classList.add(className, "no-select");

        triples.forEach(({value, label, asset}) => {
            let opt = this.makeMenuItem(asset, className, value, label, receiver, menuSelected);
            select.appendChild(opt);
        });

        elem.classList.add(`${className}-holder`);
        elem.appendChild(select);
        return elem;
    }
}
