---
layout: post
title:  "The daily stoic quote service is changing"
date:   2019-01-27
categories: sms
comments: true
author: Eugenio Pace
---

You are likely reading this post because you are or were subscribed to my micro-application that sends an SMS with a daily quote from my favorite stoic philosophers.

In the last few (months!) I've been (slowly) rewriting the service, porting it into a new platform and adding new features.

I will shut down the old service on February 28th. I've been running the new service for a while now so I am confident it works as it should.

### What's new?

#### An all new subscription command

The most important new feature I've added is the ability to subscribe to different times of the day. For example:

```
s 7 10 15
```

Will subscribe you to 3 daily quotes delivered at 7am, 10am, and 3pm. Notice that these are always *Pacific Standard Times*. Please do the math to adjust to your own timezone.

Complementary to `subscribe` you can `unsubscribe`:

```
u 7 10
```

or

```
u all
```

Pretty straightforward.

Also, the subscribe command with no arguments (e.g. just sending `s`) will:

1. Return all currently subscribed times.
2. Subscribe you to a single default 6am PST if you are not a subscriber.

#### A New Number
As part of the changes, I have moved the Twilio app to a new phone number. If you were subscribed before you will get a welcome message from it (with a link to this post). Make sure you update your contacts.

#### A Terms of Service
There're new ToS for this app: I make no guarantees of any kind. The quotes delivered by the service may or may not help you, depending on your circumstances and interpretation. No guarantees on their applicability to you. I reserve the right to change anything, anytime, including discontinuing the service or removing any subscriber for any reason. 

You now have the `tos` command to read the ToS on your phone. You can request it in your preferred language too. For example, use `tos zu` to read it in Zulu. 

You agree to this ToS when you subscribe using the `s` command. 

### What is in the works?

1. All the quotes I have in my database are from Marcus Aurelius. I've been (slowly) collecting quotes from other stoic philosophers so I will have new content coming soon.

2. Translations to any [Google Translator supported languages](https://translate.google.com/intl/en/about/languages/) was always available:

```
t ru
```

Will result on the last quote sent to you being translated into Russian. I would like to add this as a _preference_ so all quotes are delivered to you in the language of your choice.

### The tech

I've migrated this micro-app as part of a larger effort to consolidate a bunch of other apps that I have scattered around in various hosting environments. Many share a lot of components and it made sense to normalize everything into a single platform.

So I moved everything to Heroku (from Webtask). I still use Webtask extensively for experimentation and quick prototyping, but when something graduates into a more stable/permanent status I will move it to Heroku.

The porting effort was relatively modest. But I did take the opportunity to refactor them, adopt new methods and language features (ES6), remove old packages, upgrade drivers and modules, and a general cleanup of everything for increased consistency (e.g. using `boom` for errors, `winston`, etc). Besides doing something useful, the apps' main purpose is to serve as a platform for me to stay current on technology and learn new stuff.

I'm calling my apps "micro apps" for a reason. They are quite simple (although I'm surprised how I come to depend on some of them :-)). 

2018 has been a very busy year for me, and I haven't had a chance to write about all the other micro-apps I've been working on. Planning on changing that in 2019.

> "Begin. To begin is half the work, let half still remain; again begin this, and you will have finished." —Marcus Aurelius