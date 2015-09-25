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
    return;

    function attachedInit(element, valueAccessor, allBindings, viewModel, bindingContext)
    {
        if (valueAccessor() === 'parent')
            element = element.parentNode;
        if (viewModel.attached) viewModel.attached(element);
        if (ko.componentLoader) ko.componentLoader.onComponentAttached(viewModel);
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

        self.addComponent = addComponent;
        self.onComponentAttached = onComponentAttached;
        self.buildLoader = buildLoader;
        self.setLoadedCallback = setLoadedCallback;
        self.setOptions = setOptions;
        self.resetAsDefault = resetAsDefault;

        if (typeof xOptions === "object")
            setOptions(xOptions);

        return self;


        function addComponent(path, options)
        {
            options = options || {};

            var name = path.replace(/^.*\//, '');
            name = camelCaseToDash(name);

            ko.components.register(name, { require: path });

            var component = { name: name, path: path, isLoaded: false, noWait: options.noWait ? true: false };
            self.components.push(component);

            if (options.root)
                self.root({ name: name, params: options.params || {} });
            else if (options.dialog)
                self.dialogs.push({ name: name, params: options.params || {} });
        }

        function onComponentAttached(viewModel)
        {
            var name = viewModel.constructor.name || viewModel.constructor.toString().match(/function (\w*)/)[1];
            name = camelCaseToDash(name);

            var component = findComponent(name);
            if (!component)
            {
                if (verbose) console.log('Component not found. Ignoring attached event for component ' + name);
                return;
            }
            component.isLoaded = true;
            component.viewModel = viewModel;
            if (verbose) console.log('Loaded component ' + name + '\tOutstanding ' + retrieveOutstanding().join());

            if (!self.loading()) return;
            var loaded = isAllLoaded();
            if (!loaded)
                return;

            if (verbose) console.log('Page ready');
            var root = findRoot();
            if (loadedCallback)
                self.loading(loadedCallback(self) || false);
            else if (root && root.viewModel && typeof root.viewModel.handleOnLoaded === "function")
                self.loading(root.viewModel.handleOnLoaded(self) || false);
            else
                self.loading(false);
        }

        function findRoot()
        {
            var root = self.root();
            return (!root || !root.name) ? null : findComponent(root.name);
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

        function isAllLoaded()
        {
            return retrieveOutstanding().length === 0;
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
            if (typeof options.verbose !== "undefined") verbose = options.verbose ? true : false;
            if (typeof options.loadedCallback !== "undefined") loadedCallback = options.loadedCallback;
        }

        function resetAsDefault()
        {
            ko.componentLoader = self;
            self.loading(true);

            var components = self.components();
            for (var i = 0; i < components.length; i++)
                components[i].isLoaded = false;
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
}));
