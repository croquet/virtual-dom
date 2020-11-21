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

export function loader(code, json, Model, Element, start, sessionOptions, sessionName) {
    let parameters = {...sessionOptions, options: {code, json}};
    start(sessionName, Model, null, parameters);
}

export function svgSpriteLoader(svgFileName) {
    let sprites = document.querySelector("#svgIcons");
    if (sprites) {return Promise.resolve(null);}
    sprites = document.createElement('div');
    sprites.style.setProperty("display", "none");
    sprites.id = "svgIcons";

    return fetch(svgFileName, {
        method: "GET",
        mode: "cors",
        headers: {"Content-Type": "text"}
    })
        .then((r) => {
            if (!r.ok) {throw r;}
            return r.text();
        })
        .then((s) => {
            sprites.innerHTML = s;
            return sprites;
        }).then((d) => {
            document.body.appendChild(d);
        })
        .catch((_e) => console.log("SVG " + svgFileName + " not found"));
}
