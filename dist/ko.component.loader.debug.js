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
        var self = xExports || {}, loadedCallback, verbose;

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

        if (typeof xOptions === "object")
            setOptions(xOptions);

        return self;


        function addComponent(path, options)
        {
            options = options || {};
            options.params = options.params || {};

            var name = path.replace(/^.*\//, '');
            name = camelCaseToDash(name);

            ko.components.register(name, { require: path });

            var component = { name: name, params: options.params, path: path, isLoaded: false, noWait: options.noWait ? true : false, root: options.root ? true : false };
            self.components.push(component);

            if (options.root || options.dialog)
                options.params.ref = options.params.ref || self.ref.child();    // builds ref for anything bound by loader
            
            if (options.root)
                self.root(component);
            else if (options.dialog)
                self.dialogs.push(component);
        }

        function onComponentAttached(viewModel, ref)
        {
            var name = viewModel.constructor.name || viewModel.constructor.toString().match(/function (\w*)/)[1];
            name = camelCaseToDash(name);

            var component = findComponent(name);
            if (!component && verbose) console.log('Component not found. Ignoring attached event for component ' + name);
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
        }

        function findComponent(name)
        {
            var components = self.components();
            for (var i = 0; i < components.length; i++)
            {
                var component = components[i];
                if (component.name == name)
                    return component;
            }
            return null;
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
    }
    
    function Reference(parent)
    {
        var self = this;
        var initialCompleted = false;
        var isAttached = false;
        var children = 0;
        var childrenComplete = 0;
        var completedCallback = ko.observable(self);
        var subscriptions = [];

        self.child = child;
        self.attached = attached;
        self.setComponentName = setComponentName;
        self.setOptions = setOptions;
        self.addCompletedCallback = addCompletedCallback;
        self.childCompleted = childCompleted;
        self.refForItem = refForItem;
        self.instance = function () { return self.viewModel; };
        self.dispose = dispose;

        return self;
        
        function child(args)
        {
            children++;
            return new Reference(self).setOptions(args || {});
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
            var subscription = completedCallback.subscribe(function () { callback(self.viewModel, self); });
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
            self.viewModel = viewModel;
            notify();
        }
        
        function childCompleted()
        {
            childrenComplete++;
            notify();
        }
        
        function notify()
        {
            if (ko.componentLoader.isVerbose()) console.log('Notify ' + self.componentName + ' isAttached=' + isAttached + ' children=' + children + ' complete=' + childrenComplete);            
            if (!isAttached || childrenComplete !== children || initialCompleted)
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
    }    
}));
