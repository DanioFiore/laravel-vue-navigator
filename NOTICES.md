# Third-party notices

Laravel-Vue Navigator bundles the following open-source components into
`dist/extension.js` (published `.vsix`). Development-only tools (esbuild, Vitest,
ESLint, etc.) are **not** shipped in the extension package.

## Bundled runtime dependencies

### @babel/parser

- **Version:** 7.29.3 (see `package-lock.json`)
- **License:** MIT
- **Copyright:** Copyright (c) 2014-present Nicolás López Jullian and others
- **Homepage:** https://babel.dev/docs/en/babel-parser
- **Use in this extension:** Parse Vue/TS/JS source to locate `axios` calls and extract URL patterns.

### @babel/traverse

- **Version:** 7.29.0
- **License:** MIT
- **Copyright:** Copyright (c) 2014-present Nicolás López Jullian and others
- **Homepage:** https://babel.dev/docs/en/babel-traverse
- **Use in this extension:** Walk the AST to find call expressions at the cursor position.

### @babel/types

- **Version:** 7.29.0
- **License:** MIT
- **Copyright:** Copyright (c) 2014-present Nicolás López Jullian and others
- **Homepage:** https://babel.dev/docs/en/babel-types
- **Use in this extension:** AST node type guards during endpoint extraction.

### php-parser

- **Version:** 3.5.1
- **License:** BSD 3-Clause (see `node_modules/php-parser/LICENSE`)
- **Copyright:** Copyright (c) 2014, Glayzzle
- **Homepage:** https://github.com/glayzzle/php-parser
- **Use in this extension:** Fallback static parser for `routes/*.php` when Artisan is unavailable.

---

## MIT License (Babel packages)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## BSD 3-Clause License (php-parser)

Copyright (c) 2014, Glayzzle  
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.
- Neither the name of the copyright holder nor the names of its contributors
  may be used to endorse or promote products derived from this software without
  specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

For the license of Laravel-Vue Navigator itself, see [LICENSE](LICENSE).
