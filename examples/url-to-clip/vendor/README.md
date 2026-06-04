# vendor/

This folder must contain the Ableton Extensions SDK + CLI tarballs that
`package.json` references via `file:` paths:

- `ableton-extensions-sdk-<version>.tgz`
- `ableton-extensions-cli-<version>.tgz`

They are **not** included in this repository — the Extensions SDK is Ableton's
private beta. Get them from Ableton's beta programme and drop them here, then run
`npm install`.
