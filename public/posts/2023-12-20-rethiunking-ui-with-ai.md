---
layout: post
title:  "Rethinking UIs in a world of AI"
date:   2023-12-21
categories: openai
comments: true
author: Eugenio Pace
---

Last post of 2023!

One of my hobby applications allows the user to schedule an activity (in my case, sending a quote via SMS). The scheduling capabilities today are pretty basic, just the times of the day. Like `8, 9, 10` means `send a message at 8, 9 and 10 am PST`

The backing technology is essentially a cronjob, so to keep things simple, I schedule the cronjob on every hour, and then I simply search for any jobs matching the time.

The library I use for cronjobs allows very sophisticated scheduling and I wanted to allow the user (me!) to access all that.

The back-end is pretty straightforward, but the challenging part turned out to be the UI. How do you capture all the expressiveness of a cronjob schedule? I forget the syntax often. So I started down the path of creating UI controls for hours, days, weeks, months, plus all the validation; which was too much; not to mention that I don't have a lot of time for pet projects.

After some thought, I decided to limit the UI to a single textbox, allowing the user (me!) to simply write the schedule in *English* and allow OpenAI to translate that into a cron expression.

So, now I can simply write `Every Monday at 8am and 10PM` and the system will automatically generate: `0 9,22 * * 1`

The code looks like this (`cronText` is the schedule in English)

```js
exports.createCronSchedule = (cronText, done) => {
  openai.callOpenAIPrompt([
    {role: "system", content: "You are a skilled developer and understand how to configure cron jobs."},
    {role: "user", content: `[no prose]\nTranslate this text into a cron expression:\n\n${cronText}.`},
    {role: "user", content: `Output the result as a JSON object with 2 properties:\n"cron" with the resulting expression\n"error" with the error message if any, including any ambiguous results.`},
    {role: "user", content: `If you are unable to create a straightforward result, return "error": "Text cannot be turned into a cron expression"`},
    {role: "user", content: `Only return JSON outputs`}
  ], (e, r) => {
    if(e) return done("Error parsing cron text");
    try{
      const output = JSON.parse(r);
      output.cronText = cronText;
      return done(null, output);
    } catch(e){
      return done(null, {
                          error:"Error parsing result. Likely there's no cron expression for that prompt. Try again!",
                          cronText: cronText
                        });
    }
  });
};
```

> The `callOpenAIPrompt` is a very simple wrapper around the standard `OpenAI` module.

The `[no prose]` and my (insistent) pleads for "just JSON" are not always honored by OpenAI, that's the reason I ended up wrapping the `JSON.parse` with a `try/catch`. Every once in a while OpenAI will respond with a **Sure! I can generate JSON for a cron expression...**. Very polite, but not helpful.

GenAI makes English (or any human language) the universal Domain Specific Language.

