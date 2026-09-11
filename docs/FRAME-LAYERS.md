# Foreground and See-through

Owner observed that the generated image darkened the owl and sleeping dragon because the old gradient mask faded the foreground layer inside those illustrations. Requested a foreground frame, then specified 90% opacity rather than 100%.

Default Foreground: the existing artwork is composited above the canvas/result at opacity 0.9, with fuller corner masks and a narrow fade into the open center. No provider image, exported sketch, or generated image bytes are changed. Frame size remains independently selectable as Big Frame or Balanced Frame.

`/?layer=foreground` selects the new treatment; `/?layer=see-through` restores the prior gradient masks. The selection persists in localStorage. Original artwork and the old CSS mask treatment remain available.

Comparison screenshots frame-foreground.png and frame-see-through.png use the same previously generated synthetic cottage result in an isolated browser. The owner's real screenshot is private and not committed. CSS and persistence tests accompany visual inspection; no physical display-percentage calibration is claimed.
