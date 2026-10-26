# Third-party notices

This is an independent Galley fork of
[dprint-plugin-markdown 0.28.0](https://github.com/dprint/dprint-plugin-markdown/tree/a49e479f3e38c18ea915a4b68708bcd69894b245),
commit `a49e479f3e38c18ea915a4b68708bcd69894b245`. It is not an official
dprint or MDX project.

The upstream Rust formatter, configuration, parser, HTML formatter, language
mapping, regression tests, and configuration schema are used under the MIT
license. Copyright (c) 2020–2023 David Sherret. The full upstream license is
retained in [LICENSE-MIT](LICENSE-MIT). All upstream `src/` files except the
new `mdx.rs`, and the imported `tests/` tree, originate in that revision.

Galley's additions and modifications are licensed under MPL-2.0; see [LICENSE](LICENSE).
These include the MDX adapter, plugin identity and routing changes, build and
packaging scripts, and new tests. The original MIT permissions and notices remain
in force for the upstream material. The combined distribution therefore declares
`MPL-2.0 AND MIT`. Source is included in the npm package and maintained in
[the Galley repository](https://github.com/jeremybanka/galley).

The generated language mapping in `src/code_block_tags/linguist_generated.rs`
comes from [GitHub Linguist v9.7.0](https://github.com/github-linguist/linguist/tree/v9.7.0).
Copyright (c) 2017 GitHub, Inc. Its MIT license follows:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
