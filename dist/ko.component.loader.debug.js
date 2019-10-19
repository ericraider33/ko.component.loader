(function(factory) 
{
    // Module systems magic dance.
    if (typeof require === "function" && typeof exports === "object" && typeof module === "object")
        // CommonJS or Node: hard-coded dependency on "knockout"
        factory(require("knockout"), exports);
    else if (typeof define === "function" && define["amd"])
        // AMD anonymous module with hard-coded dependency on "knockout"
        define(["knockout", "exports"], factory);
    else
        // <script> tag: use the global `ko` object, attaching a `mapping` property
        factory(ko, ko.componentLoader = {});
}(function (ko, exports)
{
    if (typeof ko === undefined) throw 'Knockout is required, please ensure it is loaded before using componentLoader plug-in';
    ko.componentLoader = buildLoader(undefined, exports);
    ko.bindingHandlers.attached = { init: attachedInit };
    ko.bindingHandlers.attachedHandler = { init: attachedHandlerInit };
    ko.extenders.ref = function (target, option) { target.ref = option; return target; };
    
    return;

    function attachedInit(element, valueAccessor, allBindings, viewModel, bindingContext)
    {
        if (valueAccessor() === 'parent')
            element = element.parentNode;

        var ref;
        if (viewModel.attached)
            ref = viewModel.attached(element);  // calls component's attached method

        if (ref && ref !== ko.componentLoader.ref)
            ko.componentLoader.onComponentAttached(viewModel, ref);  // internally tracks outstanding components

        if (ref && ref.constructor === Reference)
            ref.attached(viewModel);    // updates reference counts
    }

    function attachedHandlerInit(element, valueAccessor)
    {
        var handler = valueAccessor();
        handler(element);
    }

    function buildLoader(xOptions, xExports)
    {
        var self = xExports || {}, loadedCallback, verbose, amdDefine, cssLoaded = [], popState;

        self.loading = ko.observable(true);
        self.components = ko.observableArray([]);
        self.root = ko.observable();
        self.dialogs = ko.observableArray([]);
        self.ref = new Reference().setOptions({ completedCallback: onRefCompleted, componentName: 'ko.component.loader' });

        self.addComponent = addComponent;
        self.onComponentAttached = onComponentAttached;
        self.setLoadedCallback = setLoadedCallback;
        self.setOptions = setOptions;
        self.attached = function () { return self.ref; };
        self.isVerbose = function () { return verbose; };
        self.Reference = Reference;
        self.initComponentDefine = initComponentDefine;
        self.pathToName = pathToName;
        self.getJsonFromUrl = getJsonFromUrl;
        self.pushState = pushState;

        if (typeof xOptions === "object")
            setOptions(xOptions);

        return self;


        function addComponent(path, options)
        {
            options = options || {};
            options.params = options.params || {};
            path = path || options.path;

            var name = options.name || camelCaseToDash(path.replace(/^.*\//, ''));
            var component = findComponent(name);

            if (component)
            {
                component.path = component.path || path;
                component.noWait = typeof options.noWait !== "undefined" ? options.noWait : component.noWait;
                component.root = typeof options.root !== "undefined" ? options.root : component.root;
                component.dialog = typeof options.dialog !== "undefined" ? options.dialog : component.dialog;
                component.css = typeof options.css !== "undefined" ? options.css : component.css;
                component.params = $.extend(component.params, options.params);
            }
            else
            {
                component = { name: name, params: options.params, path: path, isLoaded: false, noWait: !!options.noWait, root: !!options.root, registered: false, dialog: options.dialog, css: options.css };
                self.components.push(component);
            }

            if (component.path && !component.registered)
            {
                ko.components.register(name, { require: component.path });
                component.registered = true;
            }

            if (component.css)
            {
                var cssList = typeof component.css == "string" ? [component.css] : component.css;
                cssList.forEach(function (css)
                {
                    if (cssLoaded.indexOf(css) >= 0)
                        return;

                    cssLoaded.push(css);
                    $('head').append('<link type="text/css" href="' + css + '" rel="stylesheet"/>');
                });
            }

            if ((component.root || component.dialog) && !component.params.ref)
                component.params.ref = self.ref.child();    // builds ref for anything bound by loader
            
            if (component.root && self.root() !== component)
                self.root(component);
            else if (component.dialog && self.dialogs.indexOf(component) < 0)
                self.dialogs.push(component);
        }

        function pathToName(requirePath)
        {
            return camelCaseToDash(requirePath.replace(/^.*\//, ''));
        }

        function registerComponentPath(path)
        {
            var name = pathToName(path);
            var component = findComponent(name);
            if (!component || component.registered)
                return;

            component.path = path;
            ko.components.register(name, { require: path });
            component.registered = true;

            if (verbose) console.log('Registered path ' + path + ' for component ' + name);
        }

        function onComponentAttached(viewModel, ref)
        {
            var name = viewModel.constructor.name || viewModel.constructor.toString().match(/function (\w*)/)[1];
            name = camelCaseToDash(name);

            var component = findComponent(name);
            if (!component && verbose && self.components().length) console.log('Component not found. Ignoring attached event for component ' + name);
            if (!component) return;
            
            component.isLoaded = true;
            component.viewModel = viewModel;            
            if (verbose) console.log('Loaded component ' + name + '\tOutstanding ' + retrieveOutstanding().join());
            if (ref && !ref.componentName) ref.setComponentName(name);
        }

        function onRefCompleted()
        {
            if (verbose) console.log('Reference counts are completed');

            if (!self.loading()) return;

            if (verbose) console.log('All loaded');
            window.setTimeout(doLoaded, 0);     // assures loading is done by putting at back of call queue            
        }
                
        function doLoaded()
        {
            self.loading(false);                                // makes visible before callback
            if (verbose) console.log('Page ready');
            var root = self.root();
            if (loadedCallback)
                loadedCallback(self);
            else if (root && root.viewModel && typeof root.viewModel.handleOnLoaded === "function")
                root.viewModel.handleOnLoaded(self);

            $(document).trigger('ko.component.loader:loaded');
            window.status = "loaded";

            if (popState)
            {
                registerPopstate();
                handlePopState(null, getJsonFromUrl(), self.ref);
            }
        }

        function findComponent(name)
        {
            return self.components().filter(function (c) { return c.name === name; })[0];
        }

        function retrieveOutstanding()
        {
            var result = [];
            var components = self.components();
            for (var i = 0; i < components.length; i++)
                if (!components[i].isLoaded && !components[i].noWait)
                    result.push(components[i].name);
            return result;
        }

        function setLoadedCallback(callback)
        {
            loadedCallback = callback;
        }

        function setOptions(options)
        {
            if (options.headLess) self.ref.attached(self);      // loader isn't bound using KO
            if (typeof options.verbose !== "undefined") verbose = options.verbose ? true : false;
            if (typeof options.loadedCallback === "function") loadedCallback = options.loadedCallback;
            if (typeof options.popState === "boolean") popState = options.popState;
            return self;
        }

        function camelCaseToDash(text)
        {
            if (typeof text !== "string" || text.length < 2) return text;

            var last = ' ', result = '';
            for (var i = 0; i < text.length; i++)
            {
                var x = text.charAt(i);
                if (last.match(/[A-Za-z]/) && x.match(/[A-Z]/))
                    result += '-';

                result += x.toLowerCase();
                last = x;
            }
            return result;
        }

        function initComponentDefine(path, compOptions, methOptions)
        {
            amdDefine = window.define;
            if (typeof window.define !== "function" || !window.define.amd)
                throw "AMD is not present";
            ComponentDefine.amd = true;
            window.define = ComponentDefine;
            if (verbose) console.log('Installed ComponentDefine method to auto register components');

            compOptions = compOptions || {};
            compOptions.root = true;
            addComponent(path, compOptions);

            methOptions = methOptions || {};
            methOptions.callback = methOptions.callback || defaultKnockoutPageLoader;

            if (methOptions.components)
                methOptions.components.forEach(function (componentPath) { addComponent(componentPath); });
            if (methOptions.popState)
                registerPopstate();

            var toRequire = (methOptions.components || []).slice();
            toRequire.push(path);

            $(document).ready(function ()
            {
                require(toRequire, methOptions.callback);
            });
        }

        function defaultKnockoutPageLoader() 
        {
            ko.applyBindings(ko.componentLoader);
        }

        function ComponentDefine()
        {
            var dependList, defineMethod, args = Array.prototype.slice.call(arguments);
            if (args.length === 2 && Array.isArray(args[0]) && typeof args[1] === "function")
            {
                dependList = args[0];
                defineMethod = args[1];

                // Captures results from AMD define method for component
                amdDefine(dependList, amdCallback);
            }
            else if (args.length === 3 && typeof args[0] === "string" && Array.isArray(args[1]) && typeof args[2] === "function")
            {
                dependList = args[1];
                defineMethod = args[2];

                // Captures results from AMD define method for component
                amdDefine(args[0], dependList, amdCallback);
            }
            else if (args.length !== 2 || !Array.isArray(args[0]) || typeof args[1] !== "function")
            {
                amdDefine.apply(null, args);     // does a simple pass through
            }

            function amdCallback() 
            {
                var result = defineMethod.apply(this, Array.prototype.slice.call(arguments));
                if (typeof result === "object" && typeof result.viewModel === "function" && result.template)
                {
                    var name = result.viewModel.name || result.viewModel.toString().match(/function (\w*)/)[1];
                    if (verbose) console.log('Defining component ' + name);

                    var options = result.component || {};
                    options.name = options.name || camelCaseToDash(name);
                    addComponent(null, options);

                    dependList.forEach(function (path) { registerComponentPath(path); });            // register paths for all dependent components
                }
                return result;
            }
        }

        function registerPopstate()
        {
            window.addEventListener('popstate', function (event)
            {
                var urlParams = getJsonFromUrl();
                handlePopState(event, urlParams, self.ref);
            });
        }

        function handlePopState(event, urlParams, top)
        {
            for (var i = 0; i < top.children.length; i++)
            {
                var child = top.children[i];
                var instance = child.instance();
                if (instance && typeof instance.handlePopState === "function")
                    instance.handlePopState(event, urlParams);

                handlePopState(event, urlParams, child);
            }
        }

        function getJsonFromUrl()
        {
            var result = {};
            if (!location.search) return result;
            var query = location.search.substr(1);
            query.split("&").forEach(function (part)
            {
                var item = part.split("=");
                result[item[0]] = decodeURIComponent(item[1]);
            });
            return result;
        }

        function pushState(values, args)
        {
            args = args || {};

            var qParams = $.extend(getJsonFromUrl(), values);
            for (var key in qParams)
                if (qParams.hasOwnProperty(key) && qParams[key] === null)
                    delete qParams[key];

            var qText = $.param(qParams);
            var url = window.location.origin + window.location.pathname + (qText.length === 0 ? "" : "?" + qText);

            if (window.history && args.replaceState)
                window.history.replaceState({}, '', url);
            else if (window.history)
                window.history.pushState({}, '', url);
        }
    }
    
    function Reference(parent)
    {
        var self = this;
        var initialCompleted = false;
        var isAttached = false;
        var childrenComplete = 0;
        var completedCallback = ko.observable(self);
        var subscriptions = [];

        self.child = child;
        self.children = [];
        self.attached = attached;
        self.setComponentName = setComponentName;
        self.setOptions = setOptions;
        self.addCompletedCallback = addCompletedCallback;
        self.childCompleted = childCompleted;
        self.refForItem = refForItem;
        self.refWrap = refWrap;
        self.instance = ko.observable();
        self.dispose = dispose;

        return self;
        
        function child(args)
        {
            var toAdd = new Reference(self).setOptions(args || {});
            self.children.push(toAdd);
            return toAdd;
        }
        
        function setOptions(args)
        {
            if (args.completedCallback) addCompletedCallback(args.completedCallback);
            if (args.componentName) setComponentName(args.componentName);
            return self;
        }
        
        function setComponentName(name) 
        { 
            self.componentName = name;
            return self;
        }
        
        function addCompletedCallback(callback)
        {
            var subscription = completedCallback.subscribe(function () { callback(self.instance(), self); });
            subscriptions.push(subscription);
            return subscription;
        }
        
        function dispose()
        {
            subscriptions.forEach(function (sub) { sub.dispose(); });
            subscriptions.length = 0;
            self.instance(null);
            parent = null;
        }
        
        function attached(viewModel)
        {
            isAttached = true;
            self.instance(viewModel);
            notify();
        }
        
        function childCompleted()
        {
            childrenComplete++;
            notify();
        }
        
        function notify()
        {
            if (ko.componentLoader.isVerbose()) console.log('Notify ' + self.componentName + ' isAttached=' + isAttached + ' children=' + self.children.length + ' complete=' + childrenComplete);            
            if (!isAttached || childrenComplete !== self.children.length || initialCompleted)
                return;

            initialCompleted = true;
            completedCallback(self);

            if (parent)
                parent.childCompleted();
        }
        
        function refForItem(item)
        {
            item.ref = item.ref || self.child();
            return item.ref;
        }
        
        function refWrap(item)
        {
            item.ref = item.ref || self.child();
            return item;
        }
    }    
}));
