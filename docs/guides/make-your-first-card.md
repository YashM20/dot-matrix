# Make your first card

<!-- VISUAL: kind=shot · what=editor desktop layout with level-03 and untitled frame · notice=left layer tree, central dot canvas, right design panel with dot size controls -->

Click MAKE in the top bar or open `?make` in your browser. You see an infinite canvas covered in faint dots. Look at the top left corner. The tool bar gives you six tools: Move (`V`), Hand (`H`), Frame (`F`), Draw (`B`), Text (`T`), and Code (`C`). Layers and assets live on the left. Design, animation, code, and export controls live on the right.

## Make a blank frame

<!-- VISUAL: kind=steps · what=frame creation with F tool · notice=dragged outline snapping to whole grid cells at 2.25 px tile pitch -->

Press `F` to grab the Frame tool. Drag a box across the canvas. Click once if you want a square tile: that drops a card that is 144 cells wide and 144 cells tall.

Your dragged outline snaps to whole grid points. Every cell measures 2.25 screen pixels across. Look at the FRAME section in the right panel. It lists your card width, height, columns, and rows. You can type new numbers into these fields to change the card size.

## Add a live field layer

<!-- VISUAL: kind=card · what=ir-ripple · notice=concentric rings of dots fading toward the card edge on a 3x lattice -->

Press `C` to pick the Code tool, then click inside your frame. The editor adds a code layer to the card and opens the CODE tab on the right. You can also click `+ CODE LAYER` in the left panel.

Look at the card. It is already running live dots. Concentric rings ripple outward from the center. The editor compiles this program into a function `f(u, v)`. The coordinate `u` goes from 0 on the left edge to 1 on the right edge. The coordinate `v` goes from 0 on the top edge to 1 on the bottom edge. The clock variable `t` counts seconds. Every dot gets its brightness by sampling this formula.

## Set tone and dot shape

<!-- VISUAL: kind=diagram · what=squircle roundness slider from r=0 to r=1 · notice=circle at n=2, soft squircle at n=3.9, square at n=32 -->

Click the DESIGN tab in the right panel. Click your frame in the layer list and scroll down to DOTS.

Drag the roundness slider to change how dots look. The engine draws each dot with a superellipse formula. Pull the slider to 0 for round circles. Leave it at 0.25 for the default squircle shape. Push it to 1 for flat-edged squares.

Look below roundness at the quantize slider. The sampler rounds smooth math values into distinct dot sizes. The default setting is 5 steps, which groups brightness into 5 sizes. Click your code layer to pick its tone. You have five choices: `faint`, `mid`, `idle`, `value`, and `active`. The `active` tone paints dots in Signal Red (`#FF3B30`). That red is the only accent color on the entire site.

## Edit directly on the canvas

<!-- VISUAL: kind=shot · what=canvas selection handles and floating quick bar · notice=red sweep handle on ring, quick bar buttons for tone and lattice -->

Press `V` to switch back to the Move tool. Click your frame on the canvas. Corner handles appear at the four corners. Drag any corner to resize the card in whole cell steps. The card grows or shrinks while existing layers keep their coordinates.

Click directly on lit dots to select a layer. If you select a ring layer, handles appear on the circle itself. Drag the radius handle to change the circle size. Drag the red sweep handle to change the arc length. The sweep snaps to dot positions along the ring path.

Look right above your selected layer for the floating quick bar. Tap `TONE` to cycle through brightness levels. Tap `LATTICE -` or `LATTICE +` to change dot spacing. Coarser lattices place bigger dots further apart, like the displays on real lab gear.

## Type text in place

<!-- VISUAL: kind=steps · what=typing DOTS with T tool · notice=5x7 font rendered in dots with blinking caret between glyph gaps -->

Press `T` to pick the Text tool, then click inside your frame. An invisible input field catches your keys. Type words straight onto the card.

Your letters show up in dots using the 5 by 7 pixel hardware font. All characters convert to uppercase, up to 64 letters long. A cursor blinks in the gap between letters. Click inside the text to move the cursor to a specific spot. Press Enter or click the canvas when you are done. The entire edit saves as a single undo step. Press Escape to cancel.

## Share your card as a link

<!-- VISUAL: kind=steps · what=top bar share action and link dialog · notice=share URL with compressed payload under 12,000 characters -->

Look at the top right bar and click `SHARE`.

The editor turns your card into JSON and squashes it with DEFLATE compression. It converts the compressed bytes into a base64 web link. The whole card fits inside the URL query string, well under the 12,000 character limit. The link copies straight to your clipboard.

Paste that link into another browser tab to test it. The site unpacks the URL and drops your card onto the canvas. Your friend gets the exact same card: layers, math formulas, and animation timeline.

## Build cards on a phone

<!-- VISUAL: kind=shot · what=phone layout with floating dock and bottom sheet · notice=44 px touch targets, bottom dock with tool icons, sheet at 60% detent -->

Open Dot/480 on your phone. The canvas fills the whole screen. A small top bar holds your back button, title, undo, redo, zoom level, and share button.

Look at the bottom of the screen. A floating dock sits above your thumb. The layers icon sits on the left. The tool buttons (`V`, `F`, `B`, `T`, `C`) sit in the center. The inspector icon sits on the right. Every button is at least 44 pixels wide for easy tapping. Drag with one finger on empty canvas to pan around. Pinch with two fingers to zoom.

Tap the inspector icon to open the bottom sheet. The sheet slides up over the canvas with three stop positions: peek at 36 percent of the screen, half at 60 percent, and full at 90 percent. Drag the top handle to change the height. The editor remembers the height you pick for each panel.

## Use mobile selection and gestures

<!-- VISUAL: kind=steps · what=long press menu and native share sheet on mobile · notice=selection bar above dock with DUP and DEL buttons, native share sheet popup -->

Look right above the dock for the selection bar. It gives you seven quick buttons: `SELECT`, `ALL`, `DUP`, `GROUP`, `COPY`, `PASTE`, and `DEL`. Tap `SELECT` to turn on multi-selection. While that mode is active, each tap adds or removes cards from your selection group, and the canvas stays put.

Hold your finger still on any card for 500 milliseconds. A popup menu appears above your touch point with six commands: `DUPLICATE`, `FORWARD`, `BACKWARD`, `TO FRONT`, `TO BACK`, and `DELETE`. Tap any command to apply it as one undo step.

When you want to share your card from your phone, tap `SHARE` in the top bar. The browser calls `navigator.share` and opens your phone's system share sheet. You can send your card link straight to Messages, Mail, or AirDrop.
