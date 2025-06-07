---
layout: post
title: "OTA Updates for Arduino Projects - Part IV"
date:   2021-11-06
categories: arduino ota
comments: true
author: Eugenio Pace
---

Continuing with my series on OTA updates for my project, this time I'll cover building the back-end. The hardest piece was comparing versions (following the `MAJOR.MINOR.PATCH` format). Thanks [StackOverflow](https://stackoverflow.com/) for some good ideas on how to do it.

The approach I took is fairly straightforward:

1. I added a new endpoint on my back-end `/updates`.
2. The device polls regularly to the endpoint requesting a new version.
3. If no new version is available, it returns `404`.
4. If a new version is available, it sends the new file back to the device.

The endpoint includes the *device type* in the route (because different devices might take different images: displays, printers, etc.) and a query parameter for the current version:

```sh
GET httsp://{YOUR ROOT WEBSITE}/updates/display?version=1.3.4
```

The above request means: 

> I am a *display*, running on version 1.3.4, is there a new version for me?

The implementation looks like this:

```js
server.get('/updates/:deviceType', [limiter], (req, res, next) =>{
  const v = req.query.v || req.query.version;
  const type = getDeviceType(req.params.deviceType);

  if(!type){
    return next(boom.notFound("Device type not recognized"));
  }

  getNewVersion(v, type, (e, file, latest) =>{

    if(e){
      log('Check for updates error', e)
      return next(boom.serverUnavailable());
    }

    if(!file){
      return next(boom.notFound("No update available"));
    }

    const md5File = require('md5-file');

    md5File(file).then((hash)=>{
      res.set({
        "Digest": hash,
        "X-FirmwareVersion": latest,
      });
      res.download(file, 'UPDATE.BIN');
    }).catch((e) =>{
      return next(boom.serverUnavailable("Error"));
    });
  });
});
``` 

Couple of noteworthy things:

1. `md5File` is a hash of the file. I'm not using this at all it turns out. But I was experimenting with an additional layer of verification. For the time being, I trust (as I should), that `HTTP` (or rather `TCP/IP`) will keep my file in one piece.

2. `X-FirmwareVersion` is a custom header I am using to send the version back to the device. The actual firmware version is hard-coded in the image, this allows me to easily log, send a notification, print status, etc. _before_ booting the new version.

3. Most of work is on `getNewVersion`. The arguments to the function are: `current version` and `device type`.

```js
function sortVersions(versions){
   return _.map(versions, (v) => normalizeVersion(v))
      .sort()
         .map(v => denormalizeVersion(v));
}

function normalizeVersion(v){
  return v.split('.').map( n => +n+100000 ).join('.');
} 

function denormalizeVersion(v){
  return v.split('.').map( n => +n-100000 ).join('.');
}

/*
  Returns (in a callback) the path for the file & the latest version
*/
function getNewVersion(currentVersion, type, done){

  const fs = require('fs');

  fs.readdir(`${firmwarePath}/${type}`, (err, files) => {
    if(err){ return done(err); }
    if(!files || files.length === 0){ 
      return done(null, null); 
    }

    const update = sortVersions(_.map(files, f => f.replace(".BIN","")))[files.length-1]; //Get the last one (higher version)
    
    if(normalizeVersion(currentVersion || "0.0.0") < normalizeVersion(update)){
      return done(null, `${firmwarePath}/${type}/${update}.BIN`, update);
    }

    done(null, null);
  });
}
```

The `normalizeVersion` and `denormalizeVersion` functions make it simple to make the versions comparisons. At this stage, all firmware updates are stored as static files on the app. That is deployed with the app, but not addressable directly, meaning you can't reach the files on an HTTP route. 

A better approach perhaps would be to store them someplace else (e.g. S3 bucket, etc) as new releases essentially requires redeploying the entire app. But that is not a problem I have right now.  

