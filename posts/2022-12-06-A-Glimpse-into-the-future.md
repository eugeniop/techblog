---
layout: post
title:  "A glimpse into the future?"
date:   2022-12-06
categories: openai
comments: true
author: Eugenio Pace
---

My database of quotes is full of colorful English translations. Most of them are very old. Lot's of "thee" and "thou", mixed up with "thy" and "wilst". The quotes might sound more profund perhaps, but... _philosophy is for living, not just for learning..._.

I have an "Edit" function in all my apps, so every time I see something that is really difficult to parse, I take the time to re-write it in (my) simpler English. 

Here's a goode example:

> Consider the whole universe whereof thou art but a very little part, and the whole age of the world together, whereof but a short and very momentary portion is allotted unto thee, and all the fates and destinies together, of which how much is it that comes to thy part and share.

Today I decided to give the OpenAI API a try, and have it suggest a rewrite before I get a chance to edit it myself. And voilà! It is absolutely magic. I've been testing it for a few days, on various texts, and every time I find myself just accepting the suggestion.

The best? it's just so simple:

```js
exports.editTextToModernEnglish = (text, done) => {
  const { Configuration, OpenAIApi } = require("openai");

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const openai = new OpenAIApi(configuration);

  openai.createCompletion({
    model: "text-davinci-003",
    prompt: "Simplify text, rewrite in modern English\n" + text,
    temperature: 0.7,
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  }).then((data) => {
    //log(JSON.stringify(data.data, null, 2));
    done(null, data.data.choices[0].text.trim());
  }).catch((error) => { 
    log(error); 
    done(error);
  });
}
```

I have NO knowledge of [LLMs](https://en.wikipedia.org/wiki/Wikipedia:Large_language_models) or even OpenAI parameters. I just copied the sample from the online docs. The instruction, and as you can see, the instruction is `Simplify text, rewrite in modern English`

Here are a couple of examples:

```sh
Consider the whole universe whereof thou art but a very little part, and the 
whole age of the world together, whereof but a short and very momentary portion 
is allotted unto thee, and all the fates and destinies together, of which how 
much is it that comes to thy part and share.

--->

Suggested simplification:

Think of the universe of which you are only a small part, and the age of the 
world, where you have just a brief moment. All the fates and destinies, how 
much of that is yours?
```

Here's another great example:


```sh
Stir up thy mind, and recall thy wits again from thy natural dreams, and visions,
and when thou art perfectly awoken, and canst perceive that they were butdreams 
that troubled thee, as one newly awakened out of another kind of sleep lookupon 
these worldly things with the same mind as thou didst upon those, that thousawest in 
thy sleep.

--->

Suggested simplification:

Wake up your mind and remember your thoughts from your dreams. Once you are fully 
awake and realize they were only dreams, look at the world around you in the same 
way you viewed your dream.
```

Pretty amazing if you ask me!

Verily, I doth know that this be a trifling example; yet, it demonstrateth two things together: the serviceableness and the ease of use. What that be simple to use and of help is oft meant to be a great changer for the better!

In other words (mine):

I know this is a super simple example, but it shows two simultaneous things: utility, and ease of use. Something easy to use and useful is meant to become a great force of change, for good!




