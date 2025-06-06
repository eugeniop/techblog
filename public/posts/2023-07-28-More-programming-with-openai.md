---
layout: post
title:  "More Programming with OpenAI"
date:   2023-07-28
categories: openai lego
comments: true
author: Eugenio Pace
---

My son loves puzzles and Legos. He recently completed one Lego set that kind of combines both:

![](/media/ironman-lego.jpg)

I went to the [Seattle Art Fair](https://seattleartfair.com) this week and was surprised to see may pieces of art based on similar concepts of mosaics/tessellations (often of unusual material).

I wondered how difficult it'd be to create a program to take a picture and output a mosaic.

I know little of image processing, so I turned to my newfound programming assistant, ChatGPT.

ChatGPT didn't get it 100% right on the first attempt, but it was close. In the process I learnt about libraries like `sharp` and `get-pixels`.

A few tweaks here and there, and I was ready for the first trial. 

I added code to generate instructions: 

```
Row 1: 20 empty, 25 orange, 3 empty
Row 2: 21 empty, 23 orange, 4 empty
Row 3: 26 empty, 1 orange, 1 empty, 7 orange, 2 empty, 3 orange, 1 empty, 3 orange, 4 empty
...
```

Gave it to my son and waited for about 30 min (he is fast). And voilà:

![](/media/kate-lego.jpg)

Not bad for a machine and a human code editor.

I need to polish the app a little bit, depending on the image, the resulting mosaic is not recognizable, and cropping would likely work better than a direct resize to 48x48 cells (what I am doing now).

Here's a better algorithm that produces a 48x48 mosaic with 16 levels of gray scale:

![](/media/kate2-lego.jpg)

Even the 8 levels looks pretty good:

![](/media/kate3-lego.jpg)
