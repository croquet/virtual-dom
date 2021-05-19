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

class Epidemic {
    init() {
        this.subscribe(this.sessionId, "start", "start");
    }

    start() {
        let parent = this.parentNode;
        let count = parent.querySelector("#count");
        let n;
        if (count) {
            n = parseInt(count.value, 10);
        }

        if (!n || Number.isNaN(n)) {
            n = 1000;
            count.load("" + n);
        }
        this.setCount(n);
        if (!this._get("stepping")) {
            this._set("stepping", true);
            this.step();
        }
    }

    setCount(n) {
        if (!this._get("map")) {
            let map = new Uint8Array(512 * 512);
            this._set("map", map);
        }

        let villagers = this._get("villagers");

        if (villagers && villagers.length === n) {return;}

        villagers = [];
        for (let i = 0; i < n; i++) {
            let m = Math.random() * Math.PI * 2;
            let villager = {
                x: Math.random() * 512,
                y: Math.random() * 512,
                dirX: Math.cos(m),
                dirY: Math.sin(m),
                state: i === 0 ? "infectious" : "susceptible"
            };
            villagers.push(villager);
        }
        this._set("villagers", villagers);
    }

    step() {
        let map = this._get("map");
        if (!map) {return;}
        let villagers = this._get("villagers");
        if (!villagers) {return;}

        if (!this._get("lastSaveTime")) {
            this._set("lastSaveTime", this.now());
        }

        if (this._get("stepping")) {
            this.future(50).call("Epidemic", "step");
        }

        map.fill(0);
        for (let i = 0; i < villagers.length; i++) {
            let villager = villagers[i];
            let x = villager.x;
            let y = villager.y;

            let dirX = villager.dirX;
            let dirY = villager.dirY;
            let newX = x + dirX;
            let newY = y + dirY;

            if (newX < 0) {
                newX = -newX;
                villager.dirX = -dirX;
            }
            if (newX >= 512) {
                newX = 512 - (newX - 512);
                villager.dirX = -dirX;
            }

            if (newY < 0) {
                newY = -newY;
                villager.dirY = -dirY;
            }
            if (newY >= 512) {
                newY = 512 - (newY - 512);
                villager.dirY = -dirY;
            }

            villager.x = newX;
            villager.y = newY;

            if (villager.state === "infectious") {
                let tx = Math.trunc(newX);
                let ty = Math.trunc(newY);
                let index;
                index = Math.max(tx - 1, 0) + Math.max(ty - 1, 0) * 512;
                map[index] = 1;

                index = tx + Math.max(ty - 1, 0) * 512;
                map[index] = 1;

                index = Math.min(tx + 1, 511) + Math.max(ty - 1, 0) * 512;
                map[index] = 1;

                index = Math.max(tx - 1, 0) + ty * 512;
                map[index] = 1;

                index = tx + ty * 512;
                map[index] = 1;

                index = Math.min(tx + 1, 511) + ty * 512;
                map[index] = 1;

                index = Math.max(tx - 1, 0) + Math.min(ty + 1, 511) * 512;
                map[index] = 1;

                index = tx + Math.min(ty + 1, 511) * 512;
                map[index] = 1;

                index = Math.min(tx + 1, 511) + Math.min(ty + 1, 511) * 512;
                map[index] = 1;

            }
        }

        for (let i = 0; i < villagers.length; i++) {
            let villager = villagers[i];
            let x = villager.x;
            let y = villager.y;
            let index = Math.trunc(x) + Math.trunc(y) * 512;
            let m = map[index];
            if (villager.state === "susceptible" && m > 0) {
                villager.state = "infectious";
            }
        }
        this.publish(this.id, "update");

        if (this.now() > this._get("lastSaveTime") + 30000) {
            this._set("lastSaveTime", this.now());
            this.savePersistentData();
        }
    }

    loadPersistentData(data) {
        this._set("villagers", data);
        let parent = this.parentNode;
        let count = parent.querySelector("#count");
        if (count) {
            let n = data ? data.length : 1000;
            count.load(`${n}`);
        }
    }

    savePersistentData() {
        let top = this.wellKnownModel("modelRoot");
        let func = () => this._get("villagers");
        top.persistSession(func);
    }
}

class EpidemicView {
    init() {
        this.subscribe(this.model.id, "update", "update");
        this.update();
    }

    update() {
        let villagers = this.model._get("villagers");
        if (!villagers) {return;}
        let canvas = this.querySelector("#holder");
        if (!canvas) {return;}
        canvas = canvas.dom;
        if (!canvas) {return;}
        let ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < villagers.length; i++) {
            let villager = villagers[i];
            if (villager.state === "infectious") {
                ctx.fillStyle = "red";
            } else {
                ctx.fillStyle = "blue";
            }

            ctx.beginPath();
            ctx.arc(villager.x, villager.y, 2, 0, Math.PI * 2, false);
            ctx.fill();
        }
    }
}

class StartButton {
    init() {
        this.addEventListener("click", "click");
    }

    click() {
        this.publish(this.sessionId, "start");
    }
}

function beEpidemic(top, json, persistentData) {
    let elem = top.createElement();
    elem.setCode("epidemic.Epidemic");
    elem.setViewCode("epidemic.EpidemicView");

    let holder = top.createElement("CanvasElement");
    holder.domId = "holder";
    holder.setExtent(512, 512);
    holder.style.setProperty("width", "512px");
    holder.style.setProperty("height", "512px");
    holder.style.setProperty("background-color", "#202020");

    let button = top.createElement();
    button.innerHTML = "Start";
    button.setCode("epidemic.StartButton");
    button.style.setProperty("border", "1px solid black");
    button.style.setProperty("border-radius", "5px");
    button.style.setProperty("width", "fit-content");
    button.style.setProperty("margin", "2px");
    button.style.setProperty("padding", "3px");

    let count = top.createElement("TextElement");
    count.domId = "count";
    count.setWidth(100);
    count.style.setProperty("height", 28);
    count.style.setProperty("-cards-text-margin", "4 4 4 4");
    count.load("1000");

    elem.appendChild(holder);
    elem.appendChild(button);
    elem.appendChild(count);

    top.appendChild(elem);
    if (persistentData) {
        elem.call("Epidemic", "loadPersistentData", persistentData);
    }
}

export const epidemic = {
    expanders: [Epidemic, EpidemicView, StartButton],
    functions: [beEpidemic]
};
