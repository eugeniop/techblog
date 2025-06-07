---
layout: post
title: "Art and geometry - Building the Auth0 Logo with Nanoleaf Panels - Part II"
date:   2019-12-14
categories: geometry
comments: true
author: Eugenio Pace
---

Now that the basic design is ready, I need to build a base for each light panel. Not every supporting parallelogram needs to be the same. They all need to be the projected shape, but I can vary the height and even "convexity" to make an interesting installation. 

I decided to use foam board to model as the base material because they are robust and super easy to work with. These will also allow me to hide the cables that eventually I will have to solder across non-adjacent triangles. Fortunately, nanoleafs ships [flexible connectors]() and I will be using these for all interconnections.

My goal would be to minimize unions, so I need to decompose the support structure in a folding pattern. Pretty much like a (simple) origami. Here are the steps I've taken to compute the size of each side. 

### The basic construct

The 2 triangles combined would look like this:

![](https://docs.google.com/drawings/d/e/2PACX-1vTLsGSqKJ4YxeWbnHULb6Dbc_uWNBgDknPGm9uJ8jTvVtVOLyrbIxHWrcq6ZBuB9teRlbbvQU1IgIhx/pub?w=589&h=540)

Consider this shape below, with the left one being the projected parallelogram that makes one of the parts of the star (we need 5 of these)
. The right shape shows the 3D representation of a 1/4 of the parallelogram, made up of the inclined triangle (only half):

![](https://docs.google.com/drawings/d/e/2PACX-1vQtM7pIUza4KDtAinSfMXhZqkjPQsIR3SIbTxHA3kAoe4CfNLz2IsaMqQZozcjodPcfvZNuG457ETdU/pub?w=746&h=451)

Some facts:

**β** is the angle we computed in the [previous post](/post/2019-12-07-art-and-geometry-building-the-auth0-logo-with-nanoleaf-panels-part-i.md) which turns out to be ~37.3°.

![](https://latex.codecogs.com/svg.latex?DA&space;=&space;L&space;.&space;\sqrt{3}&space;/&space;2)

Also, just for reference: 

**ADB** is exactly 1/2 of the full triangle.
**DB** = **L**, the side of the triangle. In a nanoleaf, this is ~25 cm.
**AB** = **L/2** (it is exactly 1/2 of the side of the original triangle and this 1/2 of **DB**). With L = 25cm, **AB** = 12.5cm

What we need is the size of the segments **DC** and **CB**.

For **DC** we can combine a few terms to get:

![](https://latex.codecogs.com/svg.latex?sin(\beta)&space;=&space;DC&space;/&space;DA;&space;DC&space;=&space;\sin(\beta).L.\sqrt(3)/2) 

For **CB**, it is easier as the α angle is known (54°) so:

<!-- <a href="https://www.codecogs.com/eqnedit.php?latex=cos(54)&space;=&space;L&space;/&space;2.&space;\overline{CB}" target="_blank"><img src="https://latex.codecogs.com/svg.latex?cos(54)&space;=&space;L&space;/&space;2.&space;\overline{CB}" title="cos(54) = L / 2. \overline{CB}" /></a> -->

![](https://latex.codecogs.com/svg.latex?cos(54)&space;=&space;L&space;/&space;2.&space;\overline{CB})


With **L** = 25cm, then this results in:

* **DC** = ~13cm 
* **CB** = ~21cm

The resulting template for our "origami" is then:

![](https://docs.google.com/drawings/d/e/2PACX-1vRHfqclSk2RQtH1WV9W_yT3ewDPX-ROdSMxPelmOI7zQ7b1yHfyh1vhNkfi6hVpsL-SDQmqFQauWB7F/pub?w=746&h=451)

The first example is a "concave" support, the second is "convex", and the third a "saw" version and the last one just one with a different height. All variables I can use to make the design more interesting.


### The result

Here's the first example I crafted. All made of foamboard.

![](/media/auth0-star-nanoleaf.png)


### Next steps  

4 more!


### Credits

The math formulas are rendered with [Codecogs](https://www.codecogs.com/latex/eqneditor.php)

<a href="http://www.codecogs.com" target="_blank"><img src="http://www.codecogs.com/images/poweredbycodecogs.png" border="0" title="CodeCogs - An Open Source Scientific Library" alt="CodeCogs - An Open Source Scientific Library"></a>
