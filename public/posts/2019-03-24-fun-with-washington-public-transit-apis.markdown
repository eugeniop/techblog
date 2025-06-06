---
layout: post
title:  "Fun with Washington Public Transit APIs"
date:   2019-03-24
categories: api sms
comments: true
author: Eugenio Pace
---

The sun is becoming a more frequent companion here in the Pacific Northwest. Days are longer, warmer and nature is noting the change too. A great time of the year to take any of the ferries in the Washington State Ferries fleet around Puget Sound. One of the cheapest cruises you can take. 

As I got lost in thoughts admiring the incredible beauty of Puget Sound and the Olympics while crossing from Seattle to Bainbridge Island, I casually googled for a "washington ferry API" and to my surprise, I found promising results:

![](https://docs.google.com/drawings/d/e/2PACX-1vTXZv6Yk32Yk_aKhcCl8xGoNB_ieqC8gD9Odj13NhftV5JyW2HC4EiSySF3FN84EcEeqG9ckw2reL7m/pub?w=926&h=640)

A little bit more digging, and I've found that there's an API for pretty much all the information available on the [website](https://www.wsdot.wa.gov/): schedules, traffic alerts, etc.

And of course, it inspired me to write another uApp to query ferries' schedule. I imagined being able to send a short SMS like:

```sh
s bain sea
```

That could be interpreted as _"send schedule for next ferries departing Bainbridge Island and arriving in Seattle"_. 

To my surprise, building this took much less than expected with all the building blocks readily available.

### WSDOT APIs 

WSDOT API is mostly read-only. At least for public consumption. They all require an `APIACCESSCODE` that you can get by simply entering an email here: http://www.wsdot.wa.gov/traffic/api/

The access code is sent in the query string of all requests, for example:

```
GET http://www.wsdot.wa.gov/Ferries/API/Schedule/rest/scheduletoday/{DEPARTURE ID}/{ARRIVAL ID}/true?apiaccesscode={API_ACCESS_CODE}
```

> Probably not a great thing to send access keys on a query string, but these APIs serve public information anyway. I assume (although I can't confirm) that they use this for throttling or tracking purposes only, rather than actual security.

The 2 endpoints I ended up using these:

1. [Get All Terminals basic informaton](http://www.wsdot.wa.gov/ferries/api/terminals/rest/help/operations/GetAllTerminalBasicDetails)
2. [Get Today's Schedule by Terminal Combo](http://www.wsdot.wa.gov/ferries/api/schedule/rest/help/operations/GetTodaysScheduleByTerminalCombo)

The first one returns a list of all ports, including *Full Name*, *Abbreviation* and *ID*. This is reference data. I cache this information in a local database because ... ports don't really change that often. I then use this information to look up the *TerminalID* using the name as the key (or part of it).

> I guess I could have just called the API every time. The data set is pretty small, and the response time is overall good. 

The second endpoint provides a very convenient list of all scheduled departures for the day, between two ports. Which, you guessed, is exactly what I need.


#### Parsing dates

One annoying thing of the APIs is that dates are serialized in an old Microsoft proprietary format:

```js
{
  /* A bunch of other stuff here ... */
Times:[ 
      { 
       DepartingTime: '/Date(1553402700000-0700)/',
       ArrivingTime: null,
       LoadingRule: 3,
       VesselID: 37,
       VesselName: 'Wenatchee',
       Routes: [...],
       AnnotationIndexes: [] 
      },
      {
       DepartingTime: '/Date(1553405400000-0700)/',
       ArrivingTime: null,
       LoadingRule: 3,
       VesselID: 36,
       VesselName: 'Walla Walla',
       Routes: [...],
       AnnotationIndexes: [] 
      }
    ]
  /* Another bunch of stuff here too... */
}
```

I spent (thankfully a short) time trying to parse it manually (e.g. searching for "/Date(" and "-" and )/"), until I casually checked with the always awesome [momentjs](https://momentjs.com/) library and [it does all the work already!](https://momentjs.com/docs/#/parsing/asp-net-json-date/). I am already using the library extensively so I did not bother. How awesome is that. Thanks, `momentjs`!

### The app

Because I have a (powerful) hammer, everything looks like Twilio. I've got an entire scaffolding of code to handle commands via SMS, so I simply added a new route to it. The function that does the bulk of all the work is this one:

```js
domain.getTodaysSchedule = (from, to, done) => {

  if(!from || !to ){
    return done("Please enter Departing and Arriving Terminals");
  }

  connectDb((err, client) => {
      if(err) return done(err, "System error. Please try sometime else");
      client.db()
        .collection(ferries_terminals)
        .findOne({}, { sort: [["updatedOn", -1]] }, (err, data) => {
          client.close();

          function search(terminal, input){
            return terminal.name.toLowerCase().startsWith(input.toLowerCase()) || 
                   terminal.abbreviation.startsWith(input.toLowerCase())
          }

          var departure = _.find(data.terminals, (t) => search(t, from) );
          if(!departure){
            return done("Destination port not found");
          }
          
          var destination = _.find(data.terminals, (t) => search(t, to) );
          if(!destination){
            return done("Arriving port not found");            
          }

          request.get(util.format("http://www.wsdot.wa.gov/Ferries/API/Schedule/rest/scheduletoday/%d/%d/true?apiaccesscode=%s",departure.id, destination.id, process.env.WSF_ACCESS_TOKEN),
            (e,s,b)=>{
              if(e) return done(e);
              var sc = JSON.parse(b);
              if(!sc.TerminalCombos || (sc.TerminalCombos && sc.TerminalCombos.length === 0)){
                return done(null,{
                                    from: departure.name,
                                    to: destination.name
                                  });
              }
              const tc = sc.TerminalCombos[0];
              const times = _.map(tc.Times,
                                  (t) => {
                                    return {
                                      departingTime: moment(t.DepartingTime),
                                      vessel: t.VesselName
                                    };
                                  });  
              done(null, {
                from: tc.DepartingTerminalName,
                to: tc.ArrivingTerminalName,
                times: times
              });
          });
      });
  });
}
```

`to` and `from` are destination and origin cities. It accepts incomplete names (but no spaces). The `search` function simply tries to match the first occurrence with whatever input is supplied (using the `startsWith` string comparison function). For example `bain` will match `Bainbridge Island`, and `sea` will match `Seattle`. I'm also checking the official abbreviation, but who would know that `PS2` is `Seattle`!?

The two parameters are mandatory and I am not checking that the departure and arrivals are an actual route. I leave that validation to the API. In that case, the `TerminalCombos` property will be empty.

If the route between the two destinations is valid, then the `TerminalCombos` property will contain an array of `Times`. I'm using the `lodash.map` function to clean it up, and parse the date-times (with `momentjs`).

## How it looks like

![](https://docs.google.com/drawings/d/e/2PACX-1vRupCIRJsTzzhW_vEzObwtj5HiRlhjDDVRkX0edJuDfDByAxfIlIyhwAJxvDzzW8thiylI1CcHi6942/pub?w=402&h=687)


### Future developments

This little project was fun to build. There are many optimizations (routes?), and potential uses. The API is quite rich on the variety of information it publishes, so I can already see a number of other things to explore.

Querying by route is a natural extension to this project.
