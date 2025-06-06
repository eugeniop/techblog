---
layout: post
title:  "Controlling a NEST thermostat with SMS"
date:   2017-11-25
categories: auth0 nest
comments: true
author: Eugenio Pace
---

This new application, shows how to control a NEST thermostat with SMS messages via Twilio:

![](/media/LWfoXSO9nc.gif)

This app follows the same basic architecture I used before for SMS based apps:

![](https://docs.google.com/drawings/d/e/2PACX-1vRD8PiI0603gTmJK51EK_E7V5JidqhBktldMsID1Oc3ePi2igJ2biXgW3eiz91T06akwg3qheI-POjc/pub?w=869&h=378)

I implemented 3 commands:

* **Get Temperature**. For example you send `GT den`, the system will respond with:

```
Den thermostat is off
Ambient T: 19C
Target T: 18C
Humidity: 45%
```

Because you can have more than one thermostat under the same account, the first parameter is its name (e.g. `den`).

* **Set Temperature**: `ST den 19`. Sets temperature to **19C** for the **Den**

* **Subscribe**: `S`. This command is used for bootstrapping security and associate the phone with the NEST account. It is the first command to send before the above commmands are accepted. 

From a security point of view, we need to prove that:

* We have a valid NEST account with sufficient scope to `read/write` to a `Thermostat` resource.
* SMS's originate from an "approved" phone number.

And we need a mechanism to store NEST `access_token` associated with the phone number.


### Sending commands via SMS

Nothing really out of the ordinary here. This is the usual **Twilio -> WT** setup that I described in previous posts. Security wise, I use [the header based signature Twilio employs](https://www.twilio.com/docs/api/security#validating-requests):

```js
/*------------ Twilio App Main ---------------*/
server.post('/sms', (req, res, next) => {
  if(twilio.validateExpressRequest(req,req.webtaskContext.secrets.TW_AUTH_TOKEN, {protocol: 'https'}) === false){
    return next('Unauthorized. Only accepts requests from Twilio.');
  }

  ....

```

This guards against anyone sending `POSTs` directly to that endpoint. Only Twilio can, because they are the only ones able to generate this signature.


### Configuring NEST security

Fortunately, NEST implements [OAuth2](https://developers.nest.com/documentation/cloud/how-to-auth) to authorize access to the API.

So, we just need to implement OAuth2 and obtain an `access_token` from NEST with the right scope and access permissions (e.g. read thermostat info and change temperature). 

This is quite trivial using Auth0....only that there's no OOB NEST connection. So I used a **[Custom OAuth2 Connection](https://auth0.com/docs/connections/social/oauth2)**, that allows me to plug any OAuth2 Authorization Server to Auth0:

![](https://docs.google.com/drawings/d/e/2PACX-1vQAy_WvMNWlFm1auFcOdRVv1GH8Igz68Lb-Wxt7kN5-qtKKqhaekRAB20sECyN9YcPN1OVfLvPAzaX-/pub?w=960&h=720)

The required parameters are:

* **Authorization URL**: `https://home.nest.com/login/oauth2`
* **Token endpoint**: `https://api.home.nest.com/oauth2/access_token`
* **client_id** and **client_secret**
* A script to retrieve the `fetchUserProfile`

All this information can be obtained from [NEST's developer portal](https://developers.nest.com/).

I could not find a `user profile` endpoint in NEST, but querying the root URL gives you a `user_id` and that's good enough for me. So the `fetchUserProfile` function you supply to Auth0 looks like this:

```js
function(accessToken, ctx, cb) {

  request.get('https://developer-api.nest.com', {
    headers: {
      Authorization: 'Bearer ' + accessToken
    }
  }, function(e, s, b) {
    if (e) return cb(e);
    cb(null, {
      user_id: JSON.parse(b).metadata.user_id
    });
  });
}
```

Auth0 automatically stores the Authorization Server `access_token` in the user profile. So the issue of _storing the access_token_ is solved.

It is easy to retrieve the `IDP access_token` for later use using the Auth0 Management API. The idea is that when someone sends an SMS, we can query the user profile associated with the phone, get the NEST `access_token` and then call its API.

### Login with NEST

Having Auth0 connected with NEST means we can now authenticate users in a generic way, using the Auth0 authentication API. 

This is done with simple `requests`:

```js
server.get('/', (req,res,next) => {

  req.session.nest_sms = {
    state: uid(8),
    phone: req.query.phone
  };

  var authorizeParams = {
    client_id: req.webtaskContext.secrets.A0_CLIENT_ID,
    redirect_uri: util.format('https://%s/nest-sms/callback',req.hostname),
    scope: 'openid',
    response_type: 'code',
    state: req.session.nest_sms.state,
    connection: 'nest',
  };
  
  res.redirect('https://{YOUR AUTH0 ACCOUNT}.auth0.com/authorize?' + qs.stringify(authorizeParams));
});

```

Notice I'm simply redirecting the user to the Auth0 authroization endpoint, adding the `connection` property (`nest` in my example). The end result is that you will be redirected to NEST for authentication/authorization.

The `session` object stores a random 8 character string and is sent as part of the request. This is a pretty important part of the request, because it prevents CSRF attacks. More below.

Then the `/callback` just handles the regular **OAuth2 authorization code flow**:

> Notice how it checks whether the `state` parameter returned in the query string is the same as the one sent int the original `/authorize` request. This prevents the `/callback` to be completed on transactions initiated by someone else.

```js
server.get('/callback',(req,res,next)=>{

  if(req.session.nest_sms.state !== req.query.state){ return next(new Error('Invalid session')); }
  
  //Exchange code for token
  request.post('https://{YOUR AUTH0 ACCOUNT}.auth0.com/oauth/token',{
    form:{
      grant_type: 'authorization_code',
      client_id: req.webtaskContext.secrets.A0_CLIENT_ID,
      client_secret: req.webtaskContext.secrets.A0_CLIENT_SECRET,
      redirect_uri: util.format('https://%s/nest-sms/callback',req.hostname),
      code: req.query.code
    }
  },(e,s,b)=>{
    //User is logged in with NEST. Associate phone with this user_id
    if(e) return next(e);
    if(s.statusCode === 200){
      var token = JSON.parse(b).id_token;
      var user = jwt.decode(token);

      //Store user_id in session
      req.session.nest_sms.user_id = user.sub;
      
      res.end(ejs.render(hereDoc(subscriptionForm), { 
                                                      phone: req.session.nest_sms.phone,
                                                      phone_subscribe_endpoint: util.format("https://%s/nest-sms/phone_subscription",req.hostname),
                                                      state: req.session.nest_sms.state
                                                    }));
    } else {
      next(new Error("There was an error in the enrollment (" + s.statusCode + ")"));
    }
  });
});
```

### Associating phone with user

Notice that if the token exchnage is successful, then we know the user has authenticated and authorized access to NEST API successfuly. We signal this with the `user_id` attribute being stored in the user `session`.

Also, I'm using `jwt.decode` and not `jwt.verify` because we trust the `id_token` returned by the Auth0 API. If we didn't, well...noting would work. `decode` is simpler than `verify` because it doesn't compute any signtures. I'm just interested in the `sub` claim (that equals the `user_id`).

Doing this is equivalent to calling the `/userinfo` endpoint in Auth0 using the `access_token` returned in the token exchange. I'm saving one network call.

> The `id_token` is returned if `scope=opeind` in the original request.

As a final step, I display a simple form that captures the user phone number and requests confirmation from the same user. The phone is automatically populated based on the original subscription SMS (stored in session). 

> If someone susbcribes with `phone X` and then sends the subscription link to a legitimate NEST owner (e.g. via a phishing attack). The attacked user would be able to login with NEST, but then would see `phone X` at the confirmation screen. Perhaps a stronger approach is to add a second **passwordless** step by having the system confirm the phone via a OTP.

If the user confirms the phone, then the system first validates that the user is authenticated and that a session exists:

```js
server.post('/phone_subscription',requiresAuth,(req,res,next)=>{
  if(req.session.nest_sms.state === req.body.state){
  var locals = {};
  async.series([
      (cb)=>{
        getAuth0AccessToken(req.webtaskContext.secrets.A0_CLIENT_ID,req.webtaskContext.secrets.A0_CLIENT_SECRET,(e,token)=>{
          if(e) { return cb(e); }
          locals.a0_access_token = token;
          cb();
        });
      },
      (cb)=>{
        //Update user app_metadata with phone
        request.patch('https://{YOUR AUTH0 ACCOUNT}.auth0.com/api/v2/users/'+req.session.nest_sms.user_id,{
          headers: {
            Authorization: 'Bearer ' + locals.a0_access_token
        },
        json:{
          app_metadata: {
            phone: req.body.phone
          }
        }},(e,s,b)=>{
          if(e){ return cb(e); }
          if(s.statusCode !== 200){
            return cb(new Error('Updating user failed. Subscribe with the S command.'));
          }
          cb();
        })
      }
    ],(e)=>{
      if(e){ return next(e); }
      req.session = null;
      res.end(ejs.render(hereDoc(genericMsgForm), { msg: "You are now subscribed!" }));
    });  
  } else {
    req.session = null;
    next(new Error("Invalid session. Subscribe with the S command and login with NEST first."));  
  } 
});
```

This route is protected with a middleware (`requiresAuth`) that simply checks that the `user_id` is in a session.

```js
var requiresAuth = (req,res,next)=>{
  if(req.session && req.session.nest_sms && req.session.nest_sms.user_id){ 
    return next(); 
  }

  next(new Error('Please login with NEST first. Use the S command to subscribe.'));
};
``` 

If the user is authenticated then:

* The backend gets an Auth0 Management API `access_token` (with scopes to update user metadata)
* PATCHes the specific user `app_metadata` with the user phone.

At this point the user profile in Auth0 will contain the phone number as part of the `app_metadata`.

### Sending commands via SMS

Now when a user sends a command via SMS, the system will:

* Use the `phone` to locate the user in Auth0 user store.
* Retrieve the NEST `access_token` stored in the user profile
* Call the NEST API

Here's the code for getting the temperature:

```js
function getTemperatures(auth,phone,command,done){
  var locals = {};
  locals.result = {};
  async.series([
      //Get an Auth0 Mgmt API Token to query user associated with the phone
      (cb)=>{
        getAuth0AccessToken(auth.client_id,auth.client_secret,(e,t)=>{
          if(e) { return cb(e); }
          locals.access_token = t;
          cb();
        });
      },
      //Locate the user with the phone using Auth0 search API
      (cb)=>{
        findUserByPhone(locals.access_token,phone,(e,user)=>{
          if(e) { return cb(e); }
          locals.user = user;
          cb();
        });
      },
      //Call NEST API with access_token
      (cb)=>{
        request.get('https://developer-api.nest.com',{
            headers:{ 
              Authorization: 'Bearer ' + locals.user.identities[0].access_token,
            }
        },(e,s,b)=>{
          if(e){ return cb(e); }
          if(s.statusCode !== 200){
            return cb('Error calling NEST. Try subscribing again');
          }
          var NESTInfo = JSON.parse(b);

          var thermostats = NESTInfo.devices.thermostats;

          //If no thermostat is specified, we return an array of all thermostats in the account
          if(!command){
            locals.result.thermostats = [];
            _.forOwn(thermostats,(t)=>{
              locals.result.thermostats.push(getTemperaturesFromThermostat(t));
            });  
          } else {
            locals.result.thermostat = getTemperaturesFromThermostat(_.find(thermostats,(t)=>t.name.toLowerCase()===command));
          }
          cb();
        });
      }
    ],(e)=>{
    if(e) { return done(e, 'Error getting temperature'); }  
    done(null,locals.result);    
  });
}
```

`findUserByPhone` uses the Auth0 Search API to find the user associated with the phone:

```js
function findUserByPhone(access_token,phone,done){
    request.get("https://{YOUR AUTH0 ACCOUNT}.auth0.com/api/v2/users?per_page=1&connection=nest&q=app_metadata.phone%3A'"+ encodeURIComponent(phone) + "'&search_engine=v2",{
        headers: { Authorization: 'Bearer ' + access_token }
    },(e,s,b)=>{ 
    if(e){ return done(e); }
    if(s.statusCode !== 200){ return done(new Error("Cannot find user. Did you subscribe?"),s.statusCode); }
    var users = JSON.parse(b);
    if(users.length === 0) { return done(new Error("Cannot find user. Did you subscribe?")); }
    done(e,JSON.parse(b)[0]);
  });
}
```

And because the NEST response is quite extensive, `getTemperaturesFromThermostat` function cleans up things for me:

```js
function getTemperaturesFromThermostat(thermostat){
  if(!thermostat){ return null; };
  return {
    ambient_t_c:thermostat.ambient_temperature_c,
    target_t_c:thermostat.target_temperature_c,
    name: thermostat.name,
    humidity: thermostat.humidity,
    state: thermostat.hvac_state
  };
}
```

> The Auth0 Management API `access_token` is scoped for: `read:users`, `update:users_app_metadata` and `read:user_idp_tokens`. The Webatsk is registered as a `client` for the Auth0 Management API and uses the `client_credentials` flow to obtain an `access_token`.

### Final notes

Here're a few things I'd like to dig into:

* NEST doesn't appear to offer `refresh_tokens` (couldn't find it in the docs). This means that eventually, calls to their API will fail as tokens get expired. In this case, you just subscribe again. But this is an area for further investigation.

* I'd like to add a phone verification step. As it is today, it should be fine, but one extra verification step via a OTP would not hurt. This will likely be a followup version.

### Update (Nov 27)

* Fixed a few typos
* Expanded on use of `id_token` in `/callback`
