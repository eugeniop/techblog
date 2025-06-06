---
layout: post
title: "A Very Simple Task Scheduler on Arduino"
date:   2020-03-28
categories: arduino
comments: true
author: Eugenio Pace
---

Another turn in my journey building the [Stoic Display](/post/2020-01-18-A-Display-of-Stoic-Quotes-using-Arduino-and-e-Paper-Display.md). I wanted to launch a number of tasks on some recurrence. The most basic one being `showing a quote`. 

But as I added more features, I realized the need to do many other things. Among them:

1. Synchronize the internal clock using NTP
2. Compute statistics on the quotes that have been shown (e.g. last 10 quotes displayed, most frequently displayed one, etc.)
3. Send statistics and telemetry to an endpoint

In the spirit of keeping things simple, I came up with this architecture:

1. A `Timer` (interrupt-driven) that sets a signal every predefined amount of time (for me this every minute). I am calling this event a `tick`.
2. A `Dispatcher` that reacts to each `tick`.
3. An array of registered `actions`.

This Arduino board comes with an RTC and there's a [cute library](https://github.com/arduino-libraries/RTCZero) that allows you to set up _cron-esque_ alarms. 

Now, timer notifications run as an *ISR* (Interrupt Service Routine), and ISRs have a bunch of limitations. It is generally a good idea to keep ISRs short and as simple as possible to prevent any weird side effects.

> Some good notes on ISRs [here](https://www.arduino.cc/reference/en/language/functions/external-interrupts/attachinterrupt/)

In my implementation, the ISR simply sets a flag. Can't think of anything simpler than that:

```c++
void init(unsigned long epoch, void (*tickHandler)()){
    //Start the RTC
    rtc.begin();
    set(epoch);
    
    //Default ticker is 1/min
    rtc.setAlarmSeconds(1);
    rtc.enableAlarm(rtc.MATCH_SS);
    rtc.attachInterrupt(tickHandler);
}
```

Some place else (in my `..ino` typically):

```c++
int tick = 0;
void signalNewTick(){
  tick = 1;
}

...

clock.init(epoch, signalNewTick);

```

Now the main loop, typical of all Arduino sketches looks like this now:

```c++
void loop(){
  //Checks whether a new signal for a new action is due or not.
  //tick is set every minute. The dispatcher will call all actions that are due
  if(tick){
    Debug("Ticker. tick");
    tick = 0;
    dispatcher.dispatch();
  }
}
```

## The Dispatcher

Let's dissect the `Dispatcher::dispatch` now. 


```c++
#ifndef DISPATCHER_H
#define DISPATCHER_H

#define MAX_ACTIONS 10

typedef struct {
  const char * name[MAX_ACTIONS];         //Name of the action
  void (*actions[MAX_ACTIONS])();   //List of "Actions" to call on their "tick"
  int ticks[MAX_ACTIONS];           //The number of 'ticks' after wich an action will be called on. 1 tick = 1 min. A value of 3, means the action will be called every 3 min
  int count[MAX_ACTIONS];           //Used to keep track of the counts for the action.
  int len;                          //Actual actions
} ACTIONS;


class Dispatcher{

  static ACTIONS actions;                       

public:

  int add(const char * name, void (*action)(), int _ticks){
    if(actions.len  == MAX_ACTIONS){
      return -1;
    }
    actions.name[actions.len] = name;
    actions.actions[actions.len] = action;
    actions.ticks[actions.len] = _ticks;
    actions.count[actions.len++] = 0;
    return actions.len;
  }

  void updateActionTicks(int actionIndex, int _ticks){
    //Ignore updates out of range
    if(actionIndex >= 0 && actionIndex < actions.len ){ 
      actions.ticks[actionIndex] = _ticks;   
    }
  }

  void dispatch(){
    for(int x=0; x < actions.len; x++){
      actions.count[x]++;
      if(actions.count[x] >= actions.ticks[x]){
        Debug("Dispatcher. Action " + String (x) + " ready");
        actions.count[x] = 0;
        (*actions.actions[x])();
      }
    }
  }

  const ACTIONS * getActions(){
    return &actions;
  }
};

ACTIONS Dispatcher::actions;

#endif
```

The data structure `ACTIONS` keeps a list of:

1. Names
2. Pointers to handlers (the `action`)
3. The number of `ticks` at which the `action` will be called
4. A counter for the current `ticks`


`dispatcher::dispatch` (which runs on every timer `tick`), simply iterates over all registered actions, checks if the counter for each has reached the predefined number, and if it has it calls the `action`.

The other methods are various getters and setters to the `ACTIONS` data structure.


## Setup

Setup is trivial (usually in the `setup` function of the sketch):

```c++
dispatcher.add("Show Quote", actions.showQuoteAction, 5);       // Every 5 ticks
dispatcher.add("Save Stats", actions.saveStatsAction, 120);     // Every 120
dispatcher.add("Synch Clock", actions.synchClockAction, 1440);  // Once a day for a 1 min / tick frequency
dispatcher.add("Send Stats", actions.sendStatsAction, 480);     // Every 8 hours
```

## Features and limitations

Notice that this scheduler has no notion of precise time. All `actions` run sequentially one after the other. Some might take longer than others. And because they all run in the `main thread` (if we can call it that way), you are free to use any time limiting/manipulation function (e.g. `delay` or `millis`). The end result is that it is possible that some functions will not run *exactly* at the time you scheduled them. This is more of a cooperative scheduler. And needless to say, if an `action` never returns, then nothing else will run! This is totally fine for this design where precision timing is not required (and `ticks` are measured in *minutes* which is almost eternal time for a microprocessor).

> An application like mine doesn't really require the sophistication of an _OS like_ task scheduler.

Also, notice the use of _fixed_ arrays (e.g. `MAX_ACTIONS`). In this project, there's a well known list of actions, and there's no need for any dynamic allocation. In small systems like this, with contrained memory, I like keeping things as bare bones as possible.


