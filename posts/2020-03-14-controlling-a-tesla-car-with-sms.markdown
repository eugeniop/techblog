---
layout: post
title: "Controling a Tesla car with SMS"
date:   2020-03-14
categories: tesla nodejs
comments: true
visible: false
author: Eugenio Pace
---

Someone I know got a Tesla some time ago, an amazing car. I can't think of anything geekier. What can be geekier than a car that ships with auto-updates and ... an API! (albeit unofficial, more below).

So naturally, this became a nice weekend project. I wanted to write a little SMS app that could send commands to the car. For example:

```sh
status
```

would return:

```sh
Battery: 56%
Range: 110 miles
Charging port door is OPEN
Currently: CHARGING
Time to fully charge: 4 hs
```

## The API

This [site documents](https://tesla-api.timdorr.com/) all endpoints and available commands. 

> Notice that this is *unofficial*. It is not blessed by Tesla in any way. Use it at your own peril.

It is pretty comprehensive, covering all aspects of the car. You can do *lots* of things: 

1. Retrieving a bunch of information
2. Acting on the car: honk, change temperature, open garage door (if [HomeLink](https://www.homelink.com/home/welcome) is configured), change sentry mode, and on and on.

## Authentication

All endpoints require a bearer token (nice!). To get one, you need to authenticate using the `/token` endpoint which is essentially the [OAuth2 Password Grant](https://tools.ietf.org/html/rfc6749#section-4.3) endpoint. This is not terrible, but not great for my project, because it requires capturing credentials and sending them over the wire. 

> I can understand why Tesla might have chosen this implementation. Their’s is a *closed* API, the *client* being their own application.
It is not great, because you wouldn't want to type username/password on SMS. It would stay there for a long time in cleartext.

I need a mechanism to authenticate securely *outside* SMS, store the Tesla token and then safely retrieve it every time I need to call the API.

I also need a way to associate a *phone* with the specific login. And [Auth0](https://auth0.com) gives me all the building blocks for this:

1. I can create a login that authenticates the user against Tesla and gives me an `access_token`
2. It can store the `access_token` securely
3. It can validate a phone number and associate it with a user
4. It provides an API to tie everything together

### Tesla Login 

Because Tesla uses the `password grant` I created a [custom database connection](https://auth0.com/docs/connections/database/custom-db) with the following script:

```js
function login(email, password, callback) {
  const request = require('request');

  request.post({
    url: 'https://owner-api.teslamotors.com/oauth/token?grant_type=password',
    json: {
    "grant_type": "password",
    "client_id": configuration.CLIENT_ID,
    "client_secret": configuration.CLIENT_SECRET,
    "email": email,
    "password": password
  },
    headers: {
      "User-Agent": "my tesla experiment"
    }
  }, function(err, response, body) {
    if(err) return callback(err);
    if(response.statusCode === 401) return callback();
    const user = body;
    callback(null, {
      user_id: email,
      email: email,
      access_token: user.access_token,
    });
  });
}
```

Returning the `access_token` in the user profile object in the last callback, automatically stores it in Auth0's user store. 

> You need a special scope in the Management API token to be able to retrieve these sensitive attributes: `scope: read:user_idp_tokens`

The first step is done.

### Associating phone with user

The easiest way I've found for this is just turning SMS MFA. This will force an enrollment and a verification of the phone just after login. So we have proof that: (a) the user has access to the phone and (b) was able to login with Tesla.

> Auth0 supports [SMS based MFA](https://auth0.com/docs/multifactor-authentication/factors/sms) ot of the box.

But there's a caveat. Because the user interactions happen exclusively through SMS, the only information we have when a message arrives through Twilio is the phone number. We need a way to find the user with that given phone number (and that is verified). 

Unfortunately, Auth0 doesn't have an API to *search users by MFA enrollment*. But it does have a fairly powerful search on the user profile (including arbitrary information and data structures). 

> User _metadata_ can be added to any user. See [here](https://auth0.com/docs/users/concepts/overview-user-metadata)

The solution is to add the phone number as part of the `app_metadata` object just after login. When we know that (a) the user is authenticated, and (b) the phone has been verified. 

Let's see the 2 big phases for this:

<!--
Browser->Tesla App:/login
Browser<--Tesla App:redirect auth0.com/authorize
Browser->Auth0:/authorize
Browser->Auth0:{username/password}
Auth0->Tesla API:POST /token {username/password}
Tesla API->Auth0:{access_token}
Auth0->Auth0 MFA:send SMS
Browser<--Auth0: MFA Challenge
Auth0 MFA->Phone: {SMS}
Browser->Auth0: Enter code
Auth0->Auth0 MFA: Validate code
Auth0<--Auth0 MFA: Validated
Browser<--Auth0: redirect /callback
Browser->Tesla App: /callback
-->

<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="956" height="819"><defs/><g><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g/><g><rect fill="white" stroke="none" x="0" y="0" width="956" height="819"/></g><g/><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 59.284222437999986 L 54.76552672655859 819.248142118" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 287.4677733479127 59.284222437999986 L 287.4677733479127 819.248142118" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 394.5793626897018 59.284222437999986 L 394.5793626897018 819.248142118" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 671.283074154806 59.284222437999986 L 671.283074154806 819.248142118" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 794.2751185136849 59.284222437999986 L 794.2751185136849 819.248142118" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 907.4998136293998 59.284222437999986 L 907.4998136293998 819.248142118" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/></g><g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 8.795878699999996 11.786477457999997 L 100.73517475311718 11.786477457999997 L 100.73517475311718 59.284222437999986 L 8.795878699999996 59.284222437999986 L 8.795878699999996 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="27.882935478999997" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Browser</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 236.1903250283854 11.786477457999997 L 338.7452216674401 11.786477457999997 L 338.7452216674401 59.284222437999986 L 236.1903250283854 59.284222437999986 L 236.1903250283854 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="255.27738180738538" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Tesla App</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 356.33697906744004 11.786477457999997 L 432.82174631196347 11.786477457999997 L 432.82174631196347 59.284222437999986 L 356.33697906744004 59.284222437999986 L 356.33697906744004 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="375.42403584644006" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Auth0</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 621.233256450513 11.786477457999997 L 721.3328918590989 11.786477457999997 L 721.3328918590989 59.284222437999986 L 621.233256450513 59.284222437999986 L 621.233256450513 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="640.320313229513" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Tesla API</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 738.9246492590989 11.786477457999997 L 849.6255877682709 11.786477457999997 L 849.6255877682709 59.284222437999986 L 738.9246492590989 59.284222437999986 L 738.9246492590989 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="758.011706038099" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Auth0 MFA</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 867.2173451682709 11.786477457999997 L 947.7822820905287 11.786477457999997 L 947.7822820905287 59.284222437999986 L 867.2173451682709 59.284222437999986 L 867.2173451682709 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="886.3044019472709" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Phone</text></g></g><g><g><g><rect fill="white" stroke="none" x="150.9546320327044" y="94.46773723799998" width="40.324036009062496" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="153.59339564270442" y="110.30031889799997" text-anchor="start" dominant-baseline="alphabetic">/login</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 117.33702185799999 L 284.5358137812461 117.33702185799999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(287.4677733479127,117.33702185799999) translate(-287.4677733479127,-117.33702185799999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 272.80797551457937 110.00712294133332 L 287.4677733479127 117.33702185799999 L 272.80797551457937 124.66692077466665 Z"/></g></g><g><g><rect fill="white" stroke="none" x="75.58243964989192" y="143.724657958" width="191.0684207746875" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="78.22120325989192" y="159.557239618" text-anchor="start" dominant-baseline="alphabetic">redirect auth0.com/authorize</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 287.4677733479127 166.593942578 L 57.69748629322525 166.593942578" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(54.76552672655859,166.593942578) translate(-54.76552672655859,-166.593942578)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 69.42532455989192 159.26404366133332 L 54.76552672655859 166.593942578 L 69.42532455989192 173.92384149466668 Z"/></g></g><g><g><rect fill="white" stroke="none" x="189.84328955760284" y="192.98157867799998" width="69.65831030105468" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="192.48205316760286" y="208.814160338" text-anchor="start" dominant-baseline="alphabetic">/authorize</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 215.85086329799998 L 391.64740312303513 215.85086329799998" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(394.5793626897018,215.85086329799998) translate(-394.5793626897018,-215.85086329799998)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 379.9195648563684 208.5209643813333 L 394.5793626897018 215.85086329799998 L 379.9195648563684 223.18076221466666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="151.13535040965363" y="242.23849939799996" width="147.07418859695312" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="153.77411401965364" y="258.07108105799995" text-anchor="start" dominant-baseline="alphabetic">{username/password}</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 265.10778401799996 L 391.64740312303513 265.10778401799996" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(394.5793626897018,265.10778401799996) translate(-394.5793626897018,-265.10778401799996)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 379.9195648563684 257.7778851013333 L 394.5793626897018 265.10778401799996 L 379.9195648563684 272.4376829346666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="415.39627561303513" y="291.49542011799997" width="235.0698856184375" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="418.03503922303514" y="307.328001778" text-anchor="start" dominant-baseline="alphabetic">POST /token {username/password}</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 394.5793626897018 314.36470473799994 L 668.3511145881392 314.36470473799994" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(671.283074154806,314.36470473799994) translate(-671.283074154806,-314.36470473799994)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 656.6232763214726 307.0348058213333 L 671.283074154806 314.36470473799994 L 656.6232763214726 321.6946036546666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="480.5752230617656" y="340.75234083799995" width="104.71199072097656" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="483.2139866717656" y="356.58492249799997" text-anchor="start" dominant-baseline="alphabetic">{access_token}</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 671.283074154806 363.6216254579999 L 397.51132225636843 363.6216254579999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(394.5793626897018,363.6216254579999) translate(-394.5793626897018,-363.6216254579999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 409.23916052303514 356.2917265413333 L 394.5793626897018 363.6216254579999 L 409.23916052303514 370.9515243746666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="557.9731693745059" y="390.00926155799993" width="72.908142454375" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="560.6119329845059" y="405.84184321799995" text-anchor="start" dominant-baseline="alphabetic">send SMS</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 394.5793626897018 412.8785461779999 L 791.3431589470182 412.8785461779999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(794.2751185136849,412.8785461779999) translate(-794.2751185136849,-412.8785461779999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 779.6153206803516 405.54864726133326 L 794.2751185136849 412.8785461779999 L 779.6153206803516 420.20844509466656 Z"/></g></g><g><g><rect fill="white" stroke="none" x="171.91558570018097" y="439.2661822779999" width="105.51371801589843" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="174.55434931018098" y="455.09876393799993" text-anchor="start" dominant-baseline="alphabetic">MFA Challenge</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 394.5793626897018 462.1354668979999 L 57.69748629322525 462.1354668979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(54.76552672655859,462.1354668979999) translate(-54.76552672655859,-462.1354668979999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 69.42532455989192 454.80556798133324 L 54.76552672655859 462.1354668979999 L 69.42532455989192 469.46536581466654 Z"/></g></g><g><g><rect fill="white" stroke="none" x="827.4684595416205" y="488.5231029979999" width="46.838013059843746" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="830.1072231516205" y="504.3556846579999" text-anchor="start" dominant-baseline="alphabetic">{SMS}</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 794.2751185136849 511.3923876179999 L 904.5678540627331 511.3923876179999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(907.4998136293998,511.3923876179999) translate(-907.4998136293998,-511.3923876179999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 892.8400157960665 504.0624887013332 L 907.4998136293998 511.3923876179999 L 892.8400157960665 518.7222865346665 Z"/></g></g><g><g><rect fill="white" stroke="none" x="186.5827304755716" y="537.7800237179998" width="76.17942846511718" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="189.2214940855716" y="553.6126053779998" text-anchor="start" dominant-baseline="alphabetic">Enter code</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 560.6493083379999 L 391.64740312303513 560.6493083379999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(394.5793626897018,560.6493083379999) translate(-394.5793626897018,-560.6493083379999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 379.9195648563684 553.3194094213331 L 394.5793626897018 560.6493083379999 L 379.9195648563684 567.9792072546666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="547.9087620258731" y="587.0369444379999" width="93.03695715164062" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="550.5475256358731" y="602.8695260979998" text-anchor="start" dominant-baseline="alphabetic">Validate code</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 394.5793626897018 609.9062290579999 L 791.3431589470182 609.9062290579999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(794.2751185136849,609.9062290579999) translate(-794.2751185136849,-609.9062290579999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 779.6153206803516 602.5763301413332 L 794.2751185136849 609.9062290579999 L 779.6153206803516 617.2361279746666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="561.7634449482364" y="636.2938651579999" width="65.32759130691406" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="564.4022085582363" y="652.1264468179999" text-anchor="start" dominant-baseline="alphabetic">Validated</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 794.2751185136849 659.1631497779999 L 397.51132225636843 659.1631497779999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(394.5793626897018,659.1631497779999) translate(-394.5793626897018,-659.1631497779999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 409.23916052303514 651.8332508613332 L 394.5793626897018 659.1631497779999 L 409.23916052303514 666.4930486946666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="167.037297431138" y="685.5507858779999" width="115.27029455398437" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="169.676061041138" y="701.3833675379999" text-anchor="start" dominant-baseline="alphabetic">redirect /callback</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 394.5793626897018 708.420070498 L 57.69748629322525 708.420070498" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(54.76552672655859,708.420070498) translate(-54.76552672655859,-708.420070498)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 69.42532455989192 701.0901715813333 L 54.76552672655859 708.420070498 L 69.42532455989192 715.7499694146667 Z"/></g></g><g><g><rect fill="white" stroke="none" x="139.95965217430597" y="734.807706598" width="62.31399572585937" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="142.59841578430598" y="750.6402882579999" text-anchor="start" dominant-baseline="alphabetic">/callback</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 757.676991218 L 284.5358137812461 757.676991218" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(287.4677733479127,757.676991218) translate(-287.4677733479127,-757.676991218)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 272.80797551457937 750.3470923013333 L 287.4677733479127 757.676991218 L 272.80797551457937 765.0068901346667 Z"/></g></g></g><g/><g/><g/><g/><g/><g/></g></svg>


This first part is just the normal authentication, using 3-legged authorization, a custom "database" connection using the Tesla Auth API plus SMS MFA. The diagram shows the "happy path".

> The fact that Tesla uses Password Grant, doesn’t mean that our app cannot use 3-legged. Auth0 is hosting the login page for us.

Now, the second stage for this that happens all in the final "leg" of the 3-legged process (essentially in the */callback* handler):

<!--
Browser->Tesla App:/callback
Tesla App->Auth0: exchange code/token
Tesla App<--Auth0: { access_token }
Tesla App->Auth0: GET /userprofile
Tesla App<--Auth0: { sub: user_id }
Tesla App->Auth0: GET /MFA_enrollments
Tesla App<--Auth0: { phone }
Tesla App->Auth0: Update App_metadata { user_id, phone }
Browser<--Tesla App: Done!
-->

<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="529" height="572"><defs/><g><g/><g/><g/><g/><g/><g/><g/><g/><g/><g><rect fill="white" stroke="none" x="0" y="0" width="529" height="572"/></g><g/><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 59.284222437999986 L 54.76552672655859 572.9635385179998" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.60438047264452 59.284222437999986 L 169.60438047264452 572.9635385179998" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 482.22792226001434 59.284222437999986 L 482.22792226001434 572.9635385179998" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/></g><g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 8.795878699999996 11.786477457999997 L 100.73517475311718 11.786477457999997 L 100.73517475311718 59.284222437999986 L 8.795878699999996 59.284222437999986 L 8.795878699999996 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="27.882935478999997" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Browser</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 118.32693215311718 11.786477457999997 L 220.88182879217186 11.786477457999997 L 220.88182879217186 59.284222437999986 L 118.32693215311718 59.284222437999986 L 118.32693215311718 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="137.41398893211718" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Tesla App</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 443.9855386377526 11.786477457999997 L 520.4703058822761 11.786477457999997 L 520.4703058822761 59.284222437999986 L 443.9855386377526 59.284222437999986 L 443.9855386377526 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="463.0725954167526" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Auth0</text></g></g><g><g><g><rect fill="white" stroke="none" x="81.02795573667187" y="94.46773723799998" width="62.31399572585937" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="83.66671934667187" y="110.30031889799997" text-anchor="start" dominant-baseline="alphabetic">/callback</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 54.76552672655859 117.33702185799999 L 166.67242090597784 117.33702185799999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(169.60438047264452,117.33702185799999) translate(-169.60438047264452,-117.33702185799999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 154.9445826393112 110.00712294133332 L 169.60438047264452 117.33702185799999 L 154.9445826393112 124.66692077466665 Z"/></g></g><g><g><rect fill="white" stroke="none" x="253.5887967529115" y="143.724657958" width="144.65470922683593" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="256.2275603629115" y="159.557239618" text-anchor="start" dominant-baseline="alphabetic">exchange code/token</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.60438047264452 166.593942578 L 479.2959626933477 166.593942578" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(482.22792226001434,166.593942578) translate(-482.22792226001434,-166.593942578)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 467.568124426681 159.26404366133332 L 482.22792226001434 166.593942578 L 467.568124426681 173.92384149466668 Z"/></g></g><g><g><rect fill="white" stroke="none" x="269.4871427001771" y="192.98157867799998" width="112.85801733230468" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="272.12590631017713" y="208.814160338" text-anchor="start" dominant-baseline="alphabetic">{ access_token }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 482.22792226001434 215.85086329799998 L 172.5363400393112 215.85086329799998" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(169.60438047264452,215.85086329799998) translate(-169.60438047264452,-215.85086329799998)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 184.26417830597785 208.5209643813333 L 169.60438047264452 215.85086329799998 L 184.26417830597785 223.18076221466666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="269.91305364988415" y="242.23849939799996" width="112.00619543289062" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="272.55181725988416" y="258.07108105799995" text-anchor="start" dominant-baseline="alphabetic">GET /userprofile</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.60438047264452 265.10778401799996 L 479.2959626933477 265.10778401799996" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(482.22792226001434,265.10778401799996) translate(-482.22792226001434,-265.10778401799996)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 467.568124426681 257.7778851013333 L 482.22792226001434 265.10778401799996 L 467.568124426681 272.4376829346666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="274.37618841550915" y="291.49542011799997" width="103.07992590164062" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="277.01495202550916" y="307.328001778" text-anchor="start" dominant-baseline="alphabetic">{ sub: user_id }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 482.22792226001434 314.36470473799994 L 172.5363400393112 314.36470473799994" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(169.60438047264452,314.36470473799994) translate(-169.60438047264452,-314.36470473799994)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 184.26417830597785 307.0348058213333 L 169.60438047264452 314.36470473799994 L 184.26417830597785 321.6946036546666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="247.0998822631654" y="340.75234083799995" width="157.63253820632812" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="249.7386458731654" y="356.58492249799997" text-anchor="start" dominant-baseline="alphabetic">GET /MFA_enrollments</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.60438047264452 363.6216254579999 L 479.2959626933477 363.6216254579999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(482.22792226001434,363.6216254579999) translate(-482.22792226001434,-363.6216254579999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 467.568124426681 356.2917265413333 L 482.22792226001434 363.6216254579999 L 467.568124426681 370.9515243746666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="293.92520727537243" y="390.00926155799993" width="63.98188818191406" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="296.56397088537244" y="405.84184321799995" text-anchor="start" dominant-baseline="alphabetic">{ phone }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 482.22792226001434 412.8785461779999 L 172.5363400393112 412.8785461779999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(169.60438047264452,412.8785461779999) translate(-169.60438047264452,-412.8785461779999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 184.26417830597785 405.54864726133326 L 169.60438047264452 412.8785461779999 L 184.26417830597785 420.20844509466656 Z"/></g></g><g><g><rect fill="white" stroke="none" x="190.4212933959779" y="439.2661822779999" width="270.98971594070315" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="193.0600570059779" y="455.09876393799993" text-anchor="start" dominant-baseline="alphabetic">Update App_metadata { user_id, phone }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.60438047264452 462.1354668979999 L 479.2959626933477 462.1354668979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(482.22792226001434,462.1354668979999) translate(-482.22792226001434,-462.1354668979999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 467.568124426681 454.80556798133324 L 482.22792226001434 462.1354668979999 L 467.568124426681 469.46536581466654 Z"/></g></g><g><g><rect fill="white" stroke="none" x="89.98642131284375" y="488.5231029979999" width="44.39706457351562" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="92.62518492284374" y="504.3556846579999" text-anchor="start" dominant-baseline="alphabetic">Done!</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.60438047264452 511.3923876179999 L 57.69748629322525 511.3923876179999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(54.76552672655859,511.3923876179999) translate(-54.76552672655859,-511.3923876179999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 69.42532455989192 504.0624887013332 L 54.76552672655859 511.3923876179999 L 69.42532455989192 518.7222865346665 Z"/></g></g></g><g/><g/><g/></g></svg>

Again, this is the happy path. At the end of this, we end up with a user object in Auth0 that will look like this:

```json
{
    "email": "you@example.com",
    "updated_at": "2019-12-02T17:05:52.345Z",
    "user_id": "auth0|you@example.com",
    "picture": "https://s.gravatar.com/avatar/9303fma.png",
    "nickname": "you",
    "identities": [
        {
            "user_id": "you@example.com",
            "provider": "auth0",
            "connection": "tesla",
            "access_token": "1234567ijhgfds4567ujhgfe4567ujhgfder",
            "isSocial": false
        }
    ],
    "created_at": "2019-03-15T15:56:44.577Z",
    "multifactor": [
        "guardian"
    ],
    "multifactor_last_modified": "2019-11-25T23:22:01.724Z",
    "user_metadata": {},
    "app_metadata": {
        "phone": "+14251112222"
    },
    "last_ip": "192.168.1.10",
    "last_login": "2019-12-02T16:35:50.204Z",
    "logins_count": 8,
    "blocked_for": [],
    "guardian_authenticators": [
        {
            "id": "sms|dev_87578rhjbfsd4",
            "type": "sms",
            "confirmed": true,
            "name": "+1 4251112222",
            "created_at": "2019-11-25T23:21:42.000Z",
            "last_auth_at": "2019-11-28T03:11:38.000Z"
        },
        {
            "id": "recovery-code|dev_TCskjdfhsjkfhdjk",
            "type": "recovery-code",
            "confirmed": true,
            "created_at": "2019-11-25T23:21:41.000Z",
            "enrolled_at": "2019-11-25T23:21:52.000Z"
        }
    ]
}
```

The [nodejs auth0 module](https://www.npmjs.com/package/auth0) makes this really easy:

> `code` is the authorization code returned in the 2 step of the authorization process:

```js
function completeAuthEnrollment(code, done){

  var locals = {}; 

  // The payload for the code exchange
  var data = {
    code: code,
    redirect_uri: process.env.AUTH0_CALLBACK,
    client_id: process.env.AUTH0_CLIENT_ID,
    client_secret: process.env.AUTH0_CLIENT_SECRET
  };

  //Auth0 client used for authentication/user 
  var auth = new AuthenticationClient({
    domain: process.env.AUTH0_DOMAIN
  });

  //Auth0 client used for Mgmt API
  var auth0 = new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET
  });

  async.series([
    cb => {
      //1. Exchange code for token
      auth.oauth.authorizationCodeGrant(data, (err, token) => {
        if(err){
          return cb(err);
        }
        locals.token = token;
        cb();
      });
    },
    //2. Get user id
    cb => {
      auth.getProfile(locals.token.access_token, (err, userInfo) => {
        if(err){
          return cb(err);
        }
        locals.user_id = userInfo.sub;
        cb();
      });
    },
    //3. Get MFA enrollments
    cb => {
      auth0.getGuardianEnrollments({ id: locals.user_id }, (err, enrollments) => {
        if(err){
          return cb(err);
        }
        if(!enrollments || enrollments.length === 0){
          return cb('No MFA!');
        }
        //Search for SMS enrollment
        const enrollment = _.find(enrollments, (en) => { return (en.status === "confirmed" && en.type === "sms") });
        if(!enrollment){
          return cb('No SMS MFA found');
        }
        //Remove any spaces (Auth0 formats phone as "+1425 111333")
        locals.phone = enrollment.phone_number.replace(' ', '');
        cb();
      });
    },
    //4. Save phone in app_metadata
    cb => {
      auth0.updateAppMetadata({id: locals.user_id}, {phone: locals.phone}, (err, user) =>{
        if(err){
          return cb(err);
        }
        cb();
      });
    }
    ],
    (e) => {
      done(e, "Enrollment complete!");  
    });
};
```

Notice that there are *2 instances of the auth0 module* in use:

1. One used for *user auth* related APIs (e.g. exchange code, get profile). The first 2 steps in the series above.
2. Another used for *Management API* (e.g. get enrollments, update metadata). The last 2 steps.

And the latter needs a different `access_token`. One that has the right scopes for these operations: `read:users` and `update:users`. We need to **search** and then **update**.

> By default, the Enrollment API returns an obfuscated phone number. There's a feature flag to enable the phone to be returned: `disable_management_api_sms_obfuscation`. See [here](https://auth0.com/docs/api/management/v2#!/Tenants/patch_settings)


### Processing commands

Now that we've got all the pieces in place, and the user is bootstrapped, we can send commands via SMS.

Here's the overview of how the whole thing works:

<!-- Phone->Twilio:"status car"
Twilio->Tesla App: {phone, msg=status car}
Tesla App->Auth0:/searchuser { phone }
Tesla App<--Auth0: { user, access_token }
Tesla App->Tesla: /GET status car
Tesla
Tesla App<--Tesla: { Battery, Range, ... }
Tesla App->Tesla App: Format Message
Phone<--Tesla App: "Battery: 45%..."
 -->

<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="702" height="541"><defs/><g><g/><g/><g/><g/><g/><g/><g/><g/><g><rect fill="white" stroke="none" x="0" y="0" width="702" height="541"/></g><g/><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 49.0783471611289 59.284222437999986 L 49.0783471611289 541.2983751979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.94815054517838 59.284222437999986 L 169.94815054517838 541.2983751979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 375.3705509751263 59.284222437999986 L 375.3705509751263 541.2983751979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 565.7249277234337 59.284222437999986 L 565.7249277234337 541.2983751979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 657.7577817136603 59.284222437999986 L 657.7577817136603 541.2983751979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="13.532121076923076,5.863919133333333"/></g><g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 8.795878699999996 11.786477457999997 L 89.3608156222578 11.786477457999997 L 89.3608156222578 59.284222437999986 L 8.795878699999996 59.284222437999986 L 8.795878699999996 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="27.882935478999997" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Phone</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 132.52896333404948 11.786477457999997 L 207.36733775630728 11.786477457999997 L 207.36733775630728 59.284222437999986 L 132.52896333404948 59.284222437999986 L 132.52896333404948 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="151.61602011304947" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Twilio</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 324.09310265559895 11.786477457999997 L 426.64799929465363 11.786477457999997 L 426.64799929465363 59.284222437999986 L 324.09310265559895 59.284222437999986 L 324.09310265559895 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="343.180159434599" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Tesla App</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 527.4825441011719 11.786477457999997 L 603.9673113456954 11.786477457999997 L 603.9673113456954 59.284222437999986 L 527.4825441011719 59.284222437999986 L 527.4825441011719 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="546.569600880172" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Auth0</text></g><path fill="none" stroke="none"/><g><path fill="white" stroke="black" paint-order="fill stroke markers" d=" M 621.5590687456954 11.786477457999997 L 693.9564946816251 11.786477457999997 L 693.9564946816251 59.284222437999986 L 621.5590687456954 59.284222437999986 L 621.5590687456954 11.786477457999997 Z" stroke-miterlimit="10" stroke-width="2.814681184" stroke-dasharray=""/></g><g><g/><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="640.6461255246954" y="41.692465037999995" text-anchor="start" dominant-baseline="alphabetic">Tesla</text></g></g><g><g><g><rect fill="white" stroke="none" x="69.89526008446224" y="94.46773723799998" width="79.23597753738281" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="72.53402369446223" y="110.30031889799997" text-anchor="start" dominant-baseline="alphabetic">"status car"</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 49.0783471611289 117.33702185799999 L 167.0161909785117 117.33702185799999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(169.94815054517838,117.33702185799999) translate(-169.94815054517838,-117.33702185799999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 155.28835271184505 110.00712294133332 L 169.94815054517838 117.33702185799999 L 155.28835271184505 124.66692077466665 Z"/></g></g><g><g><rect fill="white" stroke="none" x="190.7650634685117" y="143.724657958" width="163.78857458328125" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="193.4038270785117" y="159.557239618" text-anchor="start" dominant-baseline="alphabetic">{phone, msg=status car}</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 169.94815054517838 166.593942578 L 372.4385914084597 166.593942578" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(375.3705509751263,166.593942578) translate(-375.3705509751263,-166.593942578)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 360.71075314179296 159.26404366133332 L 375.3705509751263 166.593942578 L 360.71075314179296 173.92384149466668 Z"/></g></g><g><g><rect fill="white" stroke="none" x="398.22396292189717" y="192.98157867799998" width="144.64755285476562" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="400.8627265318972" y="208.814160338" text-anchor="start" dominant-baseline="alphabetic">/searchuser { phone }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 375.3705509751263 215.85086329799998 L 562.792968156767 215.85086329799998" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(565.7249277234337,215.85086329799998) translate(-565.7249277234337,-215.85086329799998)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 551.0651298901004 208.5209643813333 L 565.7249277234337 215.85086329799998 L 551.0651298901004 223.18076221466666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="396.18746389845967" y="242.23849939799996" width="148.72055090164062" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="398.8262275084597" y="258.07108105799995" text-anchor="start" dominant-baseline="alphabetic">{ user, access_token }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 565.7249277234337 265.10778401799996 L 378.30251054179297 265.10778401799996" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(375.3705509751263,265.10778401799996) translate(-375.3705509751263,-265.10778401799996)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 390.0303488084597 257.7778851013333 L 375.3705509751263 265.10778401799996 L 390.0303488084597 272.4376829346666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="463.0091658569518" y="291.49542011799997" width="107.11000097488281" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="465.64792946695184" y="307.328001778" text-anchor="start" dominant-baseline="alphabetic">/GET status car</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 375.3705509751263 314.36470473799994 L 654.8258221469936 314.36470473799994" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(657.7577817136603,314.36470473799994) translate(-657.7577817136603,-314.36470473799994)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 643.097983880327 307.0348058213333 L 657.7577817136603 314.36470473799994 L 643.097983880327 321.6946036546666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="446.4200545288268" y="340.75234083799995" width="140.2882236311328" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="449.05881813882684" y="356.58492249799997" text-anchor="start" dominant-baseline="alphabetic">{ Battery, Range, ... }</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 657.7577817136603 363.6216254579999 L 378.30251054179297 363.6216254579999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(375.3705509751263,363.6216254579999) translate(-375.3705509751263,-363.6216254579999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 390.0303488084597 356.2917265413333 L 375.3705509751263 363.6216254579999 L 390.0303488084597 370.9515243746666 Z"/></g></g><g><g><rect fill="white" stroke="none" x="396.18746389845967" y="390.00926155799993" width="115.26318395828125" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="398.8262275084597" y="405.84184321799995" text-anchor="start" dominant-baseline="alphabetic">Format Message</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 375.3705509751263 412.8785461779999 L 445.73758057512634 412.8785461779999 L 445.73758057512634 430.4703035779999 L 378.30251054179297 430.4703035779999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray=""/><g transform="translate(375.3705509751263,430.4703035779999) translate(-375.3705509751263,-430.4703035779999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 390.0303488084597 423.14040466133326 L 375.3705509751263 430.4703035779999 L 390.0303488084597 437.80020249466656 Z"/></g></g><g><g><rect fill="white" stroke="none" x="156.30724307531509" y="456.8579396779999" width="111.834411985625" height="22.86928462"/></g><text fill="black" stroke="none" font-family="sans-serif" font-size="11pt" font-style="normal" font-weight="normal" text-decoration="normal" x="158.9460066853151" y="472.69052133799994" text-anchor="start" dominant-baseline="alphabetic">"Battery: 45%..."</text></g><g><path fill="none" stroke="black" paint-order="fill stroke markers" d=" M 375.3705509751263 479.7272242979999 L 52.010306727795566 479.7272242979999" stroke-miterlimit="10" stroke-width="1.4659797833333332" stroke-dasharray="7.0367029599999995"/><g transform="translate(49.0783471611289,479.7272242979999) translate(-49.0783471611289,-479.7272242979999)"><path fill="black" stroke="none" paint-order="stroke fill markers" d=" M 63.73814499446223 472.39732538133325 L 49.0783471611289 479.7272242979999 L 63.73814499446223 487.05712321466655 Z"/></g></g></g><g/><g/><g/><g/><g/></g></svg>

The key is the `searchUserByPhone` function:

```js
function searchSubscriberByPhone(phone, done){
  
  const auth0 = new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET
  });

  auth0
    .getUsers({
      search_engine: 'v3',
      per_page: 10,
      page: 0,
      q: util.format('app_metadata.phone:"%s"', phone)
    })
    .then(users => {
      if(!users || users.length === 0){
        return done('User not found');
      }
      done(null, users[0]); //Right now we limit for 1 (the first we find)
    })
    .catch(err => {
      done(err);
    });
}
```

There are a few caveats with this implementation that my colleague [Eva Sarafianou](https://evasar.io/), pointed out:

1. As it is now, *many* accounts could be potentially associated with the same phone. There's no protection for that right now. We simply return the first user we find with teh associated phone. Perhaps, as she suggested we could use SMS Passwordless instead of MFA and use the account linking feature.
2. Likewise, I have not implemented anything to contemplate the situation of the same user having *multiple* phones. Likely, a more common use. (e.g. I have 2 phones: work and personal).
3. The situation in which you would own *multiple cars* (lucky you!), is actually not complicated. A single Tesla account can have many cars associated with it. All car specific APIs require the `vehicleId` parameter. And because cars can have names, you can easily lookup the id based on it.

> An oddity I found with standard JSON parsing in nodejs, the vehicle `id` property returned by the Tesla API is a *very large* integer, which `JSON.parse` unhelpfully rounds. Being an `id` it naturally doesn't help. Thankfully, the API also returns `id_s` (`_s` for `string` presumably) which works just fine. We don't really care what the type of the `id` is.


### Recap on all authentications happening

1. The first authentication happens between Twilio and the API. Twilio will send a signature on every request. This guarantees the request is originted by them. See [here](https://www.twilio.com/docs/usage/security) for details. In nodejs (with Express, it is trivial to add this validation with the `webhook()` [middleware](https://www.twilio.com/blog/2014/01/secure-your-nodejs-webhooks-with-middleware-for-express-middleware.html): 

```js
/*------------ Twilio App Main ---------------*/
server.post('/', twilio.webhook(), smsHandler);

function smsHandler(req, res, next){
 //code here
}
```

2. The second one is *User* authentication. We are using a combination of (a) a custom db connection to authenticate the user credentials against the Tesla API (b) use Auth0 authorization code flow.

3. The App backend itself, using  *client credentials*. Our backend needs to call Auth0's API for user search, query SMS enrollements, and update application metadata. The scope of access is restricted to tehse 2 operations.


### Final caveats

Tesla's API is **not** officialy documented. This is all using information available on the web. Of course Tesla might change anything without any notice. Again, beware that some operations on the API allow you to have your car **do** things. If you own a Tesla and build anything using these APIs, it is your own responsibility. The purpose of this post is really to illustrate the techinques to bridge SMS with a token based API, and how Auth0 helps you with that.
