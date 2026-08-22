# Connecting iBroadcast to Onyx

This document records the complete iBroadcast OAuth integration path that ultimately worked in Onyx, including the failed approaches and the exact details that mattered. It is intended both as project documentation and as a practical reference for anyone integrating iBroadcast into another desktop or self-hosted application.

## Executive summary

The working solution uses **OAuth 2.0 Authorization Code + PKCE** with a localhost callback.

The key requirements were:

- Create an iBroadcast developer application using the **Authorization Code** grant type.
- Register the exact redirect URI that the application will send.
- Use a stable localhost callback, in Onyx:

  ```text
  http://127.0.0.1:8770/oauth/ibroadcast/callback
  ```

- Send the redirect parameter as **`redirect_uri`** in the authorization URL.
- Send the same **`redirect_uri`** again when exchanging the authorization code for tokens.
- Use PKCE with a `code_verifier` and SHA-256 `code_challenge`.
- Validate OAuth `state` when the callback arrives.
- Store access and refresh tokens securely per Onyx user/profile.
- Keep the iBroadcast integration compartmentalized from the rest of the media server.

The most important practical lesson is that the redirect URI must match the value stored in the iBroadcast developer application **exactly, byte for byte**.

---

## 1. Developer application setup

In the iBroadcast web player:

1. Open **Apps → developer**.
2. Create a new application.
3. Give it a name such as `Onyx`.
4. Upload a **128 × 128 PNG** application image.
5. Set **Grant Type** to:

   ```text
   Authorization Code
   ```

6. Set the Redirect URI to exactly:

   ```text
   http://127.0.0.1:8770/oauth/ibroadcast/callback
   ```

7. Save the application.
8. Copy the generated **Client ID** into the application settings.

Onyx does not need the developer app's Client Secret for the PKCE flow described here.

### The redirect URI must be exact

OAuth redirect URI comparison is strict. These are all different values:

```text
http://127.0.0.1:8770/oauth/ibroadcast/callback
http://localhost:8770/oauth/ibroadcast/callback
http://127.0.0.1:8770/oauth/ibroadcast/callback/
http://127.0.0.1:8765/oauth/ibroadcast/callback
https://127.0.0.1:8770/oauth/ibroadcast/callback
```

If the value registered with iBroadcast differs from the value sent by the application, iBroadcast returns an error similar to:

```json
{
  "error": "invalid_client",
  "error_description": "Invalid client: `redirect_uri` does not match client value"
}
```

That error was the final clue that the OAuth flow itself was correct and only the registered callback value differed.

---

## 2. Why Device Code did not work for this app

The first implementation used iBroadcast's Device Code flow because it looked attractive for a TV-oriented application.

Onyx successfully obtained a device code, but the token endpoint rejected the grant with:

```text
Unauthorized client: `grant_type` is invalid
```

A compatibility attempt using another device-code grant form then returned:

```text
Invalid client: cannot retrieve client credentials
```

The important discovery came from the iBroadcast developer application page: the app had been configured for **Authorization Code**, not Device Code.

That meant the Client ID was real and recognized, but that application was not authorized to use the device-code grant.

### Lesson

Do not choose an OAuth flow only because it seems best for the user interface. The flow must match the grant type configured for the developer application.

For this iBroadcast app, Authorization Code + PKCE was the correct choice.

---

## 3. Authorization Code + PKCE flow

The final connection flow is:

```text
Onyx
  ↓
Generate PKCE verifier/challenge + OAuth state
  ↓
Open iBroadcast authorization URL in system browser
  ↓
User signs in and approves Onyx
  ↓
iBroadcast redirects to localhost callback
  ↓
Onyx validates state
  ↓
Onyx exchanges authorization code + PKCE verifier for tokens
  ↓
Tokens stored securely for the current Onyx profile
  ↓
Onyx synchronizes the user's iBroadcast library
```

This works well for a Tauri desktop application because the browser handles iBroadcast login while the desktop application owns the localhost callback.

---

## 4. PKCE generation

Generate a random verifier between 43 and 128 characters.

For example, Onyx uses a long random UUID-derived value.

Then calculate:

```text
code_challenge = BASE64URL(SHA256(code_verifier))
```

The Base64 encoding must be URL-safe and omit `=` padding.

The authorization request includes:

```text
code_challenge=<generated challenge>
code_challenge_method=S256
```

The original `code_verifier` is retained only until the OAuth callback and token exchange complete.

---

## 5. OAuth state

Generate a separate random `state` value before opening the authorization page.

Send it in the authorization URL:

```text
state=<random value>
```

When iBroadcast redirects back to the localhost callback, compare the returned `state` with the original value.

If they do not match, reject the callback.

This protects the OAuth flow against request forgery and accidental callback mix-ups.

---

## 6. Authorization URL

The authorization endpoint is:

```text
https://oauth.ibroadcast.com/authorize
```

The working request contains at least:

```text
response_type=code
client_id=<client id>
state=<random state>
code_challenge=<PKCE challenge>
code_challenge_method=S256
scope=user.account:read user.library:read offline_access
redirect_uri=http://127.0.0.1:8770/oauth/ibroadcast/callback
```

### Important: use `redirect_uri`

This caused significant confusion.

At one point iBroadcast returned:

```json
{
  "error": "invalid_argument",
  "error_description": "Missing parameter: `redirectUri`"
}
```

It was tempting to interpret that error literally and send:

```text
redirectUri=...
```

That did **not** work.

The maintained iBroadcast Python OAuth implementation uses the standard OAuth parameter:

```text
redirect_uri
```

Once Onyx matched that implementation, the authorization request proceeded correctly.

### Lesson

Do not assume an API error message's internal field name is necessarily the HTTP parameter name. When documentation is ambiguous, compare against a maintained working client.

---

## 7. Local callback listener

Before opening the browser, Onyx creates a temporary listener on:

```text
127.0.0.1:8770
```

It expects one request at:

```text
/oauth/ibroadcast/callback
```

The listener remains alive only while authorization is pending, then shuts down after success, failure, or timeout.

A five-minute timeout is reasonable for a desktop OAuth flow.

### Why `127.0.0.1` instead of `localhost`

Either can technically represent the local machine, but OAuth redirect matching is exact. Choosing one canonical URI avoids ambiguity.

Onyx uses:

```text
http://127.0.0.1:8770/oauth/ibroadcast/callback
```

and the same value is used everywhere:

- developer app configuration
- authorization URL
- token exchange
- setup instructions
- Settings UI
- documentation

---

## 8. Callback handling

A successful callback resembles:

```text
http://127.0.0.1:8770/oauth/ibroadcast/callback?code=...&state=...
```

The application should:

1. Parse the query string.
2. Check for an OAuth `error` first.
3. Verify the returned `state`.
4. Extract the authorization `code`.
5. Exchange the code for tokens.
6. Return a small browser page telling the user they can close the tab and return to the application.

For example:

```text
iBroadcast connected
Authorization completed successfully.
You can close this tab and return to Onyx.
```

Do not leave the browser sitting on an empty localhost response.

---

## 9. Token exchange

The token endpoint is:

```text
https://oauth.ibroadcast.com/token
```

Use a form-encoded POST request.

The working Authorization Code + PKCE request is conceptually:

```text
grant_type=authorization_code
client_id=<client id>
code=<authorization code>
redirect_uri=http://127.0.0.1:8770/oauth/ibroadcast/callback
code_verifier=<original PKCE verifier>
```

The `redirect_uri` sent here must match the one used during authorization and the one registered with the iBroadcast application.

A successful response contains an access token and may contain a refresh token, expiration information, and scope information.

---

## 10. Refresh tokens

Request the `offline_access` scope if the application needs long-lived access.

When the access token is close to expiration, refresh it through the same token endpoint.

A refresh request should include:

```text
grant_type=refresh_token
client_id=<client id>
refresh_token=<stored refresh token>
redirect_uri=http://127.0.0.1:8770/oauth/ibroadcast/callback
```

If iBroadcast returns a new refresh token, store it. If it does not, retain the existing refresh token.

Onyx refreshes shortly before expiry rather than waiting for an API call to fail.

---

## 11. Secure token storage

Do not put OAuth access or refresh tokens in:

- the public GitHub repository
- frontend JavaScript state longer than necessary
- browser localStorage
- plaintext configuration files
- logs or activity-console entries

Onyx stores tokens per user/profile using the operating system credential store.

The credential identity is conceptually:

```text
Service: Onyx iBroadcast
Account: profile:<onyx-user-id>
```

This is important because Onyx supports multiple local users, and each profile may connect a different iBroadcast account.

The iBroadcast Client ID is server-wide, while OAuth tokens and cached music state are user-specific.

---

## 12. Per-user architecture

The provider should not assume one global iBroadcast identity.

A clean model is:

```text
Onyx User A
├── own iBroadcast access token
├── own refresh token
├── own cached iBroadcast library
└── own provider identity

Onyx User B
├── different iBroadcast access token
├── different refresh token
├── different cached iBroadcast library
└── different provider identity
```

This mirrors the rest of Onyx's user-specific state such as watch history, playlists, themes, and hidden media.

---

## 13. Library synchronization

After OAuth succeeds, Onyx retrieves iBroadcast account status and library data using Bearer authentication.

The library is normalized into provider-specific Onyx structures rather than inserted into the Movies/TV database.

Conceptually:

```text
Artist
  └── Album
       └── Track

Playlist
  └── Track IDs
```

The integration currently supports locating music by at least:

- artist
- album
- artist + album
- track
- playlist

Cached provider data lives separately from the video library, e.g.:

```text
providers/
  ibroadcast/
    <onyx-user-id>/
      library.json
```

That makes the entire music provider removable without migrating the core movie/TV library.

---

## 14. Streaming architecture

Onyx proxies iBroadcast playback through the Rust server instead of exposing provider credentials to browser clients.

```text
Browser / Tauri UI
      ↓
Onyx Rust server
      ↓
iBroadcast stream lookup / streaming service
```

Advantages:

- OAuth credentials stay server-side.
- Browser clients do not need to understand iBroadcast's streaming URL format.
- Future API changes remain isolated in the provider module.
- Remote browser clients use the same Onyx music API as the desktop UI.

---

## 15. The 128 × 128 application icon

iBroadcast requires a **128 × 128 PNG** for the developer application.

Earlier Onyx documentation and assets incorrectly referred to 512 × 512 and included a damaged image. The reliable solution was to generate the logo directly in Onyx at exactly 128 × 128 pixels and save those exact PNG bytes.

The application should provide:

- a preview of the exact image
- a native Save dialog on desktop
- confirmation showing the exact saved path
- browser-download fallback when using the web client

This avoids maintaining a second manually resized developer-app asset that can drift or become corrupted.

---

## 16. Errors encountered and what they meant

### `Unauthorized client: grant_type is invalid`

Cause:

The application was configured for **Authorization Code**, while Onyx was trying to use Device Code.

Resolution:

Switch the application implementation to Authorization Code + PKCE.

---

### `Invalid client: cannot retrieve client credentials`

Cause:

This appeared while attempting an alternate/compatibility Device Code grant form.

Resolution:

Stop attempting to force Device Code onto an Authorization Code application.

---

### `Missing parameter: redirectUri`

Cause:

The initial Authorization Code URL did not include a redirect parameter.

A first attempted fix used `redirectUri` literally because that is what the error message named. That still failed.

Resolution:

Use the actual OAuth parameter used by iBroadcast's maintained client:

```text
redirect_uri
```

---

### `Invalid client: redirect_uri does not match client value`

Cause:

The authorization request was now correctly formed, but the URI saved in the iBroadcast developer application differed from the one Onyx sent.

Resolution:

Make the configured developer-app value exactly:

```text
http://127.0.0.1:8770/oauth/ibroadcast/callback
```

Once that value matched exactly, the OAuth connection succeeded.

---

## 17. Recommended implementation structure

Keep iBroadcast isolated behind provider-specific modules.

For example:

```text
ibroadcast.rs
  library/status/streaming/token refresh

ibroadcast_oauth.rs
  authorization URL
  PKCE
  localhost callback
  code exchange
  secure token creation
```

The UI should talk to Onyx abstractions such as:

```text
connect iBroadcast
sync library
list artists
list albums
list tracks
list playlists
stream track
```

rather than depending directly on iBroadcast response formats.

That compartmentalization proved useful during development because the OAuth implementation changed substantially without requiring changes to Movies, TV, metadata, or playback architecture.

---

## 18. UX recommendations

A good connection screen should show:

```text
iBroadcast

Client ID
[ ... ]

Required Redirect URI
http://127.0.0.1:8770/oauth/ibroadcast/callback
[ Copy ]

[ Connect iBroadcast ]
```

The setup instructions should explicitly say:

1. Create the iBroadcast developer app.
2. Select **Authorization Code**.
3. Copy the exact Redirect URI from Onyx into iBroadcast.
4. Upload the provided 128 × 128 PNG.
5. Copy the Client ID into Onyx.
6. Save the developer app.
7. Click Connect.
8. Approve access in the browser.
9. Return to Onyx after the success page appears.

Do not expect users to infer the correct callback URI from developer documentation.

---

## 19. Debugging recommendations

Log high-level OAuth state changes, but never secrets.

Useful events:

```text
iBroadcast authorization started
Local callback listener opened
OAuth callback received
OAuth state validated
Authorization code received
Token exchange succeeded
iBroadcast credentials stored
Initial library sync started
Initial library sync completed
```

Never log:

- access tokens
- refresh tokens
- PKCE verifier
- developer client secret
- session cookies
- full token responses

Onyx's Activity console is a good place for these sanitized events.

---

## 20. What to verify before blaming the code

When an iBroadcast OAuth connection fails, check these in order:

1. Is the developer app using the same grant type as the application implementation?
2. Is the Client ID copied correctly?
3. Is the Redirect URI saved in the developer application?
4. Does it match the application's URI exactly?
5. Is the application sending `redirect_uri`, not an assumed variation?
6. Is the same redirect URI sent again during token exchange?
7. Is PKCE using S256 and a valid verifier length?
8. Does the callback `state` match?
9. Is the localhost port already in use?
10. Can the OS/browser reach `127.0.0.1` on the selected port?

This order would have shortened the original Onyx debugging process considerably.

---

## 21. Final known-working configuration for Onyx

```text
Grant type:
Authorization Code

Authorization endpoint:
https://oauth.ibroadcast.com/authorize

Token endpoint:
https://oauth.ibroadcast.com/token

Redirect URI:
http://127.0.0.1:8770/oauth/ibroadcast/callback

PKCE:
S256

Scopes:
user.account:read user.library:read offline_access

Authorization redirect parameter:
redirect_uri

Token exchange redirect parameter:
redirect_uri
```

This is the configuration that ultimately produced a successful iBroadcast connection in Onyx.

---

## 22. Main lessons for future projects

The hardest part of this integration was not implementing OAuth primitives. It was aligning four things that all had to agree:

```text
Developer app configuration
        ↕
OAuth grant type
        ↕
Authorization request parameters
        ↕
Exact redirect URI
```

A mismatch in any one of those can produce errors that appear to implicate a different part of the system.

For future integrations:

- Inspect the provider's developer-app configuration before selecting an OAuth flow.
- Prefer PKCE for desktop applications where supported.
- Centralize redirect URIs in one constant.
- Display the exact redirect URI in the application's setup UI.
- Treat redirect matching as exact, not approximate.
- Compare ambiguous documentation against a maintained working client.
- Keep provider integrations modular so authentication can be replaced without refactoring the whole application.
- Record failed approaches as well as the final solution; the errors are often the most useful documentation for the next project.
