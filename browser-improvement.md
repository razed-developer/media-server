# Browser Improvement Roadmap

This document tracks improvements needed to make the Onyx browser experience feel like a complete everyday media client while preserving the desktop application as the server and administration console.

## Product boundary

The browser should support ordinary profile-level actions that a household member expects while watching, listening, or discovering media.

The desktop application should remain responsible for operations that directly manage the host computer, server filesystem, credentials, provider configuration, caches, and installation.

### Keep desktop-only

- Initial server setup
- Adding, removing, or browsing local media folders
- Library scans and rescans
- TMDB and other metadata-provider credentials
- iBroadcast application Client ID
- Browser-access password configuration
- Live TV channel source configuration
- Server cache maintenance
- Direct filesystem identification corrections
- Server diagnostics and administrative activity controls

These boundaries can be revisited later if Onyx gains explicit remote-administrator roles and stronger authorization.

## Current browser baseline

The browser currently supports most everyday media consumption:

- Browse and play movies and television
- Existing subtitle playback
- Per-profile playback progress and history
- Reset watch status
- Profiles and themes
- Create, update, and delete playlists
- Hide and unhide media
- Viewing analytics
- iBroadcast connection, synchronization, browsing, and playback
- Live TV guide and playback
- Authenticated access through the shared server password

## Priority 1 — Complete profile features

### Avatar loading and selection

The browser should load the same built-in and custom avatars shown by the desktop application.

Add:

- Load avatars for every profile in the profile menu and household UI
- Select any built-in muted Onyx avatar
- Upload a custom avatar through the browser
- Preview, replace, and remove a custom avatar
- Validate image type and size on the server
- Authorize users to edit only their own avatar unless they are an administrator

Acceptance checks:

- Existing desktop-selected avatars appear correctly in the browser
- Changing an avatar in either client appears in the other after refresh
- Custom avatar files never expose local server paths
- Unsupported and oversized files produce a clear error

### Household reactions

Bring reactions to browser clients.

Add:

- Read reactions for movies, shows, and episodes
- Add, change, and remove the active profile’s reaction
- Update reaction counts without a full-page reload
- Display profile avatars consistently

Acceptance checks:

- Desktop and browser show the same reactions
- A user cannot edit another profile’s reaction
- Repeated clicks do not create duplicate records

### Recommendations

Bring household recommendations to browser clients.

Add:

- Recommend a movie, show, or episode to another profile
- Include an optional note
- List recommendations for the active profile
- Mark recommendations as read
- Open the recommended media directly

Acceptance checks:

- Recommendations created in either client appear in both
- A recommendation always resolves to the correct media when it remains available
- Read state is profile-specific and persistent

### Wishlist and media requests

Complete the partially available browser workflow.

Add:

- View the active profile’s wishlist
- Search TMDB and submit a request
- Change or withdraw the user’s own pending request
- Allow administrators to approve or decline requests from an authenticated browser session
- Display when requested media has been added to the library

Acceptance checks:

- Request state is identical between desktop and browser
- Ordinary users cannot approve or decline requests
- Duplicate requests are handled clearly

## Priority 2 — Browser playback parity

### Subtitle discovery

Existing subtitles should continue to work everywhere. Browser users should also be able to search for and download subtitles through the server.

Add:

- Search configured subtitle providers
- Preview language, release, hearing-impaired, and forced indicators
- Download a subtitle to the server
- Refresh the active player’s subtitle list without restarting playback
- Restrict provider credential configuration to desktop

Acceptance checks:

- Downloaded subtitles become available to every appropriate client
- Browser clients never receive provider credentials
- Failed downloads do not interrupt playback

### Playback compatibility reporting

Different browsers and televisions support different codecs.

Add:

- Detect browser playback capabilities
- Report the selected Direct Play, Remux, or Transcode mode
- Explain why transcoding was selected
- Provide a useful error when the browser rejects a stream
- Record client type and playback failure details in server activity
- Add remote-quality controls after segmented/HLS transcoding exists

Acceptance checks:

- Playback failures identify the client, format, and attempted playback mode
- Error messages offer a useful next action
- Capability checks do not falsely claim that playback succeeded

### Browser player resilience

Add:

- Restore playback after short network interruptions
- Better seeking during remuxed or transcoded playback
- Clear buffering and reconnecting indicators
- Resume playback after the page is reloaded
- Preserve selected subtitle and audio track when possible
- Prevent duplicate progress updates from multiple open tabs

## Priority 3 — Browser navigation and device experience

### TV and remote usability

Add:

- Verify directional navigation on major television browsers
- Strong, persistent focus indicators
- Predictable focus restoration after closing dialogs or returning from playback
- Back-button behavior that matches browser and television expectations
- Overscan-safe spacing and scalable text
- A reduced-motion option

### Mobile and tablet layout

Add:

- Touch-friendly navigation and context actions
- Replace right-click-only actions with visible overflow menus
- Responsive player controls
- Safe-area support
- Practical portrait and landscape layouts
- Installable Progressive Web App support if it improves the experience

### Connection state

Add:

- A clear server-disconnected screen
- Automatic reconnection with bounded retries
- Preserve the current page while reconnecting
- Explain authentication expiry separately from server failure
- Show when the desktop server must be started

## Priority 4 — Security and authorization

The shared browser password currently protects the server, while profiles are selected inside that authenticated session. More browser capabilities require stronger authorization.

Add:

- Optional per-profile PINs
- Explicit administrator authorization for administrative browser actions
- Session expiry and session revocation
- A list of signed-in browser sessions
- CSRF review for state-changing browser endpoints
- Rate limits for login and sensitive actions
- Audit entries for profile and administrator changes

Do not expose filesystem paths, provider tokens, password hashes, credential-store contents, or unrestricted server commands through browser APIs.

## Shared implementation requirements

Every browser feature should:

- Use the same domain service as its desktop equivalent instead of duplicating business rules
- Have one HTTP API boundary with explicit authorization
- Return structured errors that the interface can explain
- Preserve profile isolation
- Work over the LAN and through the supported Tailscale/reverse-proxy setup
- Avoid requiring direct internet access from the browser when the server can proxy safely
- Include desktop/browser parity tests for shared behavior
- Degrade gracefully when an optional provider is not configured

## Suggested delivery order

1. Browser avatar loading and built-in selection
2. Reactions
3. Recommendations
4. Wishlist viewing and request management
5. Subtitle discovery and download
6. Connection and playback failure handling
7. Mobile and television interaction polish
8. Per-profile PINs and remote-administrator authorization
9. Advanced playback quality and HLS controls

Each item should be delivered as a vertical slice: server/domain support, browser API, interface, authorization, error states, and verification together.
