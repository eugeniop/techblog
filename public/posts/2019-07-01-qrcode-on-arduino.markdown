---
layout: post
title:  "QRCode on Arduino"
date:   2019-07-01
categories: qrcode arduino
comments: true
author: Eugenio Pace
---

For [the e-Paper project I worked before](/post/2019-06-21-experiments-with-e-paper-displays.markdown) I had to generate a QR code. The QR code encodes the login URL. The idea is that you point a phone's camera to it. Modern phones are configured to scan QRCodes automagically with their cameras and prompt the user to open a URL (the login URL in my case). Pretty convenient.

I knew very little about QR codes before this project, so I started studying a little bit about it (a.k.a. googling), and more explicitly, learning more about how to generate them on an Arduino board.

### Attempt 1 - Server Side code generation

Very easily, I found a few libraries for `node`, my _de facto_ platform to experiment. This handler with `express` creates a QR code with whatever you send on a `data` query parameter:

```js

const qrc = require('qrcode');

server.get('/', (req, res, next) => {
  if(!req.query.data){
    return next(boom.badRequest(err));
  }
  qrc.toDataURL(req.query.data, (err, url) => {
    return res.render('../apps/qrcode/views/qrcode', {dataUrl: url});
  });
});
```

The view:

```html
<!DOCTYPE html/>
<html>
  <head>
    <title>qrcode</title>
  </head>
  <body>
    <img src='<%=dataUrl%>'/>
  </body>
</html>
```

This generates an small HTML page with an embedded/encoded image:

```
<!DOCTYPE html/>
<html>
  <head>
    <title>qrcode</title>
  </head>
  <body>
    <img src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAYAAABUmhYnAAAAAklEQVR4AewaftIAAAK6SURBVO3BQQ7bWAwFwX6E7n/lHi+5+oAg2ckwrIofrDGKNUqxRinWKMUapVijFGuUYo1SrFGKNUqxRinWKMUapVijFGuUYo1y8VASfknliSScqHRJ+CWVJ4o1SrFGKdYoFy9TeVMS7khCp3KicofKm5LwpmKNUqxRijXKxZcl4Q6VO5Jwh0qXhE7ljiTcofJNxRqlWKMUa5SLYVT+ZcUapVijFGuUYo1SrFGKNUqxRrn4MpVfSkKn0iWhU3lC5W9SrFGKNUqxRrl4WRL+JJUuCZ1Kl4RO5SQJf7NijVKsUYo1SvzgfywJd6hMVqxRijVKsUaJHzyQhE6lS8KbVO5IwonKSRLepPJNxRqlWKMUa5T4wQNJeELljiR0Knck4QmVkyR0KidJ6FSeKNYoxRqlWKNc/GFJ6FS6JHQqXRLuUOmS0Kl0SeiS0KnckYRO5U3FGqVYoxRrlPjBi5LQqbwpCX+SykkSTlS6JHQqTxRrlGKNUqxRLh5KQqfSJeFEpUvCicpJEjqVkyR0KidJ6FQ6lZMkdCpvKtYoxRqlWKNcPKRyonKHyh1J6FS6JHQq35SETqVT6ZLQqTxRrFGKNUqxRokfPJCEX1J5IgmdSpeETuUkCScqXRI6lTcVa5RijVKsUS5epvKmJJwk4USlUzlROUnCiUqXhJMkdCpPFGuUYo1SrFEuviwJd6h8UxI6lS4JnUqn0iXhDpVvKtYoxRqlWKNcDKNyRxJOktCpdCpdEjqVXyrWKMUapVijXPxjVLokdCpdErokdCqdyp9UrFGKNUqxRrn4MpVvUumS8EQSTlROktCp/FKxRinWKMUa5eJlSfilJNyh0iWhUzlJQqfSqXRJOFF5U7FGKdYoxRolfrDGKNYoxRqlWKMUa5RijVKsUYo1SrFGKdYoxRqlWKMUa5RijVKsUYo1yn80PiTPpw0hKQAAAABJRU5ErkJggg=='/>
  </body>
</html>
```
My first thought was to do precisely this:

1. Have the Arduino board send a request to an endpoint (using the login URL as the parameter).
2. Download the bitmap.
3. Send the bitmap to the display.

I assumed that the display would be able to deal with bitmaps quite easily, and I have the components I needed: an HTTP request/response module, code for the QR code, among others.

However, I wasn't super happy with having another network call for this.

### Attempt 2 - Stand alone solution

Searching a little bit more, I found [this other C library](https://github.com/ricmoo/QRCode) designed explicitly for small footprint devices. 

> I have not tested its claims on performance, memory, but it works! Also, it is straightforward to use.

#### Basic usage

```c++
QRCode qrcode;

uint8_t qrcodeData[qrcode_getBufferSize(QRCODE_VERSION)];
qrcode_initText(&qrcode, qrcodeData, QRCODE_VERSION, ECC_LOW, "Some content");

int cell = qrcode_getModule(&qrcode, x, y);
```

#### How it works?

1. Allocate a buffer (based on the `version` of QRCode you want).
2. Call `qrcode_initText` to generate it.
3. The code is essentially a matrix of black/white squares. You can inspect each cell of the matrix with `qrcode_getModule`.

Drawing it on a display (or a printer) is up to the implementer, which is what comes next.

### Choosing the right QRCode version

What's left is printing the matrix on a display. You need to draw *black* or *white* for each cell of the matrix using the `qrcode_getModule`.

The size of the matrix is dependent on two parameters:

1. The amount of information to store.
2. The error correction algorithm (which creates redundancy).

In my application, I need to encode a URL of the form:

```shell
https://{auth0 hosted domain}/activate?user_code=1234-ABCD
```

Auth0 supports [custom domains](https://auth0.com/docs/custom-domains), which means it can be anything, Typically, it takes the form of something like `https://login.myapp.com`. If you don't use [Custom Domains]() then the login URL is  a subdomain of auth0.com: `https://example.auth0.com`.

The full URL will something between 50 and 70 characters and because the integrity if the QRcode is high on this display, we need *Low error correction.* (*LOW_ECC* constant). Based on [this chart](https://github.com/ricmoo/QRCode#data-capacities), the smallest we can go to is a 29x29 QRcode. The 33x33 QRCode in *LOW_ECC* can encode a 114 alphanumeric string, which gives us some leeway, so I decided to use that.

### Drawing the QRCode

The QRCode is _square_, so the constraint on painting it on any display is on the smallest dimension. The e-paper display I am using is 104 x 204 pixels (height x width), so the constraint is on the height (104 pixels).
I wanted to maximize the size, so taking a couple pixels from the borders to add some space for margins I ended up with:

> QRCode square size = Round(( 104 - 2x2 ) / 33) = 3

This means I can draw a single QR code module as a 3x3 pixels square on the display.

In code:

```c++
void PrintQRCode(const char * url){
  QRCode qrcode;

  const int ps = 3; //pixels / square
  
  uint8_t qrcodeData[qrcode_getBufferSize(QRCODE_VERSION)];
  qrcode_initText(&qrcode, qrcodeData, QRCODE_VERSION, ECC_LOW, url);

  epd.clearDisplay();
  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      //If pixel is on, we draw a ps x ps black square
      if(qrcode_getModule(&qrcode, x, y)){
        for(int xi = x*ps + 2; xi < x*ps + ps + 2; xi++){
          for(int yi= y*ps + 2; yi < y*ps + ps + 2; yi++){
            epd.writePixel(xi, yi, EPD_BLACK);
          }
        }
      }
    }
  }
}
```

The end result is a neat QRCode:

![](/media/qrcode_matrix.png)

