# Image tools: one Codex generation entry

Provider Hub 0.6.4 exposes one Codex tool for text-to-image generation,
reference-based generation, composition and editing:

```text
image_generate_codex(prompt, imagePaths?)
```

The tool name describes the desired output, not the upstream HTTP endpoint or
the number of reference images. One request can use multiple inputs but still
returns **one image**.

| Tool | Input | Identity / billing |
|---|---|---|
| `image_generate_codex` | Text, optionally 1–5 ordered local images | Current ChatGPT / Codex login |
| `image_generate_zai` | Text only | International Z.AI standard paid image API |
| `image_generate_zai_cn` | Text only | Domestic Zhipu standard paid image API |

Enabled providers are alternatives, not an automatic batch or fallback chain.
Unknown parameters are rejected rather than ignored.

## Inputs

- `prompt` — required description of the desired output. When supplying images,
  explain what each contributes and what should be preserved or changed.
- `imagePaths` — Codex only, optional ordered list of 1–5 local PNG, JPEG or WebP
  files. Put the primary image first, then additional references. Relative paths
  use the session working directory; absolute paths must still be readable in
  the caller's execution world.
- `aspectRatio` — optional hint: `auto` (default), `1:1`, `3:2`, `2:3`, `16:9`,
  or `9:16`. It is not an exact size guarantee.
- `background` — Codex only: `auto` (default), `opaque`, or `transparent`.

Omitting `imagePaths` entirely means text-only generation. Supplying the field
selects reference mode: `[]`, `null`, the wrong type, unreadable paths or invalid
images are errors, **not** instructions to fall back to text-only generation.
Explicit `undefined` is not a JSON value and is also rejected. Z.AI tools reject
`imagePaths`; they do not silently ignore it.

There is no public operation/mode switch, model override, resolution, quality,
output-directory, batch-count or mask parameter. The tool owns the output
filename and attachment storage. Remote URLs, data URLs and raw base64 are not
accepted as paths; the tool reads and encodes validated local bytes itself.

### Text-to-image

Call `image_generate_codex`:

```json
{
  "prompt": "A natural daylight photograph of a green teapot on a pale desk, no text.",
  "aspectRatio": "3:2",
  "background": "opaque"
}
```

### Multi-reference generation or editing

Call the **same** `image_generate_codex`:

```json
{
  "prompt": "Keep the teapot shape and composition from the first image, make it orange, and use the second image for lighting only.",
  "imagePaths": ["photos/teapot.jpg", "photos/lighting-reference.jpg"],
  "aspectRatio": "3:2",
  "background": "opaque"
}
```

The caller need not decide whether this is a reconstruction, a composition or a
local edit. The desired output and each reference's role belong in `prompt`.
Do not promise unchanged pixels, perfect likeness or exact typography; read back
and compare the result before delivery. If the user requests sequential review,
finish and inspect one result before requesting another.

## Result

All image tools retain the existing shared result shape:

| Field | Meaning |
|---|---|
| `provider` | The provider actually used |
| `operation` | Backend route: `generate` without input images, `edit` with input images |
| `referenceCount` | Number of input images; `0` for text-only generation |
| `aspectRatio` | Requested ratio hint, or `auto` |
| `image` | Durable normalized **output preview** with attachment ID, media type, byte size and dimensions |
| `original` | Durable **output file** preserving returned bytes exactly: attachment ID, filename and byte size |
| `originalPath` | Optional output-file path readable in the caller's execution world |
| `imageForModel` | Whether the result includes an image block for the current model |
| `aspectWarning` | Optional requested/actual aspect warning for a visible deviation |

The existing `operation: edit` value describes Codex's images-with-inputs
transport, not a separate model-facing tool or a single-input limitation.
`original` means the service's original **output bytes**, never an input photo.
These field names remain stable for consumers of 0.6.3.

Every result includes a file attachment. Image-capable conversation models also
receive a preview image block; text-only models receive the file handle without
an unsupported image block. Native and nested PTC dispatch use the same delivery
and policy path. Legacy saved results remain renderable.

Display the chosen image inline when requested. Use `present` when a separate
original-file deliverable is useful. Previews can be normalized or re-encoded;
use the original output file for a byte-exact download.

## Execution and safety

1. Snapshot the enabled provider and timeout for the accepted call.
2. When `imagePaths` is present, read images through the **calling agent's
   filesystem**. Never fall back to Host FS if an isolated caller denies or lacks
   its own FS. Input files are not overwritten.
3. Enforce per-image byte/pixel limits and a total input byte cap equal to the
   smaller of the deployment message-image limit and 32 MiB. Preserve input
   order and fully decode every reference before authentication or the POST.
4. Send one authenticated request. Without images, Codex uses
   `/backend-api/codex/images/generations`. With images, it uses
   `/backend-api/codex/images/edits` and JSON `images[].image_url` data URLs.
   These are internal routing categories, not two public tools.
5. Fully validate the output, then save its preview and byte-exact original file.

Reference bytes, credentials and raw backend errors are not returned. The tool
uses the current DSH-managed login and its refresh lock; it does not select a
different pooled account or switch billing to the public API.

Empty/over-count inputs use `IMAGE_INVALID_INPUT`; unreadable, corrupt,
unsupported or oversized references use `IMAGE_REFERENCE_INVALID`. Missing
services or invalid deployment settings use `IMAGE_CONFIG`. Missing required
parameters, wrong types and undeclared parameters use Host `INVALID_ARGS`.
None of these errors trigger text-only generation.

No automatic retry, provider/model/key fallback or duplicate generation is
performed. After submission, a timeout, cancellation or lost result may already
have consumed quota. Ending the local wait does not prove remote work stopped.
`imageTimeoutMs` defaults to 300000 ms, configurable up to 600000 ms; the declared
Host tool budget is 610000 ms. Nested `run_code` must budget for the request plus
approval waits, within the deployment maximum.

## Migration and policies

- Replace old `image_edit_codex` calls with `image_generate_codex`, keeping their
  existing `imagePaths`, `prompt` and output handling. The old tool is no longer
  registered; an attempted new call gets `UNKNOWN_TOOL`, not a silent text-only
  request. Historical image/file attachments are not rewritten or removed.
- The unpublished early prototype used `referencedImagePaths`; replace that field
  with `imagePaths`. Neither the old spelling nor an `images` HTTP field is
  accepted as a public tool argument.
- Update per-tool allow/deny rules to `image_generate_codex`. A denial now covers
  **both** text-only and reference requests. Deployments that previously allowed
  the generation name but denied only the edit name must reassess that rule.
  There is intentionally no separate edit-tool policy name after consolidation.
- The Codex image switch enables/removes one tool covering both input modes.
  Z.AI switches remain text-only. All-off registers no image tools. Existing
  accepted requests retain their snapshot and drain; later dispatches obey the
  new selection. Native/PTC presentation is unchanged.

## Activation and verification

The Host owns the public raw config schema and volatile values. Its internal
image child shares the already-validated live references rather than validating
boxes again as raw arrays/numbers. The 0.6.3 fixes for cold activation, exact
parent-fiber Loader event targeting and lifecycle cleanup remain in place.

A Running package card alone does not prove tool activation. Check actual global
and agent schemas: 0.6.4 should show `image_generate_codex` with optional
`imagePaths`, and no `image_edit_codex`. Old DSH builds may require a service
restart or an explicitly managed child remount after replacing package code;
then refresh the existing Web URL. Settings updates and code updates are
separate lifecycle events.

Offline tests cover omitted versus invalid reference fields, single/multi-image
ordering, exactly one HTTP endpoint per call, unchanged result shape, real image
decoding, byte-exact persistence, caller-FS isolation, no retry/fallback, Host
registry guards, parent-filtered hot toggles and teardown. Tests use fake
transport and consume no image quota.

Two real sequential reference requests on 2026-10-20 verified the earlier
transport path (two images, then one). Both returned 1536×1024 PNGs and were read
back. One was rejected because it changed an emblem and English text, and even
the selected result contained reconstructed face detail. This is not evidence of
perfect likeness, exact typography, pixel preservation or universal endpoint
parameter compliance. The unified 0.6.4 entry must additionally be checked after
installation; report real endpoint acceptance separately from offline tests.
