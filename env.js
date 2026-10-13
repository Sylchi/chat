// GitHub Pages has no server-side environment, so public, non-secret config
// lives here. A GitHub OAuth client id is public and the device flow needs no
// client secret; the access token a user obtains stays sealed in their vault.
window.S_GITHUB_CLIENT_ID = 'Ov23liqAaieXqBJFU4HV'
// Optional: point these at a relay/proxy if you don't want the request to go
// through the service-worker Direct Sockets transport.
window.S_GITHUB_RELAY = window.S_GITHUB_RELAY || 'http://127.0.0.1:8737'
window.S_GOOGLE_CLIENT_ID = window.S_GOOGLE_CLIENT_ID || ''
