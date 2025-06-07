---
layout: post
title:  "An IVR for collecting rainfall data"
date:   2019-08-30
categories: ivr weather sms
comments: true
author: Eugenio Pace
---

I put together a small app for collecting rainfall information. It is essential to get precise rainfall information in specific locations of our family farm, and the one practical way I found is just to allow people working in the fields to report it back via their phones. 

Until recently this was just a phone call to someone that took note or got the voice mail, but that meant transcribing the information, errors, etc.

> Weather reports don't have the precision and accuracy we needed. Rainfall can vary enormously in a different field only a few kilometers away from each other.

### An IVR!

We thought about deploying automated weather stations, but some of the areas to cover are remote, with no power, and not excellent connectivity (and even more complicated maintenance, since I live 10,000 km away :-) ).

The simplest solution I came up with is simply an IVR (Interactive Voice Response). People working in the fields have all a cell-phone. Why not have them call a number to enter the rainfall? (which is very close to what they are used to doing anyway)

```
Welcome to rainfall collector. Please select the location to enter rainfall for: 1 for location A, 2 for B, 3 for C, 4 for D

...wait for input...

Please enter the millimeters of rainfall followed by the pound sign

...wait for input...

Press 1 to confirm X mm of rainfall. 2 to cancel
```

### Architecture

The front end of the app is, of course, Twilio, which does all the voice interfacing.

The backend is a little Express app that handles requests sent by Twilio and records info in a database eventually.

![]()

Twilio publishes a [nodejs SDK](https://www.twilio.com/docs/libraries/node), including a module you can `require` in your app that takes care of the messages exchanged back and forth.

> The nodejs SDK simplifies the creation of the messages Twilio expects: [TwiML](https://www.twilio.com/docs/voice/twiml). These are just XML messages that encode instructions for their engine to do something for you: gather input from the user, say something, etc. I guess you could craft these by yourself, but the SDK makes it super easy. And besides, who wants to craft XML messages these days...

### Scaffold of a simple app

The Twilio client conforms to the HTTP spec, meaning that it will honor responses like `redirect`, sessions, send cookies, etc.

The main app consists of a bunch of handlers for each path of the menu.

```js
var express = require('express');
var server = express.Router();
var ivr = require('./ivr');

module.exports = server;

var options = {
  baseRoute: "/ivr/",
  version: "1.0.0",
  say: {
    language: 'en',
  },
};

server.use(ivr.middleware(options));

// Welcome
server.post('/', (req, res) => {
  console.log(req.body);
  req.say("Welcome to Eugenio's rainfall collector");
  req.voice.redirect(options.baseRoute + "main");
  res.sendVoice();
});

// Main menu
server.post('/main', main);
server.get('/main', main);
const main = (req, res) => {

  const locations = {
    1: "location 1",
    2: "location 2",
    3: "location 3"
  }

  var main_menu = {};
  var main_menu_msg = "Press ";

  _.forEach(locations, (loc, key) => {
    main_menu[key] = () => res.redirect('rainfall?location=' + key + "&locationdescription=" + loc);
    main_menu_msg += key + " for " + loc + ".";

  })

  main_menu[9] = () => {
    req.say("Bye");
        res.sendVoice();
    };

  main_menu_msg += "9 to finish.";

  menu(main_menu, main_menu_msg, "main", null, req, res);
}
```

There are a few magic functions here. This one is the simplest:

```js
/*
  Helper function for menus.
  m: a menu (a JSON object with the digit and a function)
    m = {
      '1': () => { something() },
    }
  prompt: what to ask the user for.
  menuRoute: the route to the menu handler
  routeParams: any query params
  req: the request
  res: the response
*/  
function menu(m, prompt, menuRoute, routeParams, req, res){
  if(req.isResponse() && m[req.body.Digits]){
    return m[req.body.Digits]();
  }
  req.menu(prompt, menuRoute, routeParams);
  res.sendVoice();
}
```

There are also a few functions that I added to the `req` and `res` objects: `isResponse`, `menu`, `sendVoice`. The `ivr` middleware adds these. I'll come back later to them.

In a nutshell, `menu`:

1. Checks if the request is a response from the user or the very first interaction.
2. If it is *not* a response, or if we find no handler for the input of the user, then we return to the `menuRoute` (essentially repeats whatever was prompted).
3. If it finds a handler (by the presence of `Digits` in the body), it calls it.

In the example above, if the user presses `1`, the `req.body.Digits` property will be `1`. The handler for `1` will be:

```js
() => res.redirect('rainfall?location=1&location_description=location 1');
```

Twilio will happily follow the redirect to `rainfall` handler with all the query string, so we'll need an express route to `/rainfall`:

```js
server.post('/rainfall/mm?', rainfall);
server.get('/rainfall', rainfall);
const rainfall = (req, res) => {
  // First prompt
  if(!req.isResponse()){
    req.gather("Please enter millimeters of rain followed by the pound sign", 3, "rainfall", null, "main");
    return res.sendVoice();
  }

  //Is confirmation?
  if(req.isConfirm()){
    return req.confirm((done)=>{
            save_weather_sample(req.body.From, {
                                                mm: parseFloat(req.params.mm),
                                                location: req.body.From
                                                }, done);
           }, "main");
  }

  //Ask for confirmation
  req.askConfirm(mm + " millimeters of rain", "rainfall/" + mm);
};
```

> Notice that the handler is wired both to a `GET` and a `POST`. the `GET` will mostly happen on redirect the first time the user lands here.

Here the handler can deal with three situations:

1. The very first time it is called. In this case, I call `req.gather` (we'll see what `gather` does later)
2. It is the final confirmation of the input (2nd `if`). In that case, we store the value of the captured value.
3. It is the actual response with the `mm`, then we ask for confirmation.

### Extension methods

The `ivr` middleware, injects a bunch of methods in the `request` and `response` objects for convenience. Almost all of them end up calling the Twilio SDK. 

```js
exports.middleware = function(options){
  return [twilio.webhook({validate: true}), function(req, res, next){
    
    function buildRouteAndParams(route, params){
      if(!route) return "";
      if(params){
        return route + "?" + qs.stringify(params);
      }
      return route;
    }

    //The TwiML response object
    req.voice = new VoiceResponse();
    /*
      A helper menu function
      msg: the menu to say to the user. "Press 1 for foo, 2 for bar"
      route: is the route to the handler of this menu. e.g. "main"
      route_params: optional parmeters for the route
      no_response_route: is the route to go to if there's no input. If ommited, it will be the *same* as *route*
      no_response_route_paramshandler
    */
    req.menu = (msg, route, route_params, no_response_route, no_response_route_params) => {
      const gather = req.voice.gather({
                                        numDigits: 1,
                                        action: options.baseRoute + buildRouteAndParams(route, route_params),
                                        method: 'POST'
                                      });
      gather.say(options.say, msg);

      if(no_response_route){
        no_response_route += buildRouteAndParams(no_response_route, no_response_route_params);
      } else {
        no_response_route = route;
      }
      req.voice.redirect(options.baseRoute + no_response_route);
    };
    /*
      Sends the "final" response object back to Twilio.
      Notice that this is the last method that can be called. 
      Also notice that this is the only extension method added to "response"
    */
    res.sendVoice = () => { res.send(req.voice.toString()); }
    /*
      Helper for "Say" verb. If route is specified, it will add a redirect directive.
      It will not "Send" the response back to Twilio
    */
    req.say = (msg, route, route_params) => {
      req.voice.say(options.say, msg);
      if(route) req.voice.redirect(options.baseRoute + buildRouteAndParams(route, route_params));
    };
    //Checks whether the information returned contains any user input
    req.isResponse = () => {
      if(req.body.Digits) return true;
      return false;
    };
    /*
      Prompts for confirmation. 1: yes, 2: no
      msg: the confirmation message
      confirmation_route: where to go for confirmation. Usually the default route for the option
      route_params: optional parameters to pass to the route on confirmation
    */
    req.askConfirm = (msg, confirmation_route, route_params) =>{
      if(!route_params){
        route_params = {};
      }
      // The confirmation flag
      route_params.confirm = true;
      var route = options.baseRoute + buildRouteAndParams(confirmation_route, route_params);

      const gather = req.voice.gather({
                                        numDigits: 1,
                                        action: route,
                                        method: 'POST'
                                      });
      gather.say(options.say, "Press one to confirm " + msg + ". Two to return to the menu.");
      req.voice.redirect(route);
      res.sendVoice();
    };
    /*
      Validates that the request is a confirmation response. 
      Simply checks that there's a query parameter with "confirm=true"  
    */
    req.isConfirm = () => { return req.query.confirm; }
    /*
      Processes the confirmation response.
      action: a callback to process positive confirmation (if user presses "1")
      route: where to go next, after confirmation is processed (postively or not).
      route_params: option additional parameters for the route
      If user cancels the request (anythign but "1"), then no action is performed and user is redirected to "route"
    */
    req.confirm = (action, route, route_params) => {

      function sayRedirect(msg){
        if(msg) { req.voice.say(options.say, msg); }
        req.voice.redirect(options.baseRoute + buildRouteAndParams(route, route_params));
        res.sendVoice();
      }

      if(req.query.confirm){
        if(req.body.Digits === "1"){ //Confirm input
          //Call the confirm action callback
          action((e) => {
            if(!e){
              return sayRedirect("The information was saved.");
            } 
            console.log(e);
            sayRedirect("The information could not be saved. Please try again.");
          });
        } else {
          //Cancel
          sayRedirect("Cancelled");
        }
      }
    };
    /*
      Collects information from user
      msg: the prompt for input
      digits: expected length of the response
      route: where to go after input collection is done
      route_params: any paramters to forward on the route
      no_response_route: where to go if no input is entered
      no_response_route_params: any extra params for the route
    */
    req.gather = (msg, digits, route, route_params, no_response_route, no_response_route_params) => {
      route = options.baseRoute + buildRouteAndParams(route, route_params);
      const gather = req.voice.gather({
                                        numDigits: digits,
                                        action: route,
                                        method: 'POST'
                                      });
      gather.say(options.say, msg);
      //If no response
      if(!no_response_route){
        no_response_route = route;
      } else {
        no_response_route = options.baseRoute + buildRouteAndParams(no_response_route, no_response_route || "");
      }

      req.voice.redirect(no_response_route);
    };

    next();
  }];
};
```

The middleware makes the main app quite compact. I like that as I plan to add other functions to the menu later on for other collection activities.

> Also, notice that the middleware returns *an array* of functions. The first one is Twilio's method signature that ensures all requests come from your account.

