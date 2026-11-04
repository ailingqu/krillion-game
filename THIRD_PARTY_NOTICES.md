# Third-party notices

The root MIT license covers Cubes 2048's contributions. It does not replace
dependency licenses or grant third-party trademark rights.

| Component | Use | License / notice |
| --- | --- | --- |
| React and React DOM | Game UI runtime | MIT; package notices retained |
| Pixelify Sans | Game font | SIL Open Font License 1.1; [full notice](lib/games/krillion/assets/FONT-LICENSE.txt) |
| esbuild, TypeScript and tsx | Development and build tools | Their installed package licenses apply |

`pnpm build` collects installed runtime license files into `public/licenses/`
and includes the project license and this file in `public/`. Both the game HTML
and portable preview embed full runtime and font notices in a non-executable text
block. Retain the notices when redistributing the static build. The pnpm lockfile
records exact dependency versions.

The question bank is compiled from the included categories and answer lists.
The game does not use the reference site's API. This repository contains only the
standalone game, without the main site's SaaS template, server/account/payment
code, analytics, cloud configuration, credentials or historical commits.
