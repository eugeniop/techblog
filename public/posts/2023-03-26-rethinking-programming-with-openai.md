---
layout: post
title:  "Rethinking programming with OpenAI"
date:   2023-03-26
categories: openai
comments: true
author: Eugenio Pace
---

OpenAI released a new version of their API, which (according to what is advertised) is 90% cheaper, faster, and more efficient. I am all for efficiency so I decided to upgrade my implementation from `text-davinci-003` model to `ChatGPT3.5`

Because the new model is more of a "chat", the API changes a little bit too. My code now looks like this:

```js
exports.editToModernEnglish = (text, done) => {
  const { Configuration, OpenAIApi } = require("openai");

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {role: "system", content: "You are a skilled English editor and have knowledge in classic philosophy."},
      {role: "user",   content: `Rewrite in modern English:\n${text}`}
    ],
  }).then((data) => {
    var output = data.data.choices[0].message.content;
    done(null, output);
  }).catch((error) => { 
    logger.error(error);
    done(error);
  });
};
```

A great side effect of this prompt is that it works _even if the text is in another language_. That got me excited, so I tried adding another instuction for keyword generation:

```js
openai.createChatCompletion({
  model: "gpt-3.5-turbo",
  messages: [
    {role: "system", content: "You are a skilled English editor and have knowledge in classic philosophy."},
    {role: "user",   content: `Rewrite in modern English, and generate a list of up to 3 keywords with the core concepts covered in the quote\n${text}`},
  ],
...
```

This also worked great, and OpenAI returned the edited text and appended a list of keywords as instructed. Most of my tests showed very good results, so I decided to automatically add the keywords to tthe database.

My first instinct was to parse the returned message (e.g. find the _keywords_ word with `indexOf`, etc), and then I realized that I was doing it the wrong way. I could just ask OpenAI to do it for me:

```js
openai.createChatCompletion({
  model: "gpt-3.5-turbo",
  messages: [
    {role: "system", content: "You are a skilled English editor and have knowledge in classic philosophy."},
    {role: "user",   content: `Rewrite in modern English, and generate a list of up to 3 keywords with the core concepts covered in the quote\n${text}`},
    {role: "user",   content: "Output the result as a JSON object with 2 properties: text and keywords"},
  ],
  ...
};
```

All I need to do now is `JSON.parse` the output and _magic!_. It is a very simple example, but a good one in my opinion of how this tool forces us to think somewhat differently.

On a separate note, I asked OpenAI to generate some JS code to:

1. Browse a web page
2. Save the content as an image

It did 80% of it correctly. The only issue was that it made up a module for image manipulation. When I pointed this out, it apologized and provided an alternative (correct) solution :-)

![](/media/chatgpt-image-module.jpg)


