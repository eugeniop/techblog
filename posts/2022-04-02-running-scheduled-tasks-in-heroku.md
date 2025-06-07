---
layout: post
title: "Running scheduled tasks in Heroku"
date:   2022-04-02
categories: cron heroku
comments: true
author: Eugenio Pace
---

Many of my projects often times have a background job that runs on a schedule:

* Text me a reminder if something happened or didn't happen.
* Cleanup jobs for files, databases, caches, etc.
* Polling for status (e.g. a queue) and acting based on the event.

All things that in a different era I would have used the old and reliable [cron](https://en.wikipedia.org/wiki/Cron).

In the new brave world of PaaS things work a slightly different way (better!). Because I host all my apps on Heroku, I heavily relied on Heroku's [built in Scheduler add-on](https://devcenter.heroku.com/articles/scheduler). Despite disclaimers, it has been working great for years with no misses.

But, alas, it's scheduling flexibility is limited so I started doing some research and, of course, I found [a module on npm](https://www.npmjs.com/package/cron) that gives me all the flexibility I need, and takes me back 25 years when I was a Unix admin.

I decided to structure my cronjobs using some conventions.

* Every project with a job, will have a folder `cronjobs`
* An `index.js` file will export all jobs

```js
function run(){
  //Do something 
}

module.exports = [{
  name: 'Awesome job',
  schedule: "0 * * * *",  //Every hour
  description: "Awesome job description",
  job: () => {
    run();
  }
}];
```

Notice it exports an `array`. In some cases, I have many jobs for an app. I can easily arrange all these in different files under the same folder:

```sh
/appX
  /cronjobs
    index.js
    job1.js
    job2.js
```

And then:

```js
//JOB1

function run(){
  //Do something 
}

module.exports = {
  name: 'job1',
  schedule: "0 8 * * *",  //Every day @ 8:00AM
  description: "job1 description",
  job: () => {
    run();
  }
};
```

`index.js` would simply:

```
module.exports = [
  require('./job1'),
  require('./job2')
];
```

* All jobs are hosted in [Heroku's custom clock process](https://devcenter.heroku.com/articles/scheduled-jobs-custom-clock-processes#custom-clock-processes) which only requires defining an entry in the project's `ProcFile`

```sh
web: node index.js
clock: node clock.js
```

* Last but not least, the actual host process. Here's where CronJob's are instantiated. Because I am using this file convention, I wrote a little bit of a generic loader so I can simply add new jobs as needed and they will be automagically picked up, loaded and ran at the desired times.

```js
require('dotenv').config();

const CronJob = require('cron').CronJob;
const _ = require('lodash');
const moment = require('moment-timezone');

const { log } = console;

var normalizedPath = require("path").join(__dirname);

const fs = require("fs");

  fs
  .readdirSync(normalizedPath + "/apps", { withFileTypes: true })
    .forEach((file) => {
      
      //Folders that start with "_" are ignored by convention
      if(file.isDirectory() && file.name.startsWith('_') === false){
        const cronPath = normalizedPath + "/apps/" + file.name + "/cronjobs";
        
        if(fs.existsSync(cronPath)){

          const job = require(cronPath);  //Each cronjob file can contain many "crons"
          job.forEach((cj) => {
            log('Loading ' + cj.name);
            log('Schedule: ', cj.schedule);
            const cron = new CronJob(cj.schedule, cj.job, null, true, 'America/Los_Angeles');
            cron.start();

            //Setup a simple timer to show next scheduled run
            setInterval(() => {
              log(`${cj.name} next run: ${moment(cron.nextDates(1)[0])
                              .tz('America/Los_Angeles')
                              .format('YYYY-MM-DD - hh:mm:ss')}`)
            }, 10000);
          });
        }
      }
    });
```

## Notable missing parts / caveats

* The logging infrastructure is pretty primitive
* Minimal exception handling
* No real monitoring of jobs (just `heroku logs -t -d=clock`)

