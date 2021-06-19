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

/* globals Croquet Swal */

class PictureModel {
    init() {
        this.subscribe(this.id, "addImage", "addImage");
        this.subscribe(this.id, "removeImage", "removeImage");
        this.subscribe(this.id, "goToImage", "goToImage");
        this.subscribe(this.sessionId, "loadImage", "loadImage");
        if (!this._get("images")) {
            this._set("images", [{key: 0, width: 1024, height: 768}]);
            this._set("index", 0); // there is already an entry
            this._set("key", 1); // 0 is used as default
            let image = this.createElement("img");
            image.domId = "image";
            this.appendChild(image);

            let buttons = ["addButton", "delButton", "prevButton", "nextButton"];
            buttons.forEach(name => {
                let button = this.createElement();
                button.classList.add("picture-button");
                button.domId = name;
                this.appendChild(button);
            });
        }

        console.log("PictureModel.init");
    }

    find(key) {
        let images = this._get("images");
        return images.find(i => i.key === key);
    }

    findIndex(key) {
        let images = this._get("images");
        return images.findIndex(i => i.key === key);
    }

    addImage(data) {
        // let {handle, type, width, height, name} = data;

        let key = this._get("key");
        data.key = key;
        this._set("key", key + 1);

        let images = [...this._get("images")];
        let index = this._get("index");

        let current = images[index];
        images.splice(index + 1, 0, data);
        this._set("images", images);

        this._set("index", index + 1);
        this.goToImage({from: current && current.key, to: data.key});
    }

    goToImage(obj) {
        let images = this._get("images");
        let index = this.findIndex(obj.to);

        if (images && images.length > index) {
            this._set("index", index);
            let entry = images[index];
            this.publish(this.sessionId, "loadImage", entry);
        }
    }

    removeImage(key) {
        if (key === 0) {return;}
        // there should be always at least one
        let images = [...this._get("images")];
        let index = this.findIndex(key);
        if (index > 0) {
            images.splice(index, 1);
            this._set("images", images);
            let prev = images[index - 1];
            this.goToImage({to: prev.key});
        }
    }

    loadImage(entry) {
        let img = this.querySelector("#image");
        if (!entry) {return;}

        let {handle, type, width, height, name: _name} = entry;

        img.style.setProperty("width", `${width}px`);
        img.style.setProperty("height", `${height}px`);
        
        if (entry.key !== 0) {
            img._set("src", {handle, type});
        } else {
            img._delete("src");
        }

        this.publish(this.id, "loadImage", entry);
    }

    loadPersistentData(data) {
        this._set("images", data);
        this._set("index", data && data.length > 0 ? 0 : -1);
    }

    savePersistentData() {
        let top = this.wellKnownModel("modelRoot");
        let func = () => this._get("images");
        top.persistSession(func);
    }
}

class PictureView {
    init() {
        window.ondrop = event => {
            event.preventDefault();
            for (const item of event.dataTransfer.items) {
                if (item.kind === "file") this.addFile(item.getAsFile());
            }
        };

        window.onresize = () => {
            let images = this.model._get("images");
            let entry = images[this.model._get("index")];
            if (entry) {
                this.loadImage(entry);
                this.publish(this.sessionId, "loadImage", entry);
            }
        };

        this.isTouch = "ontouchstart" in window;

        let input = document.createElement("div");
        input.innerHTML = `<input id="imageinput" type="file" multiple accept="image/*" style="display:none;">`;
        this.imageinput = input.firstChild;
        this.dom.appendChild(this.imageinput);

        this.imageinput.onchange = () => {
            for (const file of this.imageinput.files) {
                this.addFile(file);
            }
        };

        this.querySelector("#nextButton").dom.onclick = () => this.advance(1);
        this.querySelector("#prevButton").dom.onclick = () => this.advance(-1);
        this.querySelector("#addButton").dom.onclick = () => this.imageinput.click();
        this.querySelector("#delButton").dom.onclick = () => this.remove();

        if (!this.isTouch) {
            let timer = 0;
            window.onpointermove = () => {
                if (timer) {
                    clearTimeout(timer);
                } else {
                    this.dom.classList.remove("mouse-inactive");
                }
                timer = setTimeout(() => {
                    this.dom.classList.add("mouse-inactive");
                    timer = 0;
                }, 3000);
            };
            window.onpointermove();
        }

        window.onresize();

        this.subscribe(this.model.id, "loadImage", "loadImage");
    }

    loadImage(entry) {
        let img = this.querySelector("#image");
        let {width, height} = entry;

        let scale = Math.min(window.innerWidth / width, window.innerHeight / height);
        img.dom.style.setProperty("transform", `scale(${scale})`);
        img.dom.style.setProperty("transform-origin", `0 0`);
    }

    async addFile(file) {
        const types = ["image/jpeg", "image/gif", "image/png", "image/bmp"];
        if (!types.includes(file.type)) {
            await Swal.fire({
                title: `${file.name}: not a supported image format`,
                text: "Please use jpeg, gif, png, or bmp.",
                icon: "error",
                toast: true,
                timer: 10000,
                position: "top-end",
            });
            return;
        }

        let data;
        if (file.croquet_contents) data = file.croquet_contents;
        else {
            data = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsArrayBuffer(file);
            });
        }
        const blob = new Blob([data], { type: file.type });
        const { width, height, thumb } = await this.analyzeImage(blob);

        if (!thumb || !width || !height) {
            await Swal.fire({
                title: `Failed to import ${file.name}`,
                text: this.isHEIF(data) ? "HEIF images are not supported by this browser" : `${file.name} is corrupted or has zero extent`,
                icon: "error",
                toast: true,
                timer: 10000,
                position: "top-end",
            });
            return;
        }

        const handle = await Croquet.Data.store(this.sessionId, data);
        this.publish(this.model.id, "addImage", {handle, type: file.type, width, height, name: file.name});
    }

    async analyzeImage(blob) {
        const THUMB_SIZE = 32;
        // load image
        const original = new Image();
        original.src = URL.createObjectURL(blob);
        let success = true;
        try {await original.decode();} catch (ex) {success = false;}
        URL.revokeObjectURL(original.src);
        if (!success) return {};

        const { width, height } = original;
        if (!original.width || !original.height) return {};

        // render to thumbnail canvas
        const aspect = original.width / original.height;
        const scale = THUMB_SIZE / Math.max(original.width, original.height);
        const canvas = document.createElement('canvas');
        canvas.width = aspect >= 1 ? THUMB_SIZE : THUMB_SIZE * aspect;
        canvas.height = aspect <= 1 ? THUMB_SIZE : THUMB_SIZE / aspect;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(original, 0, 0);
        // export as data url
        const thumb = canvas.toDataURL("image/png");
        return { width, height, thumb };
    }

    advance(offset) {
        let images = this.model._get("images");
        let index = this.model._get("index");
        let current = images[index];
        let next = images[index + offset];
        if (current && next) {
            this.publish(this.model.id, "goToImage", {from: current.key, to: next.key});
        }
    }

    async remove() {
        let images = this.model._get("images");
        let index = this.model._get("index");
        let current = images[index];
        if (!current) return;
        const result = await Swal.fire({
            title: 'Delete this image?',
            text: 'There is no undo, yet 😬',
            imageUrl: current.thumb,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'No, keep it',
        });
        if (result.value) {
            this.publish(this.model.id, "removeImage", current.key);
        }
    }
}

function pictureStart(parent, _json, _persist) {
    let picture = parent.createElement();
    picture.domId = "picture";
    picture.setCode("pictures.PictureModel");
    picture.setViewCode("pictures.PictureView");

    picture.setStyleClasses(`
.picture-button {
    position: absolute;
    z-index: 2;
    width: 48px;
    height: 48px;
    border-radius: 24px;
    opacity: 0.5;
    transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
    background-color: rgba(0, 0, 0, 0.5);
    background-size: 192px 48px;
    background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAAAYCAQAAACv4DAfAAAAn0lEQVR42u2Wuw2AMAwFWSIrUDENbEOfsTIF20BxNBQgJOIXQYHlKy1Head8uy4IgsAGA4V0qyYKQ3UsoE+YmU19M9nUV4DlqkBiAcoHAmRgpa/29axgUTjCnhTuldcEyMDGaOod2VoU7PFlASV+q4ISXxQ44k/Sik2yghBfEmiJ36RQjc8DngV+v4UcHGIH16iDh8zBV8LBZy4Igj+wA3+zsUCvan/GAAAAAElFTkSuQmCC");
    background-image: url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNOTEgMTNoLTZ2NmgtMnYtNmgtNnYtMmg2VjVoMnY2aDZ6IiBmaWxsPSIjRkZGIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNzIgMGgyNHYyNEg3MnoiLz48cGF0aCBkPSJNNjcgNi40MUw2NS41OSA1IDYwIDEwLjU5IDU0LjQxIDUgNTMgNi40MSA1OC41OSAxMiA1MyAxNy41OSA1NC40MSAxOSA2MCAxMy40MSA2NS41OSAxOSA2NyAxNy41OSA2MS40MSAxMnoiIGZpbGw9IiNGRkYiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik00OCAwaDI0djI0SDQ4eiIvPjxwYXRoIGQ9Ik0zNC4wMiAxOGw2LTYtNi02LTEuNDEgMS40MUwzNy4xOSAxMmwtNC41OCA0LjU5eiIgZmlsbD0iI0ZGRiIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTI0IDBoMjR2MjRIMjR6Ii8+PHBhdGggZD0iTTEzLjk4IDE4bC02LTYgNi02IDEuNDEgMS40MUwxMC44MSAxMmw0LjU4IDQuNTl6IiBmaWxsPSIjRkZGIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNMCAwaDI0djI0SDB6Ii8+PC9nPjwvc3ZnPg==");
}
.mouse-inactive > .picture-button {
    opacity: 0.1;
}
.picture-button:hover {
    opacity: 1;
    transform: scale(1.2);
}
#prevButton {
    left: 12px;
    top: 50%;
    margin: -24px 0;
}
#nextButton {
    background-position-x: -48px;
    right: 12px;
    top: 50%;
    margin: -24px 0;
}
#delButton {
    background-position-x: -96px;
    top: 12px;
    left: 50%;
    margin: 0 -24px;
}
#addButton {
    background-position-x: -144px;
    bottom: 12px;
    left: 50%;
    margin: 0 -24px;
}

#image {
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
}
    
`);

    parent.appendChild(picture);
}

export const pictures = {
    expanders: [PictureModel, PictureView],
    functions: [pictureStart],
};
