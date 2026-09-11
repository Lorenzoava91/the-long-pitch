import { heicTo } from 'heic-to/next';

// A disposable worker keeps decoding off the editor thread and lets Cancel
// release the decoder and its memory, including the library's child worker.
self.onmessage = async ({ data: file }) => {
  try {
    const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
