---
layout: post
title: "Loading Express Route Handlers Using Naming Conventions"
date:   2019-11-15
categories: nodejs
comments: true
author: Eugenio Pace
---

For a little project I've been working on, I wanted to load nodejs modules into an express router automagically, using naming conventions by just having folders in a predefined location. 

Given this structure:


```sh
MyProject/
  Apps/
    App1/
      index.js
    App2
      index.js
    App3
      index.js
```

I wanted to be able to do the equivalent of:


```js
const express = require('express');
var server = express();
router.use('/App1', require('Apps/App1'));
router.use('/App2', require('Apps/App2'));
router.use('/App3', require('Apps/App3'));
```

Only in a more elegant way.

## Why?

This project is a loose collection of modules all served from the same base web app. For example, a `GET` request to `https://server.com/App1/foo` would be served by a handler attached to the `/foo` route in `App1/index.js`.

Why? simply organization. A new *module* (in my sense, not in nodejs' one) is simply a folder with a collection of paths. 

## The *main* (root for all routes)

My base express app is pretty straight forward:

```js
const express = require('express');

var loader = require("./Apps");

var server = express();

server.set('view engine', 'ejs');

var apps = loader.mount(server);  

server.listen(server.get('port'), function() {
  console.log('Node app is running on port', server.get('port'));
});
```

And it *never* changes.

## The Loader

All the magic happens in `loader.mount(server)`. `server` is just an `express` instance. At the root of the `Apps` folder, I have a little `index.js` file with the following code:

```js
var normalizedPath = require("path").join(__dirname);

exports.mount = function(router){
  require("fs")
    .readdirSync(normalizedPath, { withFileTypes: true })
      .forEach((file) => {
        if(file.isDirectory()){
          var app = require(normalizedPath + "/" + file.name);
          router.use('/' + file.name, app);
        }
      });
};
```

## A *"module"*

Each folder under `Apps` has to have a single `index.js` file that follows this structure:

```js
const express = require('express');
const server = express.Router();
module.exports = server;

server.get('/foo', (req, res, next) => {
  res.send("hello from foo");
});
```

Et voilá!

Now all I need to do is create a folder, drop an `index.js` file with the structure and worry about the routes. Everything else just works. And all is neatly contained in each folder.

> I'm not sure if there are more _nodejs kosher_ ways of achieving the same, but this works for me! If you have other ideas, let me know.


