import http from 'node:http'
import { request } from 'node:https'

const PORT = Number(process.env.PORT || 8737)
const UPSTREAM = 'github.com'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,accept',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  if (req.method !== 'POST' || !/^\/login\/(device\/code|oauth\/access_token)$/.test(req.url)) {
    res.writeHead(404, CORS)
    res.end()
    return
  }

  const upstream = request(
    { host: UPSTREAM, port: 443, path: req.url, method: 'POST', headers: { accept: 'application/json', 'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded', 'content-length': req.headers['content-length'] || 0, 'user-agent': 's-oauth-proxy' } },
    (up) => {
      res.writeHead(up.statusCode || 502, { ...CORS, 'content-type': 'application/json' })
      up.pipe(res)
    },
  )
  upstream.on('error', (error) => {
    res.writeHead(502, { ...CORS, 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'proxy_error', error_description: error.message }))
  })
  req.pipe(upstream)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`GitHub OAuth loopback proxy listening on http://127.0.0.1:${PORT}`)
})
