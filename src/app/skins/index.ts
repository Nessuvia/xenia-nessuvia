// Every skin stylesheet, imported for their side effect. Kept apart from skins.ts: that file stays
// importable by `node --experimental-strip-types`. The check scripts cannot parse a CSS import.
// A new skin is a line here and an entry in `skins`.
import './glass.css'
