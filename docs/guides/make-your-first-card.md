# Make your first card

<!-- VISUAL: kind=shot · what=editor desktop layout with level-03 and untitled frame · notice=left layer tree, central dot canvas, right design panel with dot size controls -->

You can open MAKE by clicking MAKE in the top bar or by opening `?make` in your browser. The screen shows an infinite canvas covered by a grid of faint dots. At the top left sits your tool bar with single-key shortcuts: Move (`V`), Hand (`H`), Frame (`F`), Draw (`B`), Text (`T`), and Code (`C`). On the left sits the LAYERS and ASSETS panel. On the right sits the DESIGN, ANIMATE, CODE, and EXPORT inspector.

## Make a blank frame

<!-- VISUAL: kind=steps · what=frame creation with F tool · notice=dragged outline snapping to whole grid cells at 2.25 px tile pitch -->

Press `F` to choose the Frame tool. Move your pointer to the canvas and drag out a rectangle. If you want a square card, click once to place a standard 144 by 144 cell tile.

The outline snaps to whole grid points. Each cell has a pitch of 2.25 screen pixels. Look at the DESIGN panel on the right. Under FRAME you see the card dimensions: width, height, columns, and rows. You can type numbers directly into these boxes to change the card size.

## Add a live field layer

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots fading toward the card edge on a 3x lattice -->

Press `C` to pick the Code tool, then click inside your new frame. You can also click `+ CODE LAYER` in the LAYERS list. The editor adds a Field IR layer to your frame and opens the CODE tab.

Your card displays lit dots right away. The default program creates concentric ripple rings that spread outward across the card surface. The editor compiles this code into a pure mathematical function `f(u, v)`. The variables `u` and `v` measure position from 0 at the top left to 1 at the bottom right. The variable `t` tracks elapsed time in seconds. Every dot reads its brightness directly from this function.

## Set tone and dot shape

<!-- VISUAL: kind=diagram · what=squircle roundness slider from r=0 to r=1 · notice=circle at n=2, soft squircle at n=3.9, square at n=32 -->

Click the DESIGN tab in the right inspector. Select your frame in the layer tree and scroll to the DOTS section.

The roundness slider changes the shape of every dot on the card. The engine calculates dot shapes using a superellipse formula. At roundness 0, dots are circles with an exponent of 2. At roundness 0.25, dots take the default squircle shape with an exponent near 3.9. At roundness 1, dots become flat squares with an exponent of 32.

Below roundness sits the quantize control. Field brightness is rounded into discrete steps. The default value is 5 steps. Smooth mathematical gradients turn into 5 visible bands of dot sizes. If you select your code layer, you can change its tone in the layer inspector. Choose between `faint`, `mid`, `idle`, `value`, or `active`. The `active` tone paints dots in Signal Red (`#FF3B30`), the single accent color used across the site.

## Edit directly on the canvas

<!-- VISUAL: kind=shot · what=canvas selection handles and floating quick bar · notice=red sweep handle on ring, quick bar buttons for tone and lattice -->

Press `V` to return to the Move tool. Click on your frame to select it. Four corner handles appear at the outer edges of the card. Drag any corner handle to resize the frame in whole cell increments. The card contents stay anchored while the grid expands or contracts.

Select a specific layer by clicking on its lit dots. When you select a shape layer like a ring, handles appear directly on the shape. A radius handle lets you resize the circle. A red sweep handle lets you pull the arc along its track. The sweep snaps to steps of `2 * PI / n`, keeping every arc ending cleanly on a dot position.

A floating quick bar appears above the selected layer. This bar gives you immediate controls without opening the inspector panels. Click `TONE` to step through brightness tiers. Click `LATTICE -` or `LATTICE +` to change dot spacing. Coarser lattices place larger dots further apart, matching the look of physical electronic panels.

## Type text in place

<!-- VISUAL: kind=steps · what=typing DOTS with T tool · notice=5x7 font rendered in dots with blinking caret between glyph gaps -->

Press `T` to select the Text tool and click inside your frame. An invisible text input mounts to catch your keystrokes. Type your text directly onto the card.

The letters render straight onto the card grid using an authentic 5 by 7 dot matrix font. Letters are converted to uppercase characters, supporting strings up to 64 characters long. A cursor blinks in the gap between letter cells. Click anywhere inside the text to move the cursor. When you finish typing, press Enter or click the canvas outside the frame. The entire typing session saves as one undo step. Pressing Escape cancels your edit.

## Share your card as a link

<!-- VISUAL: kind=steps · what=top bar share action and link dialog · notice=share URL with compressed payload under 12,000 characters -->

Look at the top bar on the right side. Click the `SHARE` button.

The editor serializes your frame into JSON and compresses the data using raw DEFLATE compression. It encodes the compressed binary stream into a URL-safe base64 string. The entire card configuration fits into the URL query parameters under the 12,000 character limit. The site copies the link straight to your clipboard.

Send this URL to another browser. When the recipient opens the link, the engine decompresses the URL string and places the card directly onto their canvas. The shared card keeps its full layer stack, data bindings, and animation timeline.

## Build cards on a phone

<!-- VISUAL: kind=shot · what=phone layout with floating dock and bottom sheet · notice=44 px touch targets, bottom dock with tool icons, sheet at 60% detent -->

Open Dot/480 on a mobile browser to see the phone interface. The canvas expands to fill the entire screen. The site navigation collapses into a slim header bar with back, title, undo, redo, zoom, and share buttons.

A floating dock sits at the bottom of the screen. The dock holds three segments: the layers button on the left, the tool buttons in the middle (`V`, `F`, `B`, `T`, `C`), and the inspector button on the right. Every touch target is sized to at least 44 pixels. Tap an icon to change your active tool. Use one finger on empty canvas to pan around. Pinch with two fingers to zoom in or out.

When you tap the inspector or layer icon, a bottom sheet slides up over the canvas. The sheet has three snap points: peek at 36 percent of screen height, half at 60 percent, and full at 90 percent. Drag the top handle of the sheet to change heights. The editor remembers your chosen sheet height for each tab.

## Use mobile selection and gestures

<!-- VISUAL: kind=steps · what=long press menu and native share sheet on mobile · notice=selection bar above dock with DUP and DEL buttons, native share sheet popup -->

Above the dock on mobile sits the selection bar. It contains quick actions: `SELECT`, `ALL`, `DUP`, `GROUP`, `COPY`, `PASTE`, and `DEL`. Tap `SELECT` to enter multi-selection mode. While active, tapping frames adds or removes them from your selection without panning the canvas.

Press and hold your finger on a frame or layer for 500 milliseconds to open a context menu. The menu contains six direct commands: `DUPLICATE`, `FORWARD`, `BACKWARD`, `TO FRONT`, `TO BACK`, and `DELETE`. Tap any command to apply it instantly as one undo step.

When you finish on your phone, tap `SHARE` in the top bar. The editor passes your compressed link to `navigator.share`. This opens your phone's native operating system share sheet, letting you send your card through Messages, Mail, or AirDrop.
