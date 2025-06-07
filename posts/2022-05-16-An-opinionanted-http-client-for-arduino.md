---
layout: post
title:  "An opinionated HTTP Client for Arduino"
date:   2022-05-16
categories: arduino
comments: true
author: Eugenio Pace
---

There are a few HTTP libraries available for the Arduino platform. I decided against using any of them because:

1. Some looked overly complicated, and I didn't need all the functionality.
2. Others, _lacked_ some features or required some workarounds.
3. Probably the most important reason, I wanted to *learn*. And nothing better for this than actually implmenting it myself, and adding features as I go. 
4. It is also fun!

A production system would likely benefit from a professional library, so go ahead and do your homework.

## Some design constraints

In my app, memory is a constraint. The board I am using is quite generous, but we are talking about KBs not GBs, so it is important to be careful.

In my app, things happen one at a time. There's no "OS", no concurrency, no re-entrant code (for the most part). Which allows me reasonably and safely _reuse_ blocks of memory. An obvious example is a buffer for a `request` and a buffer for a `response`. I can simply have one.

Because memory fragmentation can be an issue too, I tend to favor static buffers of pre-defined sizes, designed for the expected use, and some code protections in case something goes wild. That's why most of my functions will take a `size_t` parameter everytime I am dealing with buffers. I can check how far I am going (e.g. copying or moving data). Also, minimal dynamic allocations. Last, but not least, I tend to stay away from using `String`. Here's [an excellent article](https://hackingmajenkoblog.wordpress.com/2016/02/04/the-evils-of-arduino-strings/) on the issues with this class.

## The original library 

My orginal library only implemented `GET` and only managed basic responses:

* No chunked responses
* No file downloads

Over time, I added support for all that. Let's start with the simple `HTTPResponse` class:

```c++
#include "Logger.h"

class HTTPResponse {

  public:
    int statusCode;                 
    unsigned int length;            //Length in data    
    int chunked;                    //The Response is chunked
    int file;                       //The Response is  file
    char fileName[14];              //Used for downloads 8.3 filenames supported
    char data[MAX_HTTP_RESPONSE];
    
    ~HTTPResponse(){
      reset();
    };

    void reset(){
      file = 0;
      chunked = 0;
      statusCode = 0;
      length = 0;
      data[0] ='\0';
      fileName[0] = '\0';
    }

    void print(){
      debug.log("HTTP Res", "Status: ", statusCode);
      debug.log("HTTP Res", chunked ? "Chunked" : "Not Chunked");
      if(file){
        debug.log("HTTP Res", "File Downloaded: ", fileName);
      }
      if(length > 0){
        debug.log("HTTP Res", "Content-Length: ", length);
        debug.logHex("HTTP Res", "Data", data, length);
      } else {
        debug.log("HTTP Res", "No content");
      }
    };
};
```

Notice this one is primarily a bunch of status, flags and more importantly data.

The more interesting class is `HTTPRequest`:


```c++
class HTTPRequest {
  
    WiFiSSLClient client;
    HTTPResponse response;
    static void (*keepAlive)();
    
    typedef enum { HEADERS, BODY } HTTP_RX_STATE;

    void parseHeader(char * line){

      //Status line
      if(strncmp(line, "HTTP/1.1", 8)==0){
        //Parse status code like: 
        //"HTTP-Version SP Status-Code SP Reason-Phrase CRLF" e.g. "HTTP/1.1 200 OK\r\n"
        char * s = strchr((char *)line, ' ');
        s++;
        response.statusCode =  (*s++ - '0')*100;
        response.statusCode += (*s++ - '0')*10;
        response.statusCode += (*s++ - '0');
        return;
      }

      /*
        For downloads, header would be: 
        "Content-Disposition: attachment; filename="filename.jpg"
         1234567890123456789012345678901234567890123
      */ 
      if(strncmp(line, "Content-Disposition", 19)==0){
        strtok(line, "\""); //Find filename
        const char * fileName = strtok(NULL, "\"");
        debug.log("HTTP", "File download: ", fileName);
        strcpy(response.fileName, fileName);
        response.file = 1;  //Signal this is a file download
        return; 
      }
      
      /*
        Check if length is known
      */
      if(strncmp(line, "Content-Length", 14)==0){
        char * l = strchr((char *)line, ' ');
        response.length = atoi(l);
        debug.log("HTTP", "Response length: ", response.length);
        return;
      }

      //In some cases, payload might come "chunked"
      if(strncmp(line, "Transfer-Encoding: chunked", 26)==0){
        debug.log("HTTP", "Response chunked");
        response.chunked = 1;
        return;
      }
    }

    /* 
      When dealing with a file download, we rely on an SD card
    */
    HTTPResponse * processFileDownload(){
      // For files, the following 2 attributes indicate:
      // response.length contains the size of the file
      // this->fileName is the name of the file

      if(!SD.begin(SD_CS)){
        errorLog.log("HTTP", "SD card initialization failed.");
        return NULL;
      }

      File file = SD.open(response.fileName, O_RDWR | O_CREAT); 
                  //FILE_WRITE includes the O_APPEND flag which prevents seek to work.
      file.seek(0); // Write from the beginning, in case the file exists, we just overwrite

      int bytesWritten = 0;
      int bytesReady = 0;
      while((bytesReady = client.available())){
        (*keepAlive)();
        debug.log("HTTP", "Bytes available: ", bytesReady);
        int r = client.readBytes(response.data, sizeof(response.data));
        file.write(response.data, r);
        bytesWritten += r;
        if(bytesWritten % 100 == 0){
          debug.log("HTTP", "Written ", bytesWritten);
        }
      }

      file.close();
      client.stop();
      
      //Check that all bytes of the file were read and written to the SD card
      if(bytesWritten == response.length){
        debug.log("HTTP", "File downloaded");
        return &response;
      }

      errorLog.log("HTTP", "Download incomplete: ", bytesWritten);
      return NULL;
    }

    HTTPResponse * processChunkedResponse(){
      int i = 0;
      while(client.available()){
        (*keepAlive)();
        static char length[10]; // This stores just the chunk length
        unsigned int chunkLength = 0;
        length[ client.readBytesUntil('\r', length, sizeof(length)) ] = '\0'; //Read length
        client.read(); //Discard '\n'

        sscanf(length, "%x", &chunkLength); //Somewhat heavy, but hey...
        debug.log("HTTP", "Chunk length: ", chunkLength); 

        if(chunkLength > sizeof(response.data) - i){
          errorLog.log("HTTP", "Not enough memory for chunked response body. Max: ", (int)sizeof(response.data));
          response.reset();
          return NULL;
        }

        client.readBytes(&response.data[i], chunkLength);
        
        client.read();
        client.read(); //Discard '\r\n'

        i = i + chunkLength;
        response.data[i] = '\0';
      }

      client.stop();
      response.length = i;
      debug.logHex("HTTP", "Chunked Response: ", response.data, i);

      return &response;
    }

    /* 
      A very simple state machine to process headers + content
      Either we are reading the HEADERS section or the BODY
    */
    HTTPResponse * processResponse(void (*onHeader)(const char * header)){
      //Resets the response object
      response.reset();
      
      //Small delay to allow the library to catchup (it seems...)
      (*keepAlive)();
      delay(2000);
      (*keepAlive)();
      HTTP_RX_STATE state = HEADERS;
    
      while(client.available()){
        switch(state){
          case HEADERS:
            // Reusing the buffer we already have on the Response object
            response.data[client.readBytesUntil('\n', response.data, sizeof(response.data))] = '\0';
            if(strlen(response.data) == 1){
              //Headers - Body separator
              state = BODY;
            } else {
              parseHeader(response.data);
              if(onHeader){
                //If client requested callbacks for headers, call them. This is primarily used for downloading updates
                (*onHeader)(response.data);  
              }
            }
            (*keepAlive)();
            break;
          case BODY:
            if(response.length == 0 && response.chunked ==0){
              debug.log("HTTP", "No content");
            } else {      
              if(response.file){
                debug.log("HTTP", "Processing file download");
                return processFileDownload();
              }
              
              //Response might be "chunked"
              if(response.chunked){
                debug.log("HTTP", "Processing chunked response");
                return processChunkedResponse();
              }

              //Content-Length is present. This is for relatively small payloads
              if(sizeof(response.data) < response.length + 1){
                errorLog.log("HTTP", "Not enough memory for response body");
                response.length = 0;
              } else {
                debug.log("HTTP", "Reading response body");
                debug.log("HTTP", "Len:", response.length);
                (*keepAlive)();
                client.readBytes(response.data, response.length);
                response.data[response.length] = '\0';
                debug.logHex("HTTP", "Non-chunked Response: ", response.data, response.length);
              }
            }
            client.stop();
            break;
        }
      }
  	  (*keepAlive)();
      return &response;
   }

    int ConnectServer(const char * server, int port){
      
    if(!keepAlive){
      debug.log("HTTP", "No keepAlive");
    }

    int status = WiFi_Connect(keepAlive);
    
	    if(status == WL_CONNECTED){
	      //Connected to WiFi - connect to server
	      int retries = 3;
	      while(retries--){
	        (*keepAlive)();
	        debug.log("HTTP", "Connecting to server: ", server);

	        //Watchdog.disable();
	          auto r = client.connect(server, port);
	        //Watchdog.enable(WDT_TIMEOUT);

	        if(r)
	        {
	          debug.log("HTTP", "Connected to server: ", server);
	          return WL_CONNECTED;
	        }
	        
	        metrics.HTTPConSerErr++;
	        debug.log("HTTP", "HTTP. Connection to server failed: ", server);
	        debug.log("HTTP", "Trying again...");
	        (*keepAlive)();
	        delay(2000); // Magic delay
	      }
	    }

    	client.stop();
    	WiFi_Close(keepAlive);

    	return WL_CONNECT_FAILED;
    }

    void sendHTTPHeaders(Stream & s, const char * verb, const char * route, const char * server, const char * access_token, const char * contentType, int length){
      (*keepAlive)();
      s_printf(&s, "%s %s HTTP/1.1\r\n", verb, route);
      s_printf(&s, "Host: %s\r\n", server);
      
      if(access_token && strlen(access_token) > 0){
        s.print("Authorization: Bearer ");  //s_printf has a limited buffer. Tokens can be long
        s.println(access_token);          
      }
      if(contentType && strlen(contentType)>0){
        s_printf(&s, "Content-Type: %s\r\n", contentType);
      }
      if(length>0){
        s_printf(&s, "Content-Length: %d\r\n", length);
      }
      s_printf(&s, "Connection: close:\r\n\r\n");
      (*keepAlive)();
    }

    HTTPResponse * post(const char * server, const char * route, int port, const char * contentType, const char * access_token, void (*onHeader)(const char *)){
      if(ConnectServer(server, port) != WL_CONNECTED){
        return NULL;
      }
      sendHTTPHeaders(client, "POST", route, server, access_token, contentType, strlen(response.data));
      debug.logHex("HTTP", "POST", response.data, sizeof(response.data));
      client.print(response.data);  //Notice the "SEND" buffer is the response too.
      return processResponse(onHeader); 
    }
    
  public:
    HTTPRequest(){
    }

    void init(void (*keepAliveCB)()){
      keepAlive = keepAliveCB;
      if(!keepAlive){
        errorLog.log("HTTP", "No KeepAlive callback. (Should not happen)"); 
      }
    }

    char * dataBuffer(){
      return response.data;
    }

    //POSTs a form to server
    HTTPResponse * postForm(const char * server, const char * route, int port, const char * access_token, void (*onHeader)(const char *)){
      return post(server, route, port, "application/x-www-form-urlencoded", access_token, onHeader);
    }
   
    HTTPResponse * postJSON(const char * server, const char * route, int port, const char * access_token, void (*onHeader)(const char *)){
      return post(server, route, port, "application/json", access_token, onHeader);
    }
   
    HTTPResponse * postText(const char * server, const char * route, int port, const char * access_token, void (*onHeader)(const char *)){
      return post(server, route, port, "text/plain", access_token, onHeader);
    }

    HTTPResponse * get(const char * server, const char * route, int port, const char * access_token, void (*onHeader)(const char *)){
      
      if(ConnectServer(server, port) != WL_CONNECTED){
        return NULL;
      }
      sendHTTPHeaders(client, "GET", route, server, access_token, "", 0);
      debug.log("HTTP", "GET. Request sent");
      debug.log("HTTP", "Server:", server);
      debug.log("HTTP", "Route:", route);
      return processResponse(onHeader);
    }

    HTTPResponse * postJSON(const char * server, const char * route, int port, const char * access_token, JsonDocument * doc, void (*onHeader)(const char *)){
      if(ConnectServer(server, port) != WL_CONNECTED){
        return NULL;
      }
      
      sendHTTPHeaders(s, "POST", route, server, access_token, "application/json", measureJson(*doc));
      serializeJson(*doc, s);
      return processResponse(onHeader);
    }

    Stream * postStreamedContent(const char * server, const char * route, int port, const char * contentType, const char * accessToken, int contentLength){
      if(ConnectServer(server, port) != WL_CONNECTED){
        return NULL;
      }

      sendHTTPHeaders(client, "POST", route, server, accessToken, contentType, contentLength);
      
      return &client;
    }

    HTTPResponse * closeStreamedContent(void (*onHeader)(const char *)){
      return processResponse(onHeader);
    }
};

void (*HTTPRequest::keepAlive)();
```

## Implementation notes

* The `keepAlive` static member is a callback to kick the `Watchdog timer`. Every time we do something that might take time, we call this. It doesn't work all the time. The board still resets every once in a while, and as far as I can tell it is always related to network operations. I am not sure. Anyway, kicking the WDT often helps.

* The `onHeader` callback allows any client of the library to parse any header. I use this only to parse the version of a downloaded update for OTA. The header `"X-FirmwareVersion": 2.0.1` for example. It is only used for notifications and status report.

* `postStreamedContent` allows me to send contents to the network directly. Useful for example when I need to upload a larger JSON I don't know the size of in advance. Here's the technique I use:

  * First I save the JSON to a file (all my boards always have an SD Card)
  * I get the size using filesystem functions
  * I open the stream and the serialize the JSON straight to it directly

This works great and saves memory. The `ArduinoJson` library supports this directly (serializing to streams so _"it just works"_(c))

* All the `debug.log` and `error.log` you see all over the code is a very simple class that writes to the terminal. Nothing fancy.

* There are various `WiFi_SOMETHING` which is also a bunch of boilerplate code for the WiFi functions. I have various projects on different boards: *Adafruit*, *MKR1000*, etc. Some of these use the `WiFi101` library, others use `WiFiNINA`. The helper library abstracts this for me.

