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

/* globals Croquet */

import {newId} from './timeObject.js';

// this file provides a crude "mock" classes that allows the developer quickly try
// things out when the Croquet part is not necessary.

// its implementation is sensitive to the internals of Croquet
// and assumes some global variable usage such as "CROQUETVM".
// In a longer term, a cleaner solution is desired but for now it proved to be quite useful
// to be able to test things out quickly.

function getIsLocal() {
    if (!window) {return false;}
    return (/isLocal/.exec(window.location.href));
}

export const isLocal = getIsLocal();
let session;
let viewDomain;
let myVM;

function currentVM(vm) {
    window.CROQUETVM = vm;
}

export function getElement(ref) {
    let elementId = (typeof ref === "string") ? ref : ref.elementId;
    if (!elementId) {
        console.error("element's id is falsy in getElement", elementId);
        return null;
    }
    let vm = isLocal ? myVM : (window.CROQUETVM || window.ISLAND);
    let world = vm.get("worldModel");
    let id = world.objects[elementId];

    if (!id) {return null;}
    return world.getModel(id);
}

class FutureHandler {
    constructor(tOffset) {
        this.tOffset = tOffset || 0;
    }

    setup(target) {
        let tOffset = this.tOffset;
        return new Proxy(target, {
            get(_target, property) {
                if (typeof target[property] === "function") {
                    return new Proxy(target[property], {
                        apply(method, _this, args) {
                            setTimeout(() => {
                                let oldVM = window.CROQUETVM;
                                currentVM(myVM);
                                method.apply(target, args);
                                currentVM(oldVM);
                            }, tOffset);
                        }
                    });
                }
                throw new Error("it has to be a method");
            }
        });
    }
}

class Model {
    static create(options) {
        let n = new this();
        n.init(options);
        myVM.modelsById[n.id] = n;
        if (!window.CROQUETVM.modelsByName.modelRoot) {
            window.CROQUETVM.modelsByName.modelRoot = n;
        }
        return n;
    }

    static register(_classId) {}

    constructor() {
        this.id = newId();
        this.__realm = {vm: window.CROQUETVM};
        this.start = Date.now();
    }

    init() {}

    get vm() {
        return myVM;
    }

    get sessionId() {
        return this.vm.id;
    }

    destroy() {
        // remove subscriptions
    }

    subscribe(scope, event, methodName) {
        let vm = myVM;
        vm.addSubscription(this, scope, event, methodName);
    }

    unsubscribe(scope, event, methodName) {
        let vm = myVM;
        vm.removeSubscription(this, scope, event, methodName);
    }

    publish(scope, message, data) {
        let vm = myVM;
        vm.publishFromModel(scope, message, data);
    }

    beWellKnownAs(name) {
        this.vm.modelsByName[name] =  this;
    }

    wellKnownModel(name) {
        return this.vm.modelsByName[name];
    }

    getModel(id) {
        return this.vm.lookUpModel(id);
    }

    future(tOffset = 0) {
        return new FutureHandler(tOffset).setup(this);
    }

    now() {
        return Date.now() - this.start;
    }

    persistSession(func) {
        console.log("persistSession", func());
    }
}

class View {
    constructor(model) {
        this.model = model;
        this.id = newId(true);
        this.start = Date.now();
    }

    subscribe(scope, event, methodName) {
        viewDomain.addSubscription(this, scope, event, methodName);
    }

    publish(scope, message, data) {
        viewDomain.publishFromView(scope, message, data);
    }

    get sessionId() {
        return session.id;
    }

    get session() {
        return session;
    }

    get viewId() {return viewDomain.id;}

    now() {
        return Date.now() - this.start;
    }

    future(tOffset = 0) {
        return new FutureHandler(tOffset).setup(this);
    }

    detach() {}
}

class ViewDomain {
    constructor() {
        this.id = 'viewDomain' + newId(true);
        this.subscriptions = {};
    }

    addSubscription(view, scope, event, methodName) {
        let topic = scope + ":" + event;
        let handler = view.id + "." + methodName;
        if (!this.subscriptions[topic]) {
            this.subscriptions[topic] = [];
        } else if (this.subscriptions[topic].indexOf(handler) !== -1) {
            throw Error(`${view}.${methodName} already subscribed to ${event}`);
        }
        this.subscriptions[topic].push({handler, view});
    }

    publishFromView(scope, event, data) {
        let vm = myVM;
        currentVM(vm);
        vm.handleViewEventInModel(scope, event, data);
        currentVM(null);
        this.handleViewEventInView(scope, event, data);
    }

    handleViewEventInView(scope, event, data) {
        let topic = scope + ":" + event;
        if (this.subscriptions[topic]) {
            for (const {handler, view} of this.subscriptions[topic]) {
                let dot = handler.indexOf('.');
                // let id = handler.slice(0, dot);
                let methodName = handler.slice(dot + 1);
                if (!view) {
                    console.log(`event ${topic} .${methodName}(): subscriber not found`);
                    continue;
                }

                if (methodName.indexOf('.') < 0) {
                    if (typeof view[methodName] !== "function") {
                        console.log(`event ${topic} ${view}.${methodName}(): method not found`);
                        continue;
                    } else {
                        try {
                            view[methodName](data);
                        } catch (error) {
                            console.log(`event ${topic} ${view}.${methodName}()`, error);
                        }
                    }
                } else {
                    try {
                        let split = methodName.split('.');
                        view.call(split[0], split[1], data);
                    } catch (error) {
                        console.log(`event ${topic} ${view}.${methodName}()`, error);
                    }
                }
            }
        }
    }

    handleModelEvent(scope, event, data) {
        let topic = scope + ":" + event;
        if (this.subscriptions[topic]) {
            for (const {handler, view} of this.subscriptions[topic]) {
                let dot = handler.indexOf('.');
                // let id = handler.slice(0, dot);
                let methodName = handler.slice(dot + 1);
                if (!view) {
                    console.log(`event ${topic} .${methodName}(): subscriber not found`);
                    continue;
                }

                if (methodName.indexOf('.') < 0) {
                    if (typeof view[methodName] !== "function") {
                        console.log(`event ${topic} ${view}.${methodName}(): method not found`);
                        continue;
                    } else {
                        try {
                            view[methodName](data);
                        } catch (error) {
                            console.log(`event ${topic} ${view}.${methodName}()`, error);
                        }
                    }
                } else {
                    try {
                        let split = methodName.split('.');
                        view.call(split[0], split[1], data);
                    } catch (error) {
                        console.log(`event ${topic} ${view}.${methodName}()`, error);
                    }
                }
            }
        }
    }

    frame(time) {
        if (this.rootView.update) {
            this.rootView.update(time);
            window.requestAnimationFrame(this.frame.bind(this));
        }
    }
}

export class VirtualMachine {
    constructor() {
        this.subscriptions = {};
        this.modelsById = {};
        this.modelsByName = {};
        this.id = newId();
        window.CROQUETVM = this;
    }

    lookUpModel(id) {
        return this.modelsById[id];
    }

    get(name) {
        return this.modelsByName[name];
    }

    addSubscription(model, scope, event, methodName) {
        let topic = scope + ":" + event;
        let handler = model.id + "." + methodName;
        if (!this.subscriptions[topic]) {
            this.subscriptions[topic] = [];
        } else if (this.subscriptions[topic].indexOf(handler) !== -1) {
            throw Error(`${model}.${methodName} already subscribed to ${event}`);
        }
        this.subscriptions[topic].push(handler);
    }

    removeSubscription(model, scope, event, methodName) {
        const topic = scope + ":" + event;
        const handler = model.id + "." + methodName;
        const handlers = this.subscriptions[topic];
        if (handlers) {
            const indexToRemove = handlers.indexOf(handler);
            handlers.splice(indexToRemove, 1);
            if (handlers.length === 0) {
                delete this.subscriptions[topic];
            }
        }
    }

    publishFromModel(scope, event, data) {
        this.handleModelEventInModel(scope, event, data);
        this.handleModelEventInView(scope, event, data);
    }

    publishFromView(scope, event, data) {
        let vm = myVM;
        currentVM(vm);
        this.handleViewEventInModel(scope, event, data);
        currentVM(null);
        this.handleViewEventInView(scope, event, data);
    }

    handleViewEventInAllVMs(scope, event, data) {
        let vm = myVM;
        currentVM(vm);
        vm.handleViewEventInModel(scope, event, data);
        currentVM(this);
    }

    handleModelEventInModel(scope, event, data) {
        const topic = scope + ":" + event;
        if (this.subscriptions[topic]) {
            for (const handler of this.subscriptions[topic]) {
                let dot = handler.indexOf('.');
                let id = handler.slice(0, dot);
                let methodName = handler.slice(dot + 1);
                let model = this.lookUpModel(id);

                if (!model) {
                    console.log(`event ${topic} .${methodName}(): subscriber not found`);
                    continue;
                }

                if (methodName.indexOf('.') < 0) {
                    if (typeof model[methodName] !== "function") {
                        console.log(`event ${topic} ${model}.${methodName}(): method not found`);
                        continue;
                    } else {
                        try {
                            model[methodName](data);
                        } catch (error) {
                            console.log(`event ${topic} ${model}.${methodName}()`, error);
                        }
                    }
                } else {
                    try {
                        let split = methodName.split('.');
                        model.call(split[0], split[1], data);
                    } catch (error) {
                        console.log(`event ${topic} ${model}.${methodName}()`, error);
                    }
                }
            }
        }
    }

    handleViewEventInModel(scope, event, data) {
        const topic = scope + ":" + event;
        // view=>model events are converted to model=>model events via reflector
        if (this.subscriptions[topic]) {
            // might be better make a promise to do this
            this.handleModelEventInModel(scope, event, data);
        }
    }

    handleModelEventInView(scope, event, data) {
        let vm = myVM;
        currentVM(null);
        viewDomain.handleModelEvent(scope, event, data);
        currentVM(vm);
    }
}

export const M = isLocal ? Model : Croquet.Model;
export const V = isLocal ? View : Croquet.View;

function makeController(modelClass, viewClass, options) {
    let vm = new VirtualMachine();
    window.CROQUETVM = vm;
    myVM = vm;
    currentVM(vm);

    let firstViewDomain = !viewDomain;
    if (firstViewDomain) {
        viewDomain = new ViewDomain();
    }

    let s = {model: null, view: null, id: vm.id, persistentId: "abcdef"};

    if (!session) {
        session = s;
    }

    let model = modelClass.create(options.options);
    let view = new viewClass(model);

    setTimeout(() => {
        window.CROQUETVM = vm;
        vm.publishFromModel(vm.id, "view-join", view.viewId);
    }, 100);

    s.model = model;
    s.view = view;

    if (firstViewDomain) {
        viewDomain.rootView = view;
        viewDomain.frame.bind(viewDomain)();
    }

    // currentVM(oldVM);
    return Promise.resolve(s);
}

export async function createSession(name, modelClass, viewClass, parameters) {
    if (!parameters) {parameters = {};}
    if (isLocal) {
        return makeController(modelClass, viewClass, parameters).then((s) => {

            if (s.view.synced) {
                setTimeout(() => s.view.synced(true), 0);
            }
            return s;
        });
    }

    if (parameters.options && !parameters.options.sessionName) {
        Croquet.App.sessionURL = window.location.href;
        parameters.options.sessionName = window.location.href;
    }

    let arg = {
        ...parameters,
        name,
        password: parameters.password || "dummy",
        model: modelClass,
        view: viewClass,
    };
    return Croquet.Session.join(arg).then((s) => {
        if (!session) {
            session = s;
        }
        return s;
    });
}

export async function destroySession(sessionId) {
    if (isLocal) {
        return null;
    }
    return Croquet.Session.destroySession(sessionId);
}
