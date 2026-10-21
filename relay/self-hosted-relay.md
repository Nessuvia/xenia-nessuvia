# Self-hosted relay

A multiplayer session's frames pass through a relay: [Centrifugo](https://centrifugal.dev/) running
on the host's own machine. Nothing of the developer's is in the path.

You need two programs running: Centrifugo, which is the relay, and `cloudflared`, which gives it a
public address the browser will accept. Both are single binaries with no installer. On Windows,
`centrifugo/relay.bat` starts both and prints the address to paste in.

Sync is unaffected. It goes to your own Dropbox, and the two
share no settings.

## Quick guide, on Windows

**1. Download the two binaries.**
[Centrifugo](https://github.com/centrifugal/centrifugo/releases) and
[cloudflared](https://github.com/cloudflare/cloudflared/releases). Unzip each and put the `.exe` in
`centrifugo/`, beside `relay.bat`, or anywhere on PATH. `cloudflared` is also on winget, as
`Cloudflare.cloudflared`.

Run `relay.bat` first if you like: with a binary missing it prints where to get it and stops.

**2. Double-click `relay.bat`.** It starts Centrifugo, waits for the port, starts the tunnel, waits
for `Registered tunnel connection`, then checks the path end to end. On success it prints the
address and copies it to the clipboard:

```
wss://<something>.trycloudflare.com/connection/websocket
```

If a check fails it says which one and stops without printing an address. Work from the FAQ below.

**3. Paste it into the app.** Settings → Multiplayer.

**4. Press Test.** Fix what it reports before opening a room.

**5. Open a room.** The Multiplayer tab now offers "Your relay" beside the default. Pick it.

Leave the window open for as long as the session runs. Ctrl+C, or closing it, stops both programs.

The hostname changes every time the tunnel restarts, and invite links carry the hostname, so links
from one run are dead on the next. Steps 2 to 4 are the ones you repeat.

### What the script checks

Each step has to pass before it moves on, so the failure it reports is the first thing that actually
broke rather than a symptom further down.

- **Binaries.** PATH, then beside the script, then `bin/`, then the working directory.
- **`config.json`.** Beside the script unless `-Config` says otherwise.
- **Centrifugo's port.** A TCP connect to `localhost:8000`, retried for 10 seconds. On failure it
  prints Centrifugo's log.
- **The tunnel.** `Registered tunnel connection` in the `cloudflared` log, not the boxed hostname,
  which prints well before the tunnel is up. On failure it recognises the port 7844 text and points
  at the VPN entry below.
- **The path.** A request to `https://<hostname>/connection/websocket`, expecting `400`. Centrifugo
  rejecting a request that is not a websocket handshake proves the path reached it. Any other status
  is reported and the address is still printed. No response at all is a DNS or TLS failure, and there
  the script stops, because the browser resolves the same name the same way.

Parameters: `-Port`, `-Config`, `-Protocol` (`http2`, `quic` or `auto`; `http2` is the default and
the reason is in the FAQ). Logs from both programs are kept in a temp folder, named at the end of a
successful run.

## Doing it by hand

The script is Windows-only, and this is what it runs. Download the two binaries as in step 1 above,
and put `config.json` from `centrifugo/` beside the Centrifugo binary.

**1. Start Centrifugo.**

```sh
centrifugo --config config.json
```

You should see a startup banner ending in a line with `"port":8000`. Leave it running.

**2. Start the tunnel, in a second terminal.**

```sh
cloudflared tunnel --protocol http2 --url http://localhost:8000
```

<sub>On `--protocol http2`, see [cloudflared retries forever and never prints a hostname](#cloudflared-retries-forever-and-never-prints-a-hostname).</sub>

You should see a boxed hostname, then a line reading `Registered tunnel connection`. That second
line is the one that matters. Without it the tunnel is not up, whatever the box says. Leave it
running.

**3. Check the tunnel reached Centrifugo.**

```sh
curl -o /dev/null -w '%{http_code}\n' https://<something>.trycloudflare.com/connection/websocket
```

You should see `400`.

**4. Build the address** from the hostname in step 2, with the scheme swapped and Centrifugo's path
appended:

```
wss://<something>.trycloudflare.com/connection/websocket
```

Then continue from step 3 of the quick guide.

## Detailed guide

### Why a public address is needed at all

The app is served over https, so the browser will not open a plaintext websocket from it. A
`ws://localhost:8000` address cannot work no matter what the relay is doing. The browser blocks it
as mixed content and there is no override. So the relay needs a hostname with a real certificate,
and `cloudflared` is the shortest route to one.

Tailscale Funnel works the same way and is public in the same sense: guests do not need Tailscale. A
domain plus Caddy or a reverse proxy with a Let's Encrypt certificate is the answer if you already
run one. A named Cloudflare tunnel on a domain you own is what fixes the changing hostname.

### What `config.json` does

Five things in it matter. The rest is Centrifugo's defaults.

**Anonymous connections.** `client.allow_anonymous_connect_without_token`. Nobody signs in, host
included, so no client has a JWT. Every connection is anonymous with an empty user id.

**The `mp` namespace.** Sessions live on `mp:<sessionId>`, where the session id is 22 unguessable
characters. Anonymous clients need `allow_subscribe_for_anonymous` and `allow_publish_for_anonymous`
on it. The host and the guests all publish.

**Presence and join/leave.** `presence`, `join_leave` and `force_push_join_leave`. Without the
pushes, a guest who closes their tab stays in the roster forever. A dropped connection is the only
signal there is that they are gone.

An anonymous connection's presence entry has no identity in it, because Centrifugo fills `user` and
`connInfo` from the JWT and there is no JWT. So the channel layer does not read identity from
presence. Each client announces itself on the channel and everyone maps Centrifugo's connection id
to a participant; a leave push is resolved through that map. This is why the namespace needs publish
permission even for a client that only listens.

**Message size.** `websocket.message_size_limit` is raised to 262144, over Centrifugo's default of
65536. The protocol's own cap is 240 KB (`maxEventBytes` in `core/multiplayer/protocol.ts`), because
the opening `state` frame carries downscaled avatars for every character and every participant.

**Allowed origins.** `client.allowed_origins` lists the sites whose pages may open a connection. Drop
the `localhost:5173` entry when not developing.

### What the tunnel is doing

`cloudflared` opens an outbound connection to the Cloudflare edge and holds it open. Requests to the
`trycloudflare.com` hostname arrive at Cloudflare, travel back down that held-open connection, and
land on `localhost:8000`. Nothing listens on your machine from outside, and no router port is
forwarded.

The connection runs on port 7844, to the address range `198.41.192.0/24` and `198.41.200.0/24`.
Nothing else you run talks to that range or that port, which is why a network that carries every
other request can still fail here. That is the single most common thing to go wrong, and the FAQ
below covers it.

### What Test actually checks

The Test button subscribes to an empty channel. That exercises the endpoint, the certificate, the
origin list and anonymous subscribe permission in one go, which is most of what can be misconfigured.

The relay choice in the Multiplayer tab is per session. The Settings value is only the default a new
session starts from.

## FAQ

### cloudflared retries forever and never prints a hostname

Or it prints one and follows it with `failed to dial to edge with quic`, backing off a little longer
each time. Either way the tunnel never registered.

`cloudflared` runs a connectivity precheck at startup and prints a table. Read the UDP and TCP rows
separately, because they mean different things.

**UDP fails, TCP passes.** QUIC is blocked and HTTP/2 is not. Home routers block outbound UDP often
enough that this is the usual case, and `cloudflared` says so itself on the precheck's last line, as
`suggested_protocol=http2`. Adding `--protocol http2` fixes it, and the tunnel is identical once it
is up. It costs nothing when UDP works, so the script passes it by default and it is in the command
above. `-Protocol quic` or `-Protocol auto` overrides it.

**TCP fails too.** The edge range is unreachable, and the flag will not help. See the next entry.

### cloudflared says "Allow outbound TCP on port 7844"

Usually the port is fine and this message is pointing at the wrong thing. `cloudflared` infers a port
block from a failed connect, and cannot tell that apart from a route that does not go anywhere.

Check the port against a host outside Cloudflare's range:

```sh
curl -sS --connect-timeout 5 http://portquiz.net:7844 >/dev/null && echo "7844 is open"
```

If that succeeds while the precheck fails, the port is open and the route is the problem. **A VPN is
the usual cause.** It holds the default route, and Cloudflare's tunnel edge range does not route
through it. Mullvad and Tailscale, WireGuard included, and the commercial clients all do this.

The fix is to exclude the `cloudflared` binary from the VPN by its executable path. Mullvad calls
this split tunneling; others call it split routing or an app exclusion. Two things to know:

- The exclusion is read when the process starts, so a `cloudflared` already running keeps the old
  route until you restart it.
- Excluding it means Cloudflare sees your real IP for the tunnel connection. Guests never do, they
  only ever resolve the `trycloudflare.com` hostname.

Disconnecting the VPN for the session also works, and costs more privacy than excluding one binary.

### The tunnel registered but the hostname does not resolve

The script says `The address is not reachable from this machine`, or by hand the tunnel is registered
and the address still fails with "transport closed". Check whether the hostname has an IPv4 address:

```sh
nslookup -type=a <something>.trycloudflare.com
```

If that comes back empty, ask a resolver that does no filtering:

```sh
nslookup -type=a <something>.trycloudflare.com 1.1.1.1
```

The script runs both of these itself and reports which of three cases it found. Read the answer to
the second one carefully, because the three need different fixes and only one of them is about the
record being missing.

When the public resolver has the record and yours does not, **your DNS server is blocking it.**
Blocklists cover `trycloudflare.com` subdomains fairly often, since quick tunnels get used for
phishing. AdGuard DNS (`94.140.14.*`) and Mullvad DNS (`194.242.2.*`) both do this. AdGuard answers
NXDOMAIN and Mullvad answers REFUSED. The AAAA record can survive the filter while the A record does
not, which looks like a working lookup until something tries to connect, because a machine with no
global IPv6 address cannot use an AAAA-only answer.

The fix is to point the adapter at an unfiltered resolver, or allowlist the domain in whichever
service those addresses belong to. Check the adapters rather than the VPN client, which the script
also prints on failure:

```sh
Get-DnsClientServerAddress -AddressFamily IPv4
```

Two things this catches. A VPN can leave its DNS servers configured on an adapter after the client is
switched off. And a connected VPN adds a resolver of its own that takes precedence over every
adapter, so setting Wi-Fi to `1.1.1.1` changes nothing while it is up.

**If the query to `1.1.1.1` times out, it proved nothing.** A connected VPN blocks direct queries to
a resolver of your choosing, which looks the same as a record that does not exist. Disconnect it and
ask again before believing either answer.

This is a different failure from the port 7844 entries above, and the fix for those does not apply.
Excluding `cloudflared` from a VPN changes nothing here, because the lookup that fails is the
browser's, not the tunnel's.

A stale negative cache can also do it, if the name was looked up before the tunnel existed. Run
`ipconfig /flushdns` before concluding anything.

### The link shows "Error 1033"

The tunnel is not registered, so Cloudflare has the hostname but nothing to send it to. The relay is
not involved and restarting Centrifugo will not help. Look at the `cloudflared` terminal, or at
`cloudflared.err.log` in the script's temp folder, and work from the two entries above.

### The app says "transport closed"

Same cause as Error 1033, seen from the other side. Check the tunnel before anything else.

If the tunnel is registered and `curl` returns `400`, then the connection is being refused rather
than lost, and `client.allowed_origins` in `config.json` is the thing to check: it has to list the
site you are loading the app from.

### The path check returns something other than 400

The script prints this as `Path check returned <code>`, and `curl` gives the same codes by hand.

- **`400`** is success. Centrifugo is there and rejecting a non-handshake request.
- **`530`** is Error 1033. The tunnel is down.
- **`404`** means the hostname works but the path is wrong. The address ends in
  `/connection/websocket`.
- **`502`** means the tunnel is up but nothing is listening on port 8000. Centrifugo is not running,
  or started on a different port.

No code at all is the entry below, not one of these: the request never got far enough to be answered.

### cloudflared says "Failed to initialize DNS local resolver"

Ignore it. That is a separate `cloudflared` feature and has nothing to do with the relay. If
`Registered tunnel connection` appeared, the tunnel is fine.

### Sessions work until someone has a picture, then break

`websocket.message_size_limit` is at Centrifugo's default. The opening frame carries avatars for
every character and participant, so a roster with pictures in it exceeds 65536 bytes and the
connection drops. Raise it to 262144 as in the supplied `config.json`. After the certificate, this is
the most likely thing to get wrong.

### Guests stay in the roster after closing their tab

`join_leave` and `force_push_join_leave` are missing from the `mp` namespace. A dropped connection is
the only signal there is that someone left, and without the pushes it never arrives.

## What the relay sees

Message text, personas, avatars and the shared appearance, in plaintext. Whoever runs the relay can
read all of it, which on this setup is you.

Nothing is stored. No history is configured on the namespace, so frames are relayed and dropped.

API keys never reach the relay. Model requests go from the host's browser straight to their provider,
the same as in single-player.
