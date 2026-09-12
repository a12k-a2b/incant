# Owl post

The painted owl is an Android share-sheet entry point. It prepares a durable copy of the selected image, then uses a fresh button tap to invoke Web Share with image file plus a private viewing/reply link where supported. That second tap preserves browser user activation after the cloud upload. Copy link is an explicit fallback, never a claimed send.

## Receipt meanings

- Ready: the selected image is stored and the link exists; nothing was sent.
- Handed to sharing app: Web Share resolved. This does not prove sending or delivery.
- Opened: a link holder explicitly tapped Open letter. Preview GETs do not create this receipt. Recipients are told that opening reports this event. This does not identify the person or detect attachment views.
- Replied: an image was durably written through the recipient page. Replies to the email or SMS itself are not imported. Each reply has a retry-stable ID.

The owl polls while the room is foregrounded. New replies cause a visual envelope and a two-note hoot after audio is enabled by interacting with the owl. It does not promise background notifications from a closed PWA. Sound can be muted. The room passphrase is shared, so its post tray is shared too; recipient identities are not verified.

## Storage and access

`/data/incant-owl-v1` (or `INCANT_OWL_PATH` locally) is separate from the sketch archive. It retains copies and replies using fsync plus atomic manifest replacement. Single-process per-letter serialization prevents concurrent lost updates; the deployment uses one Railway service instance with one volume. Original sketches and generation archives are never modified by post.

Recipient links contain an unguessable 256-bit secret in the URL fragment. It is sent to `/api/owl-public` in a header, not query strings or referrers. The room-authorized `/api/owl` route alone can enumerate letters, mark handoffs, revoke links, or fetch replies. Public links expose one image and allow replies only for that letter. Links expire after 30 days or can be closed; that does not delete recipients' saved copies or existing room replies. No mailbox, email/SMS credentials, or contact records are used.

Limits: 6 MB stored PNG, dimensions up to 2048×2048; recipient uploads normalized to PNG at max 1536 pixels; ten replies per letter, thirty new letters per day, one thousand letters total. Writes preserve 128 MB free space to avoid crowding out the existing archive. Missing durable storage fails closed. APIs and images are no-store; service worker already excludes `/api/`.

## Release failure conditions (before affected full QA)

FAIL if unauthenticated callers can enumerate letters or read room replies; a forged or other-letter token opens content; a revoked/expired token works; a preview creates an opened receipt; cancel increments handoffs; a repeated reply produces duplicates; a restarted service loses acknowledged images/receipts; a new reply repeatedly hoots; or sharing exposes a different active image than the prepared link. BLOCKED for native Android share-sheet delivery and physical sound without a connected tablet. Synthetic browser sharing is not a send to a person.

Tests cover these boundaries with isolated HTTP servers, temporary storage, synthetic PNGs, mocked Web Share, and browser rendering. The initial browser recipient fixture used an undecodable one-pixel PNG; the client rejected it, and it was replaced with a valid generated test PNG. No recipient messages were sent in test runs.

The first full QA run caught the owl hotspot intercepting a canvas tap during voice listening. Its area is now clipped to the owl side of the frame and disabled hotspots have `pointer-events:none`. The failing voice-tap scenario is retained in `qa-owl-post/`; the final run is separate.

The [W3C Web Share specification](https://www.w3.org/TR/web-share/) defines successful sharing as handoff to a target or operating system, and allows targets to discard or combine fields. That is why the UI does not call a handoff “sent” and asks users to keep the link for receipts and replies.

Final affected QA: production build PASS, 11 unit tests PASS, 56 browser tests PASS (`qa-owl-post-final/`). Browser tests instrument audio generation and Web Share handoff; neither is evidence of physical Android delivery or speaker output. The DC-1 was not connected at the final device check.

Railway deployment `adb3a2d7-9918-41da-bf3c-674ce80dad3f` succeeded. Live isolated-browser checks passed for room authentication, recipient opening without a passphrase, no preview-open receipt, durable image reply, unauthorized reply access rejection, and revocation. The clearly labelled synthetic test letter was closed afterwards; it and its reply remain in the room's post tray. No email, SMS, or other external recipient messages were sent. Receipt: `docs/evidence/owl-hosted.json`.
