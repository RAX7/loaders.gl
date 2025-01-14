# ImageLoader

An image loader that works under both Node.js (requires `@loaders.gl/polyfills`) and the browser.

| Loader         | Characteristic                                                   |
| -------------- | ---------------------------------------------------------------- |
| File Extension | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`, `.svg` |
| File Type      | Binary                                                           |
| File Format    | Image                                                            |
| Data Format    | `ImageBitmap`, `Image` (older browsers) or ndarray (node.js)     |
| Supported APIs | `load`, `parse`                                                  |

## Usage

```js
import '@loaders.gl/polyfills'; // only needed if using under Node
import {ImageLoader} from '@loaders.gl/images';
import {load} from '@loaders.gl/core';

const image = await load(url, ImageLoader, options);
```

## Options

| Option         | Type    | Default  | Description                                                                  |
| -------------- | ------- | -------- | ---------------------------------------------------------------------------- |
| `image.type`   | String  | `'auto'` | Set to `imagebitmap`, `html` or `ndarray` to control type of returned image. |
| `image.decode` | boolean | `true`   | Ensures `html` type images are fully decoded before promise resolves.        |

In addition, for `imagebitmap` type images, it is possible to pass through options to [`createImageBitmap`](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap) to control image extraction, via the separate `options.imagebitmap` object.

| Option                             | Type   | Default     | Description                                                                                                                   |
| ---------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `imagebitmap.imageOrientation`     | string | `'none'`    | image should be flipped vertically. Either `'none'` or `'flipY'`.                                                             |
| `imagebitmap.premultiplyAlpha`     | string | `'default'` | Premultiply color channels by the alpha channel. One of `'none'`, `'premultiply'`, or `'default'`.                            |
| `imagebitmap.colorSpaceConversion` | string | `'default'` | Decode using color space conversion. Either `'none'` or `'default'` default indicates implementation-specific behavior.       |
| `imagebitmap.resizeWidth`          | number | -           | Output image width.                                                                                                           |
| `imagebitmap.resizeHeight`         | number | -           | Output image height.                                                                                                          |
| `imagebitmap.resizeQuality`        | string | `'low'`     | Algorithm to be used for resizing the input to match the output dimensions. One of pixelated, low (default), medium, or high. |

Portability note: The exact set of `imagebitmap` options supported may depend on the browser, and also do not apply to `html` or `ndarray` images.

## Remarks

- While generic, the `ImageLoader` is designed with WebGL applications in mind, ensuring that loaded image data can be used to create a `WebGLTexture` both in the browser and in headless gl under Node.js
- Node.js support requires import `@loaders.gl/polyfills` before installing this module.
