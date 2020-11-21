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

import {Element, setKnownElements, setFontLastLoadedTimeFunction} from "./element.js";
import {CanvasElement} from "./canvas.js";
import {TextElement} from "./text/text.js";
import {setLastFontLoadedTime} from "./text/warota.js";
import {IFrameElement} from "./iframe.js";
import {VideoElement} from "./video.js";

export function initializeElementClasses() {
    setKnownElements({
        Element: Element,
        CanvasElement: CanvasElement,
        TextElement: TextElement,
        IFrameElement: IFrameElement,
        VideoElement: VideoElement,
    });
    setFontLastLoadedTimeFunction(setLastFontLoadedTime);
}
