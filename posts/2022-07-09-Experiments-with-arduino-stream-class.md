---
layout: post
title:  "Experiments with Arduino Stream class"
date:   2022-07-09
categories: arduino
comments: true
author: Eugenio Pace
---

In my Arduino projects a lot of the ends up being string manipulation. A good example is constructing the response objects for a REST API. This ends up being a bunch of concatenations, `sprintf`, etc.

The naive/straightforward approach, is to hold a few buffers, print on them, then potentially concatenate the partial results.

Consider the response to the "run command" message:

1. The server stores a `command` to be run by the device. This is a JSON object with more or less this shape:

```js
{
  cmd: "clock synch",
  id: "1234567890"
}
```

2. The JSON object goes to a queue.
3. The device picks the message from the queue and runs the command.
4. The device sends back the response to the server. The response is something like this:

```js
{
  id: '123456790',
  response: {
    encoded: true|false,
    text: "clock synched"
  }
}
```

In the example above the `id` is used for correlation, and the `response` section is the actual result of the command. Because the result can contain characters that need to be encoded (e.g. `"` or `>`), the property `encoded` is used to signal whether `text` is (url-encoded) or not.

To build the `response` we need to assemble all parts, including running the command and URL-encoding it. In my first attempt this was just a bunch of buffers and a combination of `sprintf`, and `strncat`. 

Not terrible, but I wanted to try a different approach, hopefully simpler. Also, I tend to favor single, large, multi-use buffers. After some experiments, I ended up with this approach using 2 classes:

1. A `Stream` derived class that writes on a buffer.
2. A second `Stream` class that acts as a filter of the first `Stream`. In this case, the filter is url-encoding the results.

So, usage looks like this:

```c++

char buffer[MAX_BUFFER];

FixedSizeCharStream out(buffer, sizeof(buffer));

//Header of the response
out.print("{"\"id\":\"");
out.print(id);
out.print("\",\"response\":{\"encoded\":true,\"text\":\"");

urlEncodedFilter result(&out);


//Run something that writes on `result`

  result.print("here is something that goes into the {response.text}");

// 

//Close JSON and send
out.print("\"}}");
out.end();
```


`FixedSizeCharStream` simply wraps a `char buffer[]`. `urlEncodedFilter` writes on the same Stream (and consequently the underlying `buffer`) but as it writes to it, it encodes the characters that go through it. (thus the "filter" name)

On the wire the object looks:

```js
{"id":"1234567890","response":{"encoded":true,"text":"here%20is%20something%20that%20goes%20into%20the%20%7Bresponse.text%7D"}}
```

The implementation is straight forward:

```c++
class FixedSizeCharStream : public Stream {
  
  char * s;
  int w_position;
  int r_position;
  int max;
  int truncated = 0;  //Signals that we ran out of space attempting to write
  
public:

    //The underlying buffer
    FixedSizeCharStream(char * s, int max) : w_position(0), r_position(0) {
      this->s = s;
      this->max = max;
    }

    int isTruncated(){
      return truncated;
    }

    // Stream methods
    virtual int available(){ 
      return w_position - r_position;
    }
    
    virtual int read(){
      if(r_position == w_position) return -1;   //No data
      return s[r_position++];
    }
    
    virtual int peek(){ 
      if(r_position == w_position) return -1;   //No data
      return s[r_position];
    }
    
    virtual void flush() { 
      r_position=0; w_position = 0; 
    }
    
    // Print methods
    virtual size_t write(uint8_t c){

      if(w_position==max-1){
        truncated = 1;
        return -1;
      }

      s[w_position++] = (char) c;
      
      return 1; 
    }

    virtual void end(){
      s[w_position] = '\0';
    }
};
```

and the filter:


```c++
class urlEncodeFilter : public Stream {

 const char * hex = "0123456789abcdef";
 Stream * s;
 
 public:
    urlEncodeFilter(Stream * s) {
      this->s = s;
    }

    //Decode
    virtual int read(){ 
      int c = s->read();
      if(c == '%'){
        char code[3] = { s->read(), s->read(), 0 };
        return strtol(code, NULL, 16);
      } else {
        return c;
      }
    }
    
    //Encode
    virtual size_t write(uint8_t c){
      if (('a' <= c && c <= 'z')
        || ('A' <= c && c <= 'Z')
        || ('0' <= c && c <= '9')) {
       return s->write(c);
      } else {
        if( s->write('%') == -1 ) return -1;
        if( s->write(hex[c >> 4]) == -1) return -1;
        return s->write(hex[c & 15]);
      }   
    };    

    // Stream methods (pass-thru to the referenced Stream)
    virtual int available(){ 
      return s->available(); 
    }

    virtual int peek(){ 
      return s->peek(); 
    }
    
    virtual void flush() { s-> flush(); };
};
```

And of course, this means I can use these with anything that is designed to work with `Streams`.