---
layout: post
title:  "Pixelator co-written with OpenAI - Part I"
date:   2023-08-14
categories: openai lego
comments: true
author: Eugenio Pace
---

I continued to experiment with ChatGPT and [my mosaic generator project](/post/2023-07-28-More-programming-with-openai.md) (a.k.a. Pixelator).

I ended up fine tuning the algorithm (with ChatGPT's help) and incorporated the ability to create mosaics using various palettes.

Searching around, I found an RGB table for all colors in Lego pieces. It occurred to me that I could generalize this, and create tables for different materials.

Searching more, I found the RGB codes for [Crayola](http://www.jennyscrayoncollection.com/2017/10/complete-list-of-current-crayola-crayon.html) and for [Prisma pencils](http://www.jennyscrayoncollection.com/2020/04/complete-list-of-prismacolor-premier.html). Both from Jenny's awesome website.

These became 2 data structures like this:

```js
{
    "color_list": [
		{ "color": "Red", "hex":"#ED0A3F"},
		{ "color": "Maroon", "hex":"#C32148"},
		{ "color": "Scarlet", "hex":"#FD0E35"},
		{ "color": "Brick Red", "hex":"#C62D42"},
		{ "color": "English Vermilion", "hex":"#CC474B"}
	]
}
```

```js
{
    "color_list": [
		{ "color": "10 % Cool Grey", "hex": "E6E8E8" },
		{ "color": "10 % French Grey", "hex": "E9E7DD" },
		{ "color": "10 % Warm Grey", "hex": "EAE8EA" },
		{ "color": "20 % Cool Grey", "hex": "D9DDE2" },
		{ "color": "20 % French Grey", "hex": "D4D3C9" }
	]
}
```

These files I can directly `require` into my project. I also asked ChatGPT to create a 16 gray scale, using the same data structure. This, we can compute. ChatGPT wrote it promptly:

```js
grayscale_colors.color_list = Array.from({ length: 16 }, (_, i) => {
    const value = Math.floor((i / 15) * 255);
    const hex = value.toString(16).padStart(2, '0');
    return {
        color: `gray_${hex}`,
        hex: `#${hex}${hex}${hex}`
    };
});
```

I am quite happy with the results, and I will call this MVP "done" for the time being. Below is (from left to right):

* The original
* 48x48 Crayola tiles
* 48x48 Gray scale tiles

![](/media/ep-lego.jpg)

## Using the module

The main function is:

```js
exports.processImageToGrid = (image, type, palette, gridWidth, gridHeight) => {
	...
}
```

`image` is the image, `type` is the `content-type` (e.g. `image/jpg`, etc). 

`palette` can be: `lego`, `crayola`, `grayscale` or `prisma`. If left undefined, the default is `lego`.

`gridWidth` and `gridHeight` specify the shape of the mosaic.

`processImageToGrid` returns a `Promise`. If it resolves successfully, the result is:

```js
{
    inventory: [],      // Distribution of colors
    image: base64buffer,// Processed image data
    instructions: [],   // Instructions for building
    imageRaw: [],       // Raw image data (array of numbers representing RGB)
}
```

`inventory` is an array of objects that summarizes all pieces of each color needed.

```js
[
{
    color: 'Dark Purple'
    count: 345
},
{
    color: 'Sky Blue Light'
    count: 12
}
...
]
```

`image` is the resulting image, `base64` encoded and ready to insert into an `<img>` tag as an embedded `src`.

`imageRaw` is the resulting mosaic as a RGB array.

`instructions` is an array of summarized sequence to draw/build each row.

It will be something like:

```js
[
  [
    { color: 'Two-tone Silver', hex: '737271', count: 90 },
    { color: 'Flat Silver', hex: '898788', count: 35 },
    { color: 'Glow In Dark Trans', hex: 'BDC6AD', count: 44 },
    { color: 'Pearl Very Light Gray', hex: 'ABADAC', count: 30 },
    { color: 'Modulex Terracotta', hex: '5C5030', count: 63 }
  		...
  ],
  [
    { color: 'Dark Gray', hex: '6D6E5C', count: 1 },
    { color: 'Dark Tan', hex: '958A73', count: 1 },
    { color: 'Glow In Dark Trans', hex: 'BDC6AD', count: 3 },
    { color: 'Dark Tan', hex: '958A73', count: 1 },
    { color: 'Pearl Titanium', hex: '3E3C39', count: 1 },
    { color: 'Dark Tan', hex: '958A73', count: 1 },
    { color: 'Pearl Very Light Gray', hex: 'ABADAC', count: 1 }
	  	...
  ]
]
```

`instructions.length` will equal the `gridHeight` parameter. The *sum* of all counts on all the objects of a row will equal the `gridWidth`.

With this function, it is easy to capture a file, pass parameters and then render the result. In my case, I am using a very simple HTML form (omitting details like security, etc):

```html
<form action="/pixelate/upload" method="post" enctype="multipart/form-data">
  <label for="image">Upload an image:</label>
  <input type="file" name="image" accept="image/*" required>
  <br/>
  <label for="cells">Cells</label>
  <input type="text" name="cells" required value="48">
  <br/>  
  <label for="model">Choose a target palette:</label>
  <select name="model" id="palette">
    <option value="grayscale">Grayscale</option>
    <option value="lego">Lego Colors</option>
    <option value="crayola">Crayola Colors</option>
    <option value="prisma">Prisma 150 Colors</option>
  </select>
  <br/>
  <button type="submit">Submit</button>
</form>
```

The POST route in Express to handle the form submission:

```js
server.post('/upload', (req, res) => {
  const form = new multiparty.Form();
  let options = {};

  form.on('field', (name, value) => {
    options[name] = value;
  });

  let chunks = [];
  form.on('part', (part) => {
        if(!part.filename) {
            return;
        }

        part.on('data', (chunk) => {
            chunks.push(chunk);
        });

        part.on('end', () => {
          options.contentType = part.headers['content-type'];
        });
  });

  form.on('close', () => {
    const cells = Number(options.cells) || 48;
    const buffer = Buffer.concat(chunks);
    pixelate.processImageToGrid(buffer, options.contentType, options.model, cells, cells)
      .then((result) => {
        result.cells = cells;
        res.render('output', result);
      })
      .catch((err) => {
          res.status(500).send("Error processing image.");
          return;
      });
  });

  form.parse(req);
});
```

> I should perhaps remind you, dear reader, that 90% of this code was generated by ChatGPT after precise instructions from me!

My next post will cover the algorithm itself.


