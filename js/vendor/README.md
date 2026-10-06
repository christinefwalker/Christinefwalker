# Identity browser files

`identity.js` is the distributed ESM entry point from `@netlify/identity` 2.0.0. Its only modification is resolving its declared dependency through the adjacent `identity-dependency.js` file rather than a bare module specifier.

`identity-dependency.js` is the distributed ESM dependency required internally by that package. Application code uses only `@netlify/identity` APIs. The dependency's original license is preserved alongside these files.

Both are served locally to avoid executing an authentication library from a third-party CDN. Re-copy the installed distributed files and update the local dependency import when upgrading the Identity package, then run the browser tests.
