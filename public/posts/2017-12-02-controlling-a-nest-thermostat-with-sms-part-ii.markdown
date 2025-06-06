---
layout: post
title:  "Controlling a NEST thermostat with SMS - Part II"
date:   2017-12-02
categories: auth0 nest
comments: true
author: Eugenio Pace
---

This is a short followup excercise in my **SMS <-> NEST** integration: adding Phone verification. 

The goal here is to instead of just accepting the user phone number and associating it with a user profile, I validate it first with a OTP.

Here's my solution: 

* After authentication, I display the phone form as before.
* In the POSTback I add a new step:

```js
server.post('/phone_subscription',requiresAuth,(req,res,next)=>{
  if(req.session.nest_sms.state === req.body.state){
    
    var phone = req.body.phone;
    
    //Generates a simple 4 digit code & saves to local state tied to the user/phone
    var otp = uid(4,{numericOnly:true});
    sendSMSToRecipient({
                        sid:req.webtaskContext.secrets.TW_ACCOUNT_SID,
                        token:req.webtaskContext.secrets.TW_ACCOUNT_TOKEN
                        },
                        phone,"Your code is: "+otp,(e)=>{
      saveSubscriptionOTC(req.webtaskContext,phone,otp,(e)=>{
        if(e){ 
          req.session = null;
          return next(e); 
        }
        req.session.nest_sms.phone = phone;
        res.end(ejs.render(hereDoc(otpForm), { 
                                              phone_verify_endpoint: util.format("https://%s/nest-sms/phone_verify",req.hostname),
                                              state: req.session.nest_sms.state
                                            }));  
      });
    });
  } else {
    req.session = null;
    next(new Error("Invalid session"));  
  }
});
```

This route handler (protected with the same `requiresAuth` middelware) generates a random 4 digit code and sends it to the phone (using the Twilio API). Then it stores it in a local database, and finally renders a simple form for the user to enter the OTP received via SMS.

For the local database, I figured MongoDB (mLab) would be overkill, so I'm using [Webtask Storage](https://webtask.io/docs/storage). `data[otp]` is a simple JSON object with the phone and a timestamp (`created_at`):

```js
function saveSubscriptionOTC(ctx,phone,otp,done){
  ctx.storage.get((error, data)=>{
      if(error){ return done(error); }
      if(!data){ data = {}; }
      data[otp] = {
                    phone:phone,
                    created_at: new Date()
                  };
      ctx.storage.set(data,(error)=>{
          if(error){ return cb(error); }
          done(null);
      });
    });
}
```

> The intent of the `created_at` is being able to expire the code, but I have not implemented this yet.

The final stage is confirming the OTP, and then proceeding like before (e.g. getting an Auth0 `access_token`, PATCH'ing the user, etc).

```js
server.post('/phone_verify',requiresAuth,(req,res,next)=>{
  if(req.session.nest_sms.state === req.body.state){
    var locals = {};
    async.series([
        (cb)=>{
          //Check OTP & phone
          req.webtaskContext.storage.get((e,data)=>{
            if(e){ cb(new Error('OTC cannot be retrieved', e)); }
            locals.data = data;
            var subscription_record = data[req.body.otp];
            if(!subscription_record){ return cb(new Error('Invalid OTP')); }
            if(subscription_record.phone !== req.session.nest_sms.phone){ return cb(new Error('Invalid phone/OTC')); }
            cb();
          });  
        },
        (cb)=>{
          delete locals.data[req.body.otp];
          req.webtaskContext.storage.set(locals.data,(e)=>{
            if(e){ return cb("Error updating OTP store", e); }
            cb();
          });
        },
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
              phone: req.session.nest_sms.phone
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
        req.session = null;
        if(e){ return next(e); }
        res.end(ejs.render(hereDoc(genericMsgForm), { msg: "You are now subscribed! Send 'H' for  help on commands"}));
      });  
  } else {
    req.session = null;
    next(new Error("Invalid session"));  
  } 
});
```

## Additional implementation notes

* Webtask storage is a convenient, easy to use, simple persistence mechanism. It is limited to 500KB, so it would not work for large volume, high traffic, lots of concurrency, etc. For the purposes of this app, it is more than sufficient, and I have one less subsystem to worry about.
* Expiring codes is in the ToDo.
