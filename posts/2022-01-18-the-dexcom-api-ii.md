---
layout: post
title: "The Dexcom API - Part II"
date:   2022-01-18
categories: dexcom
comments: true
author: Eugenio Pace
---

I [wrote before](/post/2021-08-14-exploring-the-dexcom-api.md) about the Dexcom device for continuous glucose monitoring, and how you can use their API to login, obtain `access_token`.

Auth0 makes it easy to add _Login with Dexcom_ to any app. What can you do afterwards? I wrote a simple app that queries the API for summary data. Here it is:

```js
const ss = require('simple-statistics');

domain.getSummaryData = (access_token, n, unit, done) => {

  // 2021-08-10T01:44:53
  const startDate = moment().subtract(n, unit).toISOString().substr(0,19);
  const endDate = moment().toISOString().substr(0,19);

  const options = { 
                    method: 'GET',
                    url: `https://api.dexcom.com/v2/users/self/egvs?endDate=${endDate}&startDate=${startDate}`,
                    headers: { 'authorization': `Bearer ${access_token}` },
                  };
  axios(options)
    .then(response => {
      console.log(response.data);
      const data = _.map(response.data.egvs, (d) => d.realtimeValue);
      
      if(data && data.length === 0){
        return done(null, null); //no data
      }

      const summary = {
        min: ss.min(data),
        max: ss.max(data),
        mean: Math.round(ss.mean(data)),
        median: ss.median(data),
        sdev: Math.round(ss.standardDeviation(data)*100)/100,
        mode: ss.mode(data),
      };
      done(null, summary);
    }).catch(error => {
      console.log('error', error);
      done(error);
    });
}
```

## Implementation notes

1. The awesome `moment` module helps format the dates in the way Dexcom expects.
2. `endDate` is always `now`.
3. The `Simple-Statistics` module makes it trivial to compute various parameters (e.g. median, min, max, etc). Likely not super efficient. 
4. I use a `cron` job to run this periodically (more on this in a future post)

The parameters for the function allow you to specify any interval from `now`:

```sh
n=1, unit='day'
n=10, unit='hour'
n=5, unit='minute'
```
