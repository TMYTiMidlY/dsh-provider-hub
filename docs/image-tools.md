# Image tools: generate and edit

Provider Hub exposes a small, consistent image-tool family. Names follow
`image_<action>_<provider>`; the action describes the input and operation, not
an implementation detail or an output format.

| Tool | Input | Identity / billing |
|---|---|---|
| `image_generate_codex` | Text only | Current ChatGPT / Codex login |
| `image_edit_codex` | Text plus 1–5 local images | Same current login |
| `image_generate_zai` | Text only | International Z.AI standard paid image API |
| `image_generate_zai_cn` | Text only | Domestic Zhipu standard paid image API |

Each call returns **one image**. Enabled providers are alternatives, not an
automatic batch or fallback chain. No tool silently turns an edit into a new
text-only generation. Unknown parameters are rejected rather than ignored.

## Shared inputs

- `prompt` — required description of the requested output. For editing, say what
  changes, what stays unchanged, and what each input image contributes.
- `aspectRatio` — optional hint: `auto` (default), `1:1`, `3:2`, `2:3`, `16:9`,
  or `9:16`. This is not an exact size guarantee.
- `background` — Codex only: `auto` (default), `opaque`, or `transparent`.
- `imagePaths` — **edit only**, required ordered list of 1–5 local PNG, JPEG, or
  WebP files. Put the image being edited first; then add optional references.
  Relative paths use the session working directory. Absolute paths must still
  be readable in the caller's execution world.

No model override, resolution, quality, output-directory, batch-count or mask
parameter is exposed. The output filename and durable attachment storage are
owned by the tool. Remote URLs, data URLs, and raw base64 are not accepted as
`imagePaths`; the tool reads and encodes the validated local bytes itself.
The unpublished local editing prototype, temporarily labeled 0.6.2, used
`referencedImagePaths`; 0.6.3 uses `imagePaths`. Update those local callers instead
of supplying both names. The separately published 0.6.2 account-safety update did
not expose the editing tool.

### Text-to-image example

Call `image_generate_codex`:

```json
{
  "prompt": "A natural daylight photograph of a green teapot on a pale desk, no text.",
  "aspectRatio": "3:2",
  "background": "opaque"
}
```

### Reference-image edit example

Call `image_edit_codex`:

```json
{
  "prompt": "Make the teapot in the first image orange while retaining its shape and the composition. Use the second image for lighting only.",
  "imagePaths": ["photos/teapot.jpg", "photos/lighting-reference.jpg"],
  "aspectRatio": "3:2",
  "background": "opaque"
}
```

Both tools use the same style of parameters; editing only adds the input images.
There is no additional `operation` switch to remember or an ambiguous empty
image array that could fall back to generation.

## Shared result

Every image tool returns the same fields:

| Field | Meaning |
|---|---|
| `provider` | The provider actually used |
| `operation` | `generate` or `edit` |
| `referenceCount` | Number of input images; `0` for generation |
| `aspectRatio` | Requested ratio hint, or `auto` |
| `image` | Durable normalized **output preview** with attachment ID, media type, byte size and dimensions |
| `original` | Durable **output file**, preserving the returned bytes exactly: attachment ID, filename and byte size |
| `originalPath` | Optional output-file path readable in the caller's execution world |
| `imageForModel` | Whether the tool result includes an image block for the current model |
| `aspectWarning` | Optional requested/actual aspect warning for a visible deviation |

`original` means the service's original **output bytes**, not the user's input
photo. These existing field names remain stable for current consumers. All
results include a file attachment; image-capable conversation models also get a
preview image block. Pure-text models get the file handle without an unsupported
image block. Nested PTC forwarding uses the same Host delivery path as generation.
Legacy results that predate the operation fields remain renderable.

Read back the output before delivery. For edits, compare it with the actual input
and check both the requested change and unintended changes. Display the chosen
image inline when the user wants to see it directly; use `present` when a separate
original-file deliverable is useful. A preview can be normalized or re-encoded;
use the original output file for a byte-exact download.

## Execution and safety

1. Snapshot the enabled provider and timeout settings for the accepted call.
2. For edits, read input images through the **calling agent's filesystem**. Do not
   fall back to the Host filesystem when an isolated caller denies or lacks FS.
3. Enforce per-image byte/pixel limits and a total encoded-input byte cap equal to
   the smaller of the deployment message-image limit and 32 MiB. Fully decode and
   validate all images before authentication or the image POST.
4. Send one authenticated request to the selected first-party endpoint. Codex
   generation uses `/backend-api/codex/images/generations`; editing uses
   `/backend-api/codex/images/edits` with JSON `images[].image_url` data URLs.
5. Validate the output before saving its preview and original-file attachments.

Input files are never overwritten. Reference bytes, credentials and raw backend
errors are not returned in the result. The tool uses the current DSH-managed
Codex login and its existing refresh lock; it does not choose another pooled
account or switch billing to the public API.

A missing, unreadable, corrupt or oversized input fails before the image request;
errors use `IMAGE_INVALID_INPUT`, `IMAGE_REFERENCE_INVALID` or `IMAGE_CONFIG` as
appropriate. Schema errors such as missing required parameters, wrong types or
undeclared parameters use the Host's `INVALID_ARGS` code. These failures never
trigger text-only generation.

There is no automatic retry, provider/model/key fallback or duplicate generation.
After submission, a timeout, cancellation or lost result may already have
consumed quota. A caller ending its wait does not prove that remote work stopped.
The normal `imageTimeoutMs` default is 300000 ms, configurable up to 600000 ms;
the declared Host tool budget is 610000 ms. Nested `run_code` must budget for the
image request plus approval waits, within the deployment maximum.

## Settings, activation and hot updates

The Codex image switch enables or removes **both** `image_generate_codex` and
`image_edit_codex`. The two Z.AI switches remain generation-only. All-off registers
no image tools. Existing accepted requests retain their snapshot and drain; later
dispatches obey the new selection. Normal per-agent allow/deny masks and native /
PTC presentation still apply.

The Host entry owns the public raw configuration schema and its volatile values.
Its internal image child must share those already-validated live references,
not pass the wrapper objects through an array/number schema a second time. The
0.6.3 activation fix retains the standalone images module's raw-value schema
while avoiding this nested revalidation. Volatile-update listeners are owned by
the parent Hub fiber (the exact target selected by Loader), and are removed when
the child unloads. Cold mounting, parent-filtered hot toggles, and cleanup are
covered against real Cordis and ToolRuntime.

A Running package card or an installed version alone does not prove that its
image child activated. Verify the actual tool registry or effective agent
schemas. On older DSH builds that do not reload replaced package code, arrange a
service restart after updating the package, then refresh the existing Web URL.
Settings hot updates and package-code updates are different lifecycle events.

## Verification scope

Offline tests cover generation/edit contract parity, distinct ordered reference
bytes, missing/invalid/oversized inputs, real image decoding and byte-exact
persistence, caller filesystem isolation, no retry/fallback, real registry guards,
volatile child activation, repeated toggles and teardown. They use fake transport
and do not consume image quota.

On 2026-10-20, the installed 0.6.2 editing implementation also completed two real
Codex edits sequentially (two references, then one), each producing a 1536×1024
PNG. Each result was read back before the next request. The second changed a
podium emblem and English text and was rejected; the first was selected but still
contained reconstructed face detail. This verifies a limited live edit path,
**not** perfect identity preservation, unchanged pixels, exact typography,
multi-provider editing, or universal endpoint parameter compliance. The final
0.6.3 interface and Host activation changes are separately regression-tested and
verified after installation; those checks should not need another paid image.
