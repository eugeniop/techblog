---
layout: post
title:  "Calling Secure APIs From Arduino - Part II"
date:   2019-05-25
categories: api deviceflow
comments: true
author: Eugenio Pace
---

In [the previous post](/post/2019-04-14-calling-secure-apis-from-arduino-part-i.markdown), I covered the printer. In this post, I focus on the API.

### The Architecture

The user sends quotes to a queue. The printer polls for available new quotes every 10 seconds. If a quote is available in the queue, it prints it. If no quote is available, it just sleeps for another 10 seconds.

### Adding quotes to the printer queue

Since I'm hooking this to my existing [quote app](/post/2017-07-15-using-twilio-and-webtask-to-become-a-better-stoic.markdown), I just added a new command:

```json
{
  "name": "Print",
  "help": "p. Sends a quote to the configured subscriber printer.",
  "verbs": ["p", "prn", "print"],
  "requiresSubscription": true,
  "admin": false,
  "handler": (done) => {
      print(locals.subscriber, done);
  },
}
```

The actual handler:

```js
/*
  Puts a quote in the printing queue for the subscriber (if they have a printer).
*/
function print(subscriber, done){
  if(!subscriber) { 
    return done(null, "Print. Please subscribe before running this command."); 
  }

  domain.putQuoteInPrinterQueue(subscriber, subscriber.lastQuoteId, (error, msg)=>{
    if(error) { 
      return done("Print. Error while sending quote to printer. Please retry."); 
    }
    done(null, "Your quote will print soon!");
  });
}
```


```js
/*
  Print sends quote to a queue for the user.
*/
domain.putQuoteInPrinterQueue = (phone, quoteId, done) => {
  connectDb((err, client) => {
    if(err) return done(err, "System error. Please try sometime else");
      const queue_name = "Printer-" + phone.replace('+');
      const queue = mongoDbQueue(client.db(), queue_name);
      queue.add(quoteId, (q_err, msg_id) =>{
        if(q_err){
          return done(q_err, "Couldn't add quote to printing queue.");
        }
        return done(null,"Quote added to subscriber printing queue.");
      });
  });  
}
```

I am using the `mongodbqueue` module, which is straightforward to use. Some notes on the implementation:

1. I am merely storing the quote `id` as opposed to the entire quote.
2. There's a queue per subscriber, with a naming convention `Printer-{phone}`. 

A MongoDb collection behind the scenes provides storage for every queue.  `mongodbqueue` takes care of the details.

### Printing quotes

The printer polls the API for a new quote on a single protected endpoint every 10 seconds:

```sh
GET /printer
Authorization: Bearer {ACCESS_TOKEN}
```

This request can return:

1. `200` and a quote in the body
2. `404` if no quote is available
3. `409` if there are too many requests
3. `500` if something wrong happens


```js
/*
  Retrieves messages from the printer queue
  returns 404 if no quotes are available
*/
server.get('/printer', [limiter, read], (req, res, next) => {
  
  var phone = getPhone();

  domain.getQuoteFromPrinterQueue(phone, (error, quote) => {
    if(error){
      return next(boom.serverUnavailable("Error retrieving quote from queue", err)); 
    }
    if(!quote){
      return next(boom.notFound());
    }
    return res.json({
      quote: quote.quote,
      author: quote.author
    });
  });
});
```

There are two middlewares on this route:

```js
var read = jwtAuthz(["read:quotes"],{ failWithError: true });

const rateLimit = require("express-rate-limit");
  
const limiter = rateLimit({
  windowMs: 1 * 30 * 1000,
  max: 20 // limit each IP to 100 requests per windowMs
});
```

Rate limiter is meant to protect against runaway printers polling the endpoint like crazy. The `read` middleware checks that the there's the appropriate scope.

The `access_token` also contains the `phone` claim, used to identify the user's print queue.

Finally,  `getQuoteFromPrinterQueue`, the function that does all the work:

```js
domain.getQuoteFromPrinterQueue = (phone, done) => {
  connectDb((err, client) => {
    if(err) return done(err, "System error. Please try sometime else");
      const queue_name = "Printer-" + phone.replace('+');
      const queue = mongoDbQueue(client.db(), queue_name);

      queue.get((q_err, msg) =>{
        if(q_err){
          return done(q_err, "Couldn't get quote from printing queue.");
        }

        //No message
        if(!msg){
          return done(null, null);
        }
        
        domain.getQuotes({_id: new ObjectID(msg.payload)}, null, 0, (e, quotes) =>{
          if(e || !quotes || quotes.length === 0){ 
            return done(e, 'Get Print Queue. Quote not found'); 
          }

          //Before returning, we delete message from queue
          //If there's an error, we just ignore.
          queue.ack(msg.ack, (err, id) => {
            if(err){
              console.log("Error ACK'ing msg from queue");
            }
            return done(null, quotes[0]);
          });
        });
      });
  });  
}
```

> As you might have noticed, there're not many provisions for retries or anything. 

### Sequence of Events

```mermaid
sequenceDiagram
Phone->>Twilio: print
Twilio->>API: /print
API->>DB: getLastQuote()
DB->>API: {id: 123, text: "what stands in the way, becomes the way"}
API->>Queue: {QuoteId}
Queue->>API: ack
API->>Twilio: {"Your quote is ready to print"}
Twilio->>Phone: SMS: "Your quote is ready to print"

loop Every 10 seconds
alt quote available
 Printer->>API: getQuote()
 API->>Queue: GetQuote(phone)
 Queue->>API: {id}
 API->>+DB: getQuote(id)
 DB->>API: { the quote }
 API->>Printer: {text: "what stands in the way, becomes the way"}
 Note right of Printer: Quote is printed
end
alt no quote
 Printer->>API: getQuote()
 API->>Queue: GetQuote(phone)
 Queue->>API: NULL
 API->>Printer: 404
 Printer->>Printer: sleep(10secs)
end
end
```