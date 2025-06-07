---
layout: post
title: "Using a Watchdog to fix all issues"
date:   2020-05-11
categories: arduino
comments: true
author: Eugenio Pace
---

My little [project](/post/2020-01-18-A-Display-of-Stoic-Quotes-using-Arduino-and-e-Paper-Display.md) has become quite sophisticated now. I managed to code enough to fill 82% of Arduino's total program memory!

One of the latest additions was telemetry. I'm using the board's WiFi capabilities to send back home a summary of statistics, error conditions, and various other metrics.

Now that I have a [scheduler](/post/2020-03-28-A-Very-Simple-Task-Scheduler-on-Arduino.md) this is easy to do. There's no requirement to send anything in real-time, so I can have this happen every few hours.

I might cover the details of the networking stack in a later post, although there's nothing special about it—just a simple HTTPs call to an API secured by [Auth0](https://auth0.com).

> I've already covered the mechanics of authentication [here](/post/2019-04-14-calling-secure-apis-from-arduino-part-i.md) and [here]({ post_url 2019-04-14-calling-secure-apis-from-arduino-part-ii.md). 

It all works great, but sometimes (very rarely), the board hangs. I spent a few cycles and couldn't find anything obvious. It all works fine when I look into it. I suspect a memory issue. The payloads for token exchange can sometimes get large (around 1.5KB in some cases), and even though I've been careful to use singletons, added error control and use memory very carefully, every once in a while something goes wrong, and I need to reset the board, which of course is not very convenient for long term operations and resiliency.

## The Watchdog timer

Most uControllers used in embedded systems include a [Watchdog timer (WDT)](https://en.wikipedia.org/wiki/Watchdog_timer), and the [Atmel SAMD21](https://www.microchip.com/wwwproducts/en/ATsamd21g18) is no exception. A Watchdog timer is essentially an independent timing subsystem that needs to be reset always. If the system fails to reset the timer for whatever reason, it will automatically restart the controller (or put it in a safe mode).

> A reset solves> 99% of computer problems.

## The SAMD21 WDT

The ATSAMD21 chip includes a WDT, and there are a few libraries to access it in a simplified way. A simple to use one is [Adafruit's Sleepy_Dog](https://github.com/adafruit/Adafruit_SleepyDog).

> The library is a good abstraction, but it could use better documentation, perhaps. e.g. `resetCause()`

My first attempt was to schedule a 5-minute timer (plenty for all my operations) and then schedule a 1 min reset using the scheduler. The solution was great and elegant:

```c++
  dispatcher.add("Reset WDT", actions.resetWDTAction, 1);  
```

and:

```c++
void Actions::resetWDTAction(){
  Watchdog.reset();
}
```

But naturally, it didn't work. [Digging into the library code](https://github.com/adafruit/Adafruit_SleepyDog/blob/master/utility/WatchdogSAMD.cpp#L36), I've found that the WDT has a maximum time of 16 seconds. 

```c++
...
if((maxPeriodMS >= 16000) || !maxPeriodMS) {
        cycles = 16384;
        bits   = 0xB;
    } else {

      ...
```

Which is a little bit tight for my use case. While the system is doing nothing most of the time, some operations are quite lengthy. For example, refreshing the e-paper display takes a while, refreshing a token requires a network round-trip. A full authorization might take even longer when you consider these steps:

1. Call Auth0 to start the process.
2. Display the QRCode for scanning the URL with a phone.
3. Log in with your phone while the device is polling.
4. Complete the process.
5. Clean up the display and display another quote.

Some googling later, I found a few alternatives, but I did not like any of them. And then, I came up with an even more straightforward and elegant solution.

It turns out I already have a long-running timer, the RTC used by the scheduler that emits an event every 1 min. The RTC is interrupt driven so reasonably independent of what is going on in the rest of the system.

The handler for this interrupt simply sets a flag:

```c++
int tick = 0;
void signalNewTick(){
  tick = 1;
}
```

That the main program `loop()` checks:

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

Note that the code in the loop clears the `tick`. If something gets stuck, it will be in `dispatcher.dispatch()`. The timer handler will be called always. So I really need is check if the `tick` flag is *not cleared* and wait a couple of cycles:

```c++
int tick = 0;
void signalNewTick(){
  if(tick ==  1){
    Watchdog.enable(4000);
  }
  tick = 1;
}
```

and in `loop()`:

```c++
void loop(){

  Watchdog.reset();
  ...

```

If `loop()` is called, we are in business. If it isn't and the WDT is on, then the CPU resets.

This is essentially a (very simple) cascading WDT. The first one is the RTC, the second the chip's actual WDT.

## Knowing how your CPU has reset

The chip WDT also gives you insight into what caused the last reset storing all causes in the `RCAUSE` register, which is conveniently available as a method in the library. From the [chip's datasheet](https://cdn.sparkfun.com/datasheets/Dev/Arduino/Boards/Atmel-42181-SAM-D21_Datasheet.pdf):

* Bit 7 – Reserved
This bit is unused and reserved for future use. For compatibility with future devices, always write this bit to zero
when this register is written. This bit will always return zero when read.

* Bit 6 – SYST: System Reset Request
This bit is set if a system reset request has been performed. Refer to the Cortex processor documentation for more
details.

* Bit 5 – WDT: Watchdog Reset
This flag is set if a Watchdog Timer reset occurs.

* Bit 4 – EXT: External Reset
This flag is set if an external reset occurs.

* Bit 3 – Reserved
This bit is unused and reserved for future use. For compatibility with future devices, always write this bit to zero
when this register is written. This bit will always return zero when read.

* Bit 2 – BOD33: Brown Out 33 Detector Reset
This flag is set if a BOD33 reset occurs.

* Bit 1 – BOD12: Brown Out 12 Detector Reset
This flag is set if a BOD12 reset occurs.

* Bit 0 – POR: Power On Reset
This flag is set if a POR occurs


I've added this information to the telemetry payload to get an insight into how often it happens. Notice the register also tells us if the board runs out of power and shuts down on a power failure. 
